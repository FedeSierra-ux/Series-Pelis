// @ts-check
// Qué sitios puede abrir la ventana de Flix y a cuáles les damos `window.flixDesktop`. Puro, sin Electron:
// lo prueba origins.test.js.

/** El sitio de siempre. El nombre viejo se queda (ver la v0.22 en CLAUDE.md). */
export const SITE_URL = 'https://series-pelis.pages.dev/'
export const SITE_ORIGIN = 'https://series-pelis.pages.dev'
/** Las previews de Cloudflare Pages: `<rama o hash>.series-pelis.pages.dev`. */
const PREVIEW_RE = /^https:\/\/[a-z0-9-]+\.series-pelis\.pages\.dev$/

/** @param {string | undefined} raw */
function parse(raw) {
  try {
    return raw ? new URL(raw) : null
  } catch {
    return null
  }
}

/**
 * La dirección que abre la ventana: `FLIX_URL` (para probar contra `npm run dev` o una preview) o el sitio.
 * Solo http/https; cualquier otra cosa se ignora.
 * @param {string | undefined} override
 */
export function startUrl(override) {
  const u = parse(override)
  return u && (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : SITE_URL
}

/**
 * Arma el chequeo de orígenes permitidos: el sitio, sus previews y el de `start` (si es otro, p. ej.
 * `http://localhost:5173`).
 * @param {string} start
 * @returns {(url: string | undefined) => boolean}
 */
export function originCheck(start) {
  const extra = parse(start)?.origin
  return (url) => {
    const origin = parse(url)?.origin
    if (!origin || origin === 'null') return false
    return origin === SITE_ORIGIN || PREVIEW_RE.test(origin) || origin === extra
  }
}

/**
 * Lo que va en `allowedOrigins` del motor (CORS). Las previews van con comodín, como dice el contrato.
 * @param {string} start
 */
export function engineOrigins(start) {
  const list = [SITE_ORIGIN, 'https://*.series-pelis.pages.dev']
  const extra = parse(start)?.origin
  if (extra && !list.includes(extra)) list.push(extra)
  return list
}

/**
 * Qué hacer con un link que sale del sitio: los http/https van al navegador; el resto (intent:, vlc:,
 * file:, javascript:…) no se abre.
 * @param {string} url
 * @returns {'external' | 'deny'}
 */
export function externalAction(url) {
  const u = parse(url)
  return u && (u.protocol === 'https:' || u.protocol === 'http:') ? 'external' : 'deny'
}

/**
 * El User-Agent: el de Chromium sin las marcas de Electron y del nombre de la app, más ` FlixPC/<versión>`.
 * Nunca `FlixApp/`: ese marca la app de Android (src/lib/native.ts).
 * @param {string} base  el que trae Electron
 * @param {string[]} appNames  `flix-desktop` (package.json) y `Flix` (productName)
 * @param {string} version
 */
export function desktopUserAgent(base, appNames, version) {
  let clean = base.replace(/ Electron\/\S+/g, '').replace(/ FlixApp\/\S+/g, '')
  for (const name of appNames) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    clean = clean.replace(new RegExp(` ${esc}/\\S+`, 'g'), '')
  }
  return `${clean.replace(/\s+/g, ' ').trim()} FlixPC/${version}`
}
