// @ts-check
// Torrents con webtorrent: solo TCP + DHT + trackers (sin uTP, sin WebRTC, sin UPnP/NAT-PMP, sin LSD). Se baja solo
// el archivo elegido, priorizando lo que pide el reproductor (Range). Como mucho 2 torrents: el tercero saca al que
// se usó hace más tiempo (y borra lo bajado).
import fs from 'node:fs'
import path from 'node:path'
import { guessFileIdx } from './files.js'
import { isPrivateIp } from './net.js'
import { RM_DIR } from './util.js'

const MAX_TORRENTS = 2
const METADATA_TIMEOUT_MS = 120_000
/** Un torrent que nadie usa en este tiempo se cierra. */
const IDLE_MS = 30 * 60_000

/**
 * Trackers de `peerSearch.sources` (`tracker:<url>`). Solo udp/http/https a hosts públicos (salvo en las pruebas).
 * `dht:<hash>` no hace falta: el DHT está prendido para todos.
 * @param {unknown} sources
 * @param {boolean} [allowLocal]
 * @returns {string[]}
 */
export function trackersFrom(sources, allowLocal = false) {
  if (!Array.isArray(sources)) return []
  /** @type {string[]} */
  const out = []
  for (const s of sources) {
    if (typeof s !== 'string' || !s.startsWith('tracker:')) continue
    let u
    try {
      u = new URL(s.slice('tracker:'.length))
    } catch {
      continue
    }
    if (!['udp:', 'http:', 'https:'].includes(u.protocol)) continue
    const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    const local = host === 'localhost' || host.endsWith('.localhost') || (/^[\d.]+$|:/.test(host) && isPrivateIp(host))
    if (local && !allowLocal) continue
    if (!out.includes(u.href)) out.push(u.href)
    if (out.length >= 60) break
  }
  return out
}

/**
 * @typedef {{
 *   hash: string,
 *   torrent: any,
 *   ready: Promise<void>,
 *   selected: number,
 *   lastUse: number,
 *   responses: Set<import('node:http').ServerResponse>,
 * }} Entry
 */

export class Torrents {
  /**
   * @param {{ cacheDir: string, log: (m: string) => void, dht?: boolean, allowLocalTrackers?: boolean }} opts
   */
  constructor(opts) {
    this.opts = opts
    /** @type {Map<string, Entry>} */
    this.entries = new Map()
    /** Trackers que mandó la web por torrent (para volver a abrirlo si se cerró). @type {Map<string, string[]>} */
    this.trackers = new Map()
    /** @type {any} */
    this.client = null
    this.closed = false
    this.sweep = setInterval(() => this.closeIdle(), 60_000)
    this.sweep.unref()
  }

  async getClient() {
    if (!this.client) {
      // Recién cuando hace falta: así el firewall de Windows no pregunta hasta el primer torrent.
      const { default: WebTorrent } = await import('webtorrent')
      this.client = new WebTorrent({
        utp: false,
        natUpnp: false,
        natPmp: false,
        lsd: false,
        dht: this.opts.dht !== false,
        maxConns: 80,
      })
      this.client.on('error', (/** @type {Error} */ err) => this.opts.log(`webtorrent: ${err.message}`))
    }
    return this.client
  }

  /**
   * Abre el torrent (o devuelve el que ya está) y espera la metadata.
   * @param {string} hash
   * @param {string[]} [announce]
   */
  async open(hash, announce) {
    if (this.closed) throw new Error('motor cerrado')
    if (announce?.length) this.trackers.set(hash, announce)
    let e = this.entries.get(hash)
    if (!e) {
      const client = await this.getClient()
      if (this.closed) throw new Error('motor cerrado')
      e = this.entries.get(hash)
      if (!e) {
        while (this.entries.size >= MAX_TORRENTS) this.evictOldest()
        const dir = path.join(this.opts.cacheDir, hash)
        const torrent = client.add(`magnet:?xt=urn:btih:${hash}`, {
          announce: this.trackers.get(hash) ?? [],
          path: dir,
          deselect: true,
          destroyStoreOnDestroy: true,
        })
        const ready = new Promise((resolve, reject) => {
          if (torrent.ready) return resolve(undefined)
          torrent.once('ready', () => resolve(undefined))
          torrent.once('error', (/** @type {Error} */ err) => reject(err))
        })
        ready.catch(() => {})
        e = { hash, torrent, ready: /** @type {Promise<void>} */ (ready), selected: -1, lastUse: Date.now(), responses: new Set() }
        this.entries.set(hash, e)
        torrent.on('error', (/** @type {Error} */ err) => {
          this.opts.log(`torrent ${hash}: ${err.message}`)
          this.remove(hash)
        })
      }
    }
    e.lastUse = Date.now()
    await withTimeout(e.ready, METADATA_TIMEOUT_MS, 'Sin metadata del torrent')
    return e
  }

  /**
   * `POST /<hash>/create`.
   * @param {string} hash
   * @param {any} body
   */
  async create(hash, body) {
    const announce = trackersFrom(body?.peerSearch?.sources, this.opts.allowLocalTrackers)
    const e = await this.open(hash, announce)
    const files = e.torrent.files.map((/** @type {any} */ f) => ({ name: f.name, path: f.path, length: f.length }))
    const guess = body?.guessFileIdx
    return { infoHash: hash, guessedFileIdx: guessFileIdx(files, guess && typeof guess === 'object' ? guess : false), files }
  }

  /** `GET /<hash>/stats.json` (también mientras llega la metadata). @param {string} hash */
  stats(hash) {
    const e = this.entries.get(hash)
    if (!e) return null
    const t = e.torrent
    const file = e.selected >= 0 ? t.files?.[e.selected] : undefined
    return {
      infoHash: hash,
      name: t.name ?? null,
      peers: t.numPeers ?? 0,
      unchoked: t.wires?.filter((/** @type {any} */ w) => !w.peerChoking).length ?? 0,
      downloadSpeed: t.downloadSpeed ?? 0,
      uploadSpeed: t.uploadSpeed ?? 0,
      downloaded: t.downloaded ?? 0,
      uploaded: t.uploaded ?? 0,
      ready: !!t.ready,
      streamProgress: file ? file.progress : 0,
    }
  }

  /**
   * Archivo a servir (-1 = el video más grande). Lo deja seleccionado (se baja de a poco, en orden) y suelta el
   * anterior.
   * @param {string} hash
   * @param {number} idx
   */
  async file(hash, idx) {
    const e = await this.open(hash)
    const files = e.torrent.files
    const i = idx >= 0 ? idx : guessFileIdx(files, false)
    const file = files[i]
    if (!file) return null
    if (e.selected !== i) {
      if (e.selected >= 0) files[e.selected]?.deselect()
      file.select()
      e.selected = i
    }
    e.lastUse = Date.now()
    return { entry: e, file, idx: i }
  }

  /** Marca uso (mientras se sirve un archivo el torrent no se cierra por inactividad). @param {Entry} e */
  touch(e) {
    e.lastUse = Date.now()
  }

  evictOldest() {
    let old
    for (const e of this.entries.values()) if (!old || e.lastUse < old.lastUse) old = e
    if (old) this.remove(old.hash)
  }

  closeIdle() {
    const now = Date.now()
    for (const e of [...this.entries.values()]) {
      if (!e.responses.size && now - e.lastUse > IDLE_MS) this.remove(e.hash)
    }
  }

  /** @param {string} hash */
  remove(hash) {
    const e = this.entries.get(hash)
    if (!e) return
    this.entries.delete(hash)
    // Las respuestas que esperan piezas quedarían colgadas para siempre.
    for (const r of e.responses) r.destroy()
    e.responses.clear()
    try {
      e.torrent.destroy({ destroyStore: true }, () => {
        fs.rm(path.join(this.opts.cacheDir, hash), RM_DIR, () => {})
      })
    } catch (err) {
      this.opts.log(`torrent ${hash}: ${/** @type {Error} */ (err).message}`)
    }
  }

  async close() {
    this.closed = true
    clearInterval(this.sweep)
    for (const hash of [...this.entries.keys()]) this.remove(hash)
    const client = this.client
    this.client = null
    if (client) await new Promise((resolve) => client.destroy(() => resolve(undefined)))
  }
}

/**
 * @template T
 * @param {Promise<T>} p
 * @param {number} ms
 * @param {string} msg
 * @returns {Promise<T>}
 */
function withTimeout(p, ms, msg) {
  /** @type {NodeJS.Timeout | undefined} */
  let timer
  const t = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(msg), { code: 'ETIMEDOUT' })), ms)
  })
  return /** @type {Promise<T>} */ (Promise.race([p, t])).finally(() => clearTimeout(timer))
}
