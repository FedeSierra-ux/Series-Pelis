// @ts-check
// Links de internet (debrid, `notWebReady`): solo a direcciones públicas. El motor escucha en 127.0.0.1 con un
// token; si aceptara cualquier URL, una página podría usarlo para leer la red de la casa (el router, otra compu).
// Se mira la IP después del DNS (y en cada redirección), nunca solo el nombre.
// Sin Referer ni Origin falsos: el pedido sale tal cual, como lo haría el navegador sin cabeceras extra.
import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

/** @param {string} ip @returns {number[] | null} */
function parseV4(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (!m) return null
  const b = m.slice(1).map(Number)
  return b.every((x) => x <= 255) ? b : null
}

/** 8 grupos de 16 bits, o null. Acepta `::` y el final en IPv4 (`::ffff:1.2.3.4`). @param {string} ip */
function parseV6(ip) {
  let s = ip.toLowerCase()
  const zone = s.indexOf('%')
  if (zone >= 0) s = s.slice(0, zone)
  if (s.includes('.')) {
    // La IPv4 del final pasa a dos grupos hex.
    const lastColon = s.lastIndexOf(':')
    const v4 = parseV4(s.slice(lastColon + 1))
    if (!v4 || lastColon < 0) return null
    s = `${s.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return null
  /** @param {string} h */
  const groups = (h) => (h === '' ? [] : h.split(':'))
  const head = groups(halves[0])
  const back = halves.length === 2 ? groups(halves[1]) : []
  if ([...head, ...back].some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null
  const known = head.length + back.length
  if (halves.length === 1 && known !== 8) return null
  if (halves.length === 2 && known > 7) return null
  const zeros = new Array(8 - known).fill(0)
  return [...head.map((g) => parseInt(g, 16)), ...zeros, ...back.map((g) => parseInt(g, 16))]
}

/** @param {number[]} b */
function privateV4(b) {
  const [a, c] = b
  return (
    a === 0 || // "esta red"
    a === 10 ||
    a === 127 ||
    (a === 100 && c >= 64 && c <= 127) || // CGNAT
    (a === 169 && c === 254) || // link-local (y la metadata de las nubes)
    (a === 172 && c >= 16 && c <= 31) ||
    (a === 192 && c === 168) ||
    (a === 192 && c === 0 && (b[2] === 0 || b[2] === 2)) ||
    (a === 192 && c === 88 && b[2] === 99) ||
    (a === 198 && (c === 18 || c === 19)) ||
    (a === 198 && c === 51 && b[2] === 100) ||
    (a === 203 && c === 0 && b[2] === 113) ||
    a >= 224 // multicast, reservadas y broadcast
  )
}

/**
 * ¿La IP es local, privada o especial? Lo que no se entiende cuenta como privado.
 * @param {string} ip
 */
export function isPrivateIp(ip) {
  const v4 = parseV4(ip)
  if (v4) return privateV4(v4)
  const g = parseV6(ip)
  if (!g) return true
  /** IPv4 metida en los últimos 32 bits. */
  const embedded = () => privateV4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255])
  if (g.slice(0, 6).every((x) => x === 0)) return true // ::, ::1 y las "compatibles" (viejas)
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return embedded() // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b) return g[2] === 1 || embedded() // NAT64 (64:ff9b:1::/48 es local)
  if (g[0] === 0x2002) return privateV4([g[1] >> 8, g[1] & 255, g[2] >> 8, g[2] & 255]) // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return true // Teredo
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true // documentación
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true // descarte
  // Lo único que sale a internet es 2000::/3 (fc00::/7, fe80::/10, ff00::/8 y el resto quedan afuera).
  return g[0] < 0x2000 || g[0] > 0x3fff
}

/**
 * ¿Se puede pedir esta URL? Solo http/https, sin usuario:clave, sin nombres locales ni IPs privadas escritas.
 * (La IP real se mira después, en `safeLookup`.)
 * @param {string} raw
 * @returns {URL}
 */
export function checkPublicUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('URL inválida')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Solo http/https')
  if (url.username || url.password) throw new Error('URL con usuario')
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '')
  if (!host) throw new Error('URL sin host')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') && !host.includes(':')) {
    throw new Error('Dirección local')
  }
  if ((net.isIP(host) || /^[\d.]+$/.test(host)) && isPrivateIp(host)) throw new Error('Dirección local')
  return url
}

/**
 * `lookup` para http/https que rechaza todo nombre con alguna IP privada (así un DNS que contesta una pública y una
 * local no sirve para colarse).
 * @type {import('node:net').LookupFunction}
 */
export function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 4)
    const list = /** @type {dns.LookupAddress[]} */ (addresses)
    if (!list.length || list.some((a) => isPrivateIp(a.address))) {
      const e = /** @type {NodeJS.ErrnoException} */ (new Error(`${hostname}: dirección local`))
      e.code = 'EFLIXPRIVATE'
      return callback(e, '', 4)
    }
    if (options.all) return /** @type {any} */ (callback)(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

const MAX_REDIRECTS = 5
const USER_AGENT = 'FlixPC'

/**
 * Pide un link de internet siguiendo las redirecciones a mano (cada salto se revisa). Devuelve la respuesta final
 * (2xx/4xx/5xx) y la URL a la que se llegó, para no repetir las redirecciones en el próximo pedido.
 * @param {string} raw
 * @param {{ method?: string, range?: string, signal?: AbortSignal, timeoutMs?: number }} [opts]
 * @returns {Promise<{ res: import('node:http').IncomingMessage, url: string }>}
 */
export async function openPublic(raw, opts = {}) {
  let url = checkPublicUrl(raw)
  for (let hop = 0; ; hop++) {
    const res = await requestOnce(url, opts)
    const code = res.statusCode ?? 0
    const loc = res.headers.location
    if (code >= 300 && code < 400 && loc) {
      res.resume()
      if (hop >= MAX_REDIRECTS) throw new Error('Demasiadas redirecciones')
      url = checkPublicUrl(new URL(loc, url).href)
      continue
    }
    return { res, url: url.href }
  }
}

/** @param {URL} url @param {{ method?: string, range?: string, signal?: AbortSignal, timeoutMs?: number }} opts */
function requestOnce(url, opts) {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http
    /** @type {Record<string, string>} */
    const headers = { 'user-agent': USER_AGENT, accept: '*/*', 'accept-encoding': 'identity' }
    if (opts.range) headers.range = opts.range
    const req = mod.request(url, { method: opts.method ?? 'GET', headers, lookup: safeLookup, signal: opts.signal, agent: false }, resolve)
    req.setTimeout(opts.timeoutMs ?? 20_000, () => req.destroy(new Error('Tiempo agotado')))
    req.on('error', reject)
    req.end()
  })
}
