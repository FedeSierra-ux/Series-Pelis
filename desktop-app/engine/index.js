// @ts-check
// Motor de la app de Windows: torrents + conversión, con la misma API que usa la web con Stremio Service
// (`src/pages/player/StremioPrepare.tsx`). Escucha solo en 127.0.0.1, en un puerto al azar, y todo va bajo un token
// de 128 bits: `http://127.0.0.1:<puerto>/<token>/…`. Contrato en `desktop-app/CONTRACT.md`.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { Hls } from './hls.js'
import { checkPublicUrl, openPublic } from './net.js'
import { Prober, probeResponse } from './probe.js'
import { Torrents } from './torrents.js'
import { Lru, newToken, originAllowed, parseRange, parseRoute } from './util.js'

const MAX_BODY = 64 * 1024
const MIME = /** @type {Record<string, string>} */ ({
  mkv: 'video/x-matroska', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', avi: 'video/x-msvideo',
  mov: 'video/quicktime', ts: 'video/mp2t', m2ts: 'video/mp2t', mpg: 'video/mpeg', mpeg: 'video/mpeg',
  srt: 'text/plain; charset=utf-8', vtt: 'text/vtt; charset=utf-8',
})
const M3U8 = 'application/vnd.apple.mpegurl'

/**
 * @typedef {{
 *   cacheDir: string, allowedOrigins: string[], ffmpegPath: string, ffprobePath: string, log?: (m: string) => void,
 *   dht?: boolean, allowLocalTrackers?: boolean,
 * }} EngineOptions
 */

/**
 * Arranca el motor. `dht` y `allowLocalTrackers` son solo para las pruebas (DHT apagado, tracker en 127.0.0.1).
 * @param {EngineOptions} opts
 * @returns {Promise<{ base: string, close: () => Promise<void> }>}
 */
export async function startEngine(opts) {
  const log = opts.log ?? (() => {})
  const cacheDir = path.resolve(opts.cacheDir)
  await fs.promises.rm(cacheDir, { recursive: true, force: true })
  await fs.promises.mkdir(cacheDir, { recursive: true })

  const token = newToken()
  const torrents = new Torrents({ cacheDir, log, dht: opts.dht, allowLocalTrackers: opts.allowLocalTrackers })
  const prober = new Prober(opts.ffprobePath)
  /** Links de internet registrados: id → URL original (y a dónde redirigió la última vez). */
  /** @type {Lru<{ url: string, final?: string }>} */
  const remotes = new Lru(64)

  const server = http.createServer()
  /** @type {Set<import('node:net').Socket>} */
  const sockets = new Set()
  server.on('connection', (s) => {
    sockets.add(s)
    s.on('close', () => sockets.delete(s))
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(undefined))
  })
  const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port
  const base = `http://127.0.0.1:${port}/${token}`
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])

  /**
   * De `mediaURL` a lo que lee ffmpeg: el propio motor (torrent) o un link de internet pasado por el motor (así se
   * revisa cada redirección).
   * @param {string} mediaURL
   * @returns {import('./hls.js').Input}
   */
  const inputFor = (mediaURL) => {
    for (const prefix of [`${base}/`, `http://localhost:${port}/${token}/`]) {
      if (mediaURL.startsWith(prefix)) {
        const r = parseRoute(new URL(mediaURL).pathname, token)
        if (!r || r.kind !== 'file') throw Object.assign(new Error('mediaURL local inválida'), { status: 400 })
        return { key: `t:${r.hash}:${r.idx}`, url: `${base}/${r.hash}/${r.idx}` }
      }
    }
    let url
    try {
      url = checkPublicUrl(mediaURL)
    } catch (err) {
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { status: 400 })
    }
    const id = createHash('sha256').update(url.href).digest('hex').slice(0, 24)
    if (!remotes.get(id)) remotes.set(id, { url: url.href })
    return { key: `u:${id}`, url: `${base}/_in/${id}` }
  }

  const hls = new Hls({ dir: path.join(cacheDir, '_hls'), ffmpegPath: opts.ffmpegPath, prober, log, inputFor })

  server.on('request', (req, res) => {
    handle(req, res).catch((err) => {
      const status = Number(err?.status) || (err?.code === 'ETIMEDOUT' ? 504 : 500)
      if (status >= 500) log(`motor: ${req.method} ${redact(req.url ?? '', token)}: ${err?.message ?? err}`)
      if (res.headersSent) res.destroy()
      else sendJson(res, status, { error: String(err?.message ?? err) })
    })
  })

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  async function handle(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    // Contra DNS rebinding: solo con el Host de 127.0.0.1/localhost.
    if (!hosts.has(String(req.headers.host ?? '').toLowerCase())) return notFound(res)
    const u = new URL(req.url ?? '/', base)
    const route = parseRoute(u.pathname, token)
    if (!route) return notFound(res)

    const origin = req.headers.origin
    if (origin !== undefined) {
      if (!originAllowed(origin, opts.allowedOrigins)) {
        res.writeHead(403).end()
        return
      }
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type')
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range')
      res.setHeader('Access-Control-Max-Age', '600')
      if (req.headers['access-control-request-private-network'] === 'true') res.setHeader('Access-Control-Allow-Private-Network', 'true')
      res.writeHead(204).end()
      return
    }

    const signal = abortOnClose(res)
    switch (route.kind) {
      case 'settings':
        return sendJson(res, 200, { values: { serverVersion: 'flix-engine' }, options: [], baseUrl: base })
      case 'create': {
        if (req.method !== 'POST') return methodNotAllowed(res)
        const body = await readJson(req)
        return sendJson(res, 200, await torrents.create(route.hash, body))
      }
      case 'stats': {
        const s = torrents.stats(route.hash)
        return s ? sendJson(res, 200, s) : notFound(res)
      }
      case 'file':
        if (req.method !== 'GET' && req.method !== 'HEAD') return methodNotAllowed(res)
        return serveTorrentFile(req, res, route.hash, route.idx)
      case 'input':
        if (req.method !== 'GET' && req.method !== 'HEAD') return methodNotAllowed(res)
        return proxyRemote(req, res, route.id, signal)
      case 'probe': {
        const mediaURL = u.searchParams.get('mediaURL')
        if (!mediaURL) return sendJson(res, 400, { error: 'Falta mediaURL' })
        const input = inputFor(mediaURL)
        const p = await prober.probe(input.key, input.url).catch((err) => {
          throw Object.assign(err, { status: 502 })
        })
        return sendJson(res, 200, probeResponse(p))
      }
      case 'master': {
        if (!u.searchParams.get('mediaURL')) return sendJson(res, 400, { error: 'Falta mediaURL' })
        const s = /** @type {NonNullable<ReturnType<Hls['session']>>} */ (hls.session(route.id, u.searchParams))
        // ffprobe puede esperar piezas del torrent: igual que las listas, cabecera temprana.
        await early(res, M3U8, () => s.master())
        return
      }
      case 'playlist': {
        const s = hls.session(route.id, u.searchParams)
        if (!s) return notFound(res)
        // Las Cues del MKV pueden estar al final del torrent: se manda la cabecera ya, así hls.js no corta a los 10 s.
        const text = await early(res, M3U8, () => s.playlist(route.track))
        if (text === null) return res.headersSent ? res.end() : notFound(res)
        return
      }
      case 'segment': {
        const s = hls.session(route.id, u.searchParams)
        if (!s) return notFound(res)
        const key = route.track
        const file = await early(res, 'video/mp2t', () => s.segment(key, route.n, signal), true)
        if (file === null && !res.headersSent) notFound(res)
        return
      }
    }
  }

  /**
   * Responde con lo que devuelva `fn`. Si tarda, manda la cabecera antes (hls.js corta a los 10 s sin respuesta) y
   * después el cuerpo. `isFile`: `fn` devuelve una ruta a mandar.
   * @param {http.ServerResponse} res
   * @param {string} type
   * @param {() => Promise<string | null>} fn
   * @param {boolean} [isFile]
   */
  async function early(res, type, fn, isFile = false) {
    const timer = setTimeout(() => {
      if (!res.headersSent && !res.destroyed) {
        res.writeHead(200, { 'Content-Type': type })
        res.flushHeaders()
      }
    }, 3000)
    let out
    try {
      out = await fn()
    } finally {
      clearTimeout(timer)
    }
    if (out === null || res.destroyed) {
      if (res.headersSent) res.destroy()
      return null
    }
    if (isFile) {
      const stat = await fs.promises.stat(out)
      if (!res.headersSent) res.writeHead(200, { 'Content-Type': type, 'Content-Length': String(stat.size) })
      await pipeline(fs.createReadStream(out), res).catch(() => {})
    } else {
      if (!res.headersSent) res.writeHead(200, { 'Content-Type': type, 'Content-Length': String(Buffer.byteLength(out)) })
      res.end(out)
    }
    return out
  }

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {string} hash
   * @param {number} idx
   */
  async function serveTorrentFile(req, res, hash, idx) {
    const got = await torrents.file(hash, idx)
    if (!got) return notFound(res)
    const { entry, file } = got
    const size = file.length
    const ext = path.extname(file.name).slice(1).toLowerCase()
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream')
    const range = parseRange(/** @type {string | undefined} */ (req.headers.range), size)
    if (range === 'invalid') {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end()
      return
    }
    const start = range ? range.start : 0
    const end = range ? range.end : size - 1
    const headers = /** @type {Record<string, string>} */ ({ 'Content-Length': String(end - start + 1) })
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`
    res.writeHead(range ? 206 : 200, headers)
    if (req.method === 'HEAD' || size === 0) {
      res.end()
      return
    }
    entry.responses.add(res)
    const touch = setInterval(() => torrents.touch(entry), 30_000)
    try {
      await pipeline(Readable.from(capped(file, start, end)), res)
    } catch {
      // El reproductor cortó (salto, cierre): normal.
    } finally {
      clearInterval(touch)
      entry.responses.delete(res)
      torrents.touch(entry)
    }
  }

  /**
   * Bytes [start, end] del archivo (webtorrent toma `end: 0` como "hasta el final": se recorta acá).
   * @param {any} file
   * @param {number} start
   * @param {number} end
   */
  async function* capped(file, start, end) {
    let left = end - start + 1
    for await (const chunk of file[Symbol.asyncIterator]({ start, end: Math.max(end, 1) })) {
      const c = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
      if (c.length >= left) {
        yield c.subarray(0, left)
        return
      }
      left -= c.length
      yield c
    }
  }

  /**
   * Link de internet, para ffmpeg/ffprobe. Se pasa el Range tal cual y se recuerda la redirección final.
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   * @param {string} id
   * @param {AbortSignal} signal
   */
  async function proxyRemote(req, res, id, signal) {
    const r = remotes.get(id)
    if (!r) return notFound(res)
    const range = typeof req.headers.range === 'string' ? req.headers.range : undefined
    let opened
    try {
      opened = await openPublic(r.final ?? r.url, { method: req.method, range, signal })
      // Un link temporal del CDN que venció: de nuevo desde el original.
      if (r.final && (opened.res.statusCode === 403 || opened.res.statusCode === 410 || opened.res.statusCode === 404)) {
        opened.res.resume()
        opened = await openPublic(r.url, { method: req.method, range, signal })
      }
    } catch (err) {
      if (signal.aborted) return
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { status: 502 })
    }
    r.final = opened.url
    const up = opened.res
    /** @type {Record<string, string>} */
    const headers = {}
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
      const v = up.headers[h]
      if (typeof v === 'string') headers[h] = v
    }
    res.writeHead(up.statusCode ?? 502, headers)
    if (req.method === 'HEAD') {
      up.resume()
      res.end()
      return
    }
    await pipeline(up, res).catch(() => {})
  }

  let closing = /** @type {Promise<void> | undefined} */ (undefined)
  const close = () => {
    closing ??= (async () => {
      hls.close()
      prober.close()
      server.close()
      for (const s of sockets) s.destroy()
      await torrents.close().catch(() => {})
      await fs.promises.rm(cacheDir, { recursive: true, force: true }).catch(() => {})
    })()
    return closing
  }

  log(`motor listo en 127.0.0.1:${port}`)
  return { base, close }
}

/** El token no va a los logs. @param {string} url @param {string} token */
function redact(url, token) {
  return url.split(token).join('<token>').replace(/mediaURL=[^&]*/, 'mediaURL=…')
}

/** @param {http.ServerResponse} res */
function abortOnClose(res) {
  const ctrl = new AbortController()
  res.on('close', () => {
    if (!res.writableFinished) ctrl.abort()
  })
  return ctrl.signal
}

/** @param {http.IncomingMessage} req */
async function readJson(req) {
  let size = 0
  /** @type {Buffer[]} */
  const chunks = []
  for await (const c of req) {
    size += c.length
    if (size > MAX_BODY) throw Object.assign(new Error('Cuerpo muy grande'), { status: 413 })
    chunks.push(c)
  }
  if (!size) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw Object.assign(new Error('JSON inválido'), { status: 400 })
  }
}

/** @param {http.ServerResponse} res @param {number} status @param {unknown} body */
function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': String(Buffer.byteLength(text)) })
  res.end(text)
}

/** @param {http.ServerResponse} res */
function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found')
}

/** @param {http.ServerResponse} res */
function methodNotAllowed(res) {
  res.writeHead(405, { Allow: 'GET, HEAD, POST, OPTIONS' }).end()
}
