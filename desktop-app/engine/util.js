// @ts-check
// Ayudantes puros del motor: token, rutas, Range y CORS. Sin estado, así se prueban solos.
import { randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Para borrar carpetas de la caché. En Windows un archivo abierto (ffmpeg que todavía no terminó de cerrarse, un
 * pedido que sigue leyendo) no se puede borrar y da EBUSY/EPERM: Node lo reintenta unas veces.
 */
export const RM_DIR = Object.freeze({ recursive: true, force: true, maxRetries: 10, retryDelay: 100 })

/** Token de 128 bits (32 hex) que va en todas las rutas. */
export function newToken() {
  return randomBytes(16).toString('hex')
}

/** Compara en tiempo constante (el largo no es secreto: siempre son 32 hex). */
export function sameToken(given, token) {
  if (typeof given !== 'string' || given.length !== token.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(token))
}

/**
 * @typedef {{ kind: 'create', hash: string }
 *   | { kind: 'stats', hash: string }
 *   | { kind: 'file', hash: string, idx: number }
 *   | { kind: 'probe' }
 *   | { kind: 'settings' }
 *   | { kind: 'input', id: string }
 *   | { kind: 'master', id: string }
 *   | { kind: 'playlist', id: string, track: string }
 *   | { kind: 'segment', id: string, track: string, n: number }
 *   | { kind: 'subtitle', index: number, n: number }} Route
 */

const HASH_RE = /^[0-9a-fA-F]{40}$/
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
/** `video` o `audio<i>`: una lista por pista. */
const TRACK_RE = /^(video|audio(?:0|[1-9]\d?))$/
const SEG_TRACK_RE = /^(v|a(?:0|[1-9]\d?))$/

/**
 * Ruta bajo `/<token>/…`. `null` = no existe (el servidor contesta 404, igual que con el token mal).
 * @param {string} pathname
 * @param {string} token
 * @returns {Route | null}
 */
export function parseRoute(pathname, token) {
  const parts = pathname.split('/')
  // '' / token / …
  if (parts[0] !== '' || !sameToken(parts[1], token)) return null
  const rest = parts.slice(2)
  if (rest.some((p) => p === '')) return null
  if (rest.length === 1 && rest[0] === 'settings') return { kind: 'settings' }
  if (rest[0] === 'hlsv2') {
    if (rest.length === 2 && rest[1] === 'probe') return { kind: 'probe' }
    const id = rest[1]
    if (!id || !ID_RE.test(id)) return null
    if (rest.length === 3) {
      if (rest[2] === 'master.m3u8') return { kind: 'master', id }
      const m = /^(.+)\.m3u8$/.exec(rest[2])
      if (m && TRACK_RE.test(m[1])) return { kind: 'playlist', id, track: m[1] }
      return null
    }
    if (rest.length === 4 && SEG_TRACK_RE.test(rest[2])) {
      const m = /^(0|[1-9]\d{0,5})\.ts$/.exec(rest[3])
      if (m) return { kind: 'segment', id, track: rest[2], n: Number(m[1]) }
    }
    return null
  }
  if (rest[0] === 'subtitles' && rest.length === 3 && /^(0|[1-9]\d{0,2})$/.test(rest[1])) {
    const m = /^(0|[1-9]\d{0,4})\.vtt$/.exec(rest[2])
    return m ? { kind: 'subtitle', index: Number(rest[1]), n: Number(m[1]) } : null
  }
  if (rest[0] === '_in' && rest.length === 2 && ID_RE.test(rest[1])) return { kind: 'input', id: rest[1] }
  if (rest.length === 2 && HASH_RE.test(rest[0])) {
    const hash = rest[0].toLowerCase()
    if (rest[1] === 'create') return { kind: 'create', hash }
    if (rest[1] === 'stats.json') return { kind: 'stats', hash }
    if (/^(-1|0|[1-9]\d{0,5})$/.test(rest[1])) return { kind: 'file', hash, idx: Number(rest[1]) }
  }
  return null
}

/**
 * `Range: bytes=…` de un solo tramo. `null` = sin Range (o con varios tramos: se manda todo, como permite la RFC);
 * `'invalid'` = 416.
 * @param {string | undefined} header
 * @param {number} size
 * @returns {{ start: number, end: number } | null | 'invalid'}
 */
export function parseRange(header, size) {
  if (!header) return null
  const m = /^bytes=\s*(\d*)\s*-\s*(\d*)\s*$/.exec(header.trim())
  if (!m) return header.includes(',') ? null : 'invalid'
  const [, a, b] = m
  if (a === '' && b === '') return 'invalid'
  let start
  let end
  if (a === '') {
    // Los últimos N bytes.
    const n = Number(b)
    if (n === 0) return 'invalid'
    start = Math.max(0, size - n)
    end = size - 1
  } else {
    start = Number(a)
    end = b === '' ? size - 1 : Math.min(Number(b), size - 1)
  }
  if (!Number.isSafeInteger(start) || start >= size || end < start) return 'invalid'
  return { start, end }
}

/**
 * ¿Este Origin puede leer las respuestas? Exactos (`https://series-pelis.pages.dev`) o `https://*.dominio` con una
 * sola etiqueta en el comodín (las previews de Pages: `https://<rama>.series-pelis.pages.dev`), solo https.
 * @param {string | undefined} origin
 * @param {readonly string[]} allowed
 */
export function originAllowed(origin, allowed) {
  if (!origin || origin === 'null') return false
  const o = origin.toLowerCase()
  for (const raw of allowed) {
    const a = String(raw).toLowerCase().replace(/\/+$/, '')
    if (a === o) return true
    const w = /^https:\/\/\*\.([a-z0-9.-]+)$/.exec(a)
    if (w && o.startsWith('https://') && o.endsWith(`.${w[1]}`)) {
      const label = o.slice('https://'.length, o.length - w[1].length - 1)
      if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) return true
    }
  }
  return false
}

/** Cola de pedidos a algo caro (ffprobe): el mismo pedido en vuelo se comparte. */
export class Inflight {
  constructor() {
    /** @type {Map<string, Promise<any>>} */
    this.map = new Map()
  }

  /**
   * @template T
   * @param {string} key
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  run(key, fn) {
    const cur = this.map.get(key)
    if (cur) return cur
    const p = fn().finally(() => this.map.delete(key))
    this.map.set(key, p)
    return p
  }
}

/**
 * Mapa con tope: al pasarse saca el usado hace más tiempo (`get` lo renueva).
 * @template V
 */
export class Lru {
  /** @param {number} max @param {(key: string, value: V) => void} [onEvict] */
  constructor(max, onEvict) {
    this.max = max
    this.onEvict = onEvict
    /** @type {Map<string, V>} */
    this.map = new Map()
  }

  /** @param {string} key */
  get(key) {
    const v = this.map.get(key)
    if (v !== undefined) {
      this.map.delete(key)
      this.map.set(key, v)
    }
    return v
  }

  /** @param {string} key @param {V} value */
  set(key, value) {
    this.map.delete(key)
    this.map.set(key, value)
    while (this.map.size > this.max) {
      const [k, v] = /** @type {[string, V]} */ (this.map.entries().next().value)
      this.map.delete(k)
      this.onEvict?.(k, v)
    }
  }

  /** @param {string} key */
  delete(key) {
    const v = this.map.get(key)
    this.map.delete(key)
    return v
  }
}
