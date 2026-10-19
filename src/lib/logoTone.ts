import { useCallback, useState, type SyntheticEvent } from 'react'

// Halo claro solo para los logos oscuros. Un logo negro (Severance) casi no se lee sobre el fondo oscuro y
// lleva un halo blanco; uno claro (Spider-Man, Matrix) va solo con la sombra negra suave. El tono se mide
// en el aparato: el logo se dibuja chico en un canvas y se cuenta qué parte de lo opaco se lee sobre el
// fondo. Se guarda por URL (memoria y localStorage) para no medirlo dos veces.
//
// El <img> que se ve NO se pide con CORS: metahub a veces responde sin `access-control-allow-origin` (copias
// viejas de su CDN, como el logo de Spider-Man: Brand New Day) y con `crossorigin` ese logo no cargaría.
// Cuando el <img> ya cargó se pide la misma URL con CORS: sale de la caché HTTP del navegador (no se baja
// de nuevo). Si esa copia no trae CORS, se prueba una vez en `live.metahub.space` (ver `retryUrl`).

export type LogoTone = 'dark' | 'light'

/** Fondo de referencia: `--bg` del tema (#0b0b10). Las portadas y tarjetas lo oscurecen hacia ahí. */
const BG_RGB = [0x0b, 0x0b, 0x10] as const
/** Contraste mínimo para que un píxel "se lea" (WCAG 1.4.11: gráficos y texto grande, 3:1). */
export const MIN_CONTRAST = 3
/**
 * Parte de lo opaco que tiene que leerse para que el logo cuente como claro. Medido en Chromium con 46
 * logos de metahub: los oscuros dan 0–0,10 (Severance 0, Blade Runner 2049 0,02, House of the Dragon 0,10),
 * Dune (letras grises finas) 0,29 y The Batman (rojo oscuro) 0,32 llevan halo; Spider-Man (rojo con mucho
 * borde azul oscuro) da 0,43, The Witcher 0,41, Wednesday 0,48 y el resto, más de 0,6: sin halo.
 */
export const LIGHT_SHARE = 0.35
/** Un píxel cuenta si es al menos medio opaco (los bordes suavizados casi transparentes no). */
export const MIN_ALPHA = 128
/** Con menos píxeles opacos que esto (imagen vacía o casi) no se decide: va el valor seguro. */
export const MIN_PIXELS = 40
/** Lado más largo del dibujo de prueba: un logo de 800×310 queda en 128×50 (6400 píxeles, nada). */
export const SAMPLE_SIZE = 128
/**
 * Valor seguro cuando no se puede medir (otro sitio sin CORS, canvas "tainted", imagen vacía o que no
 * carga): con halo. Así un logo nunca queda ilegible; en uno claro el halo apenas se nota (todos lo
 * llevaban hasta la v0.27).
 */
export const FALLBACK_TONE: LogoTone = 'dark'

const toLinear = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/** Luminancia relativa (WCAG) de un color sRGB de 0–255. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

const BG_LUM = relativeLuminance(...BG_RGB)
/** Luminancia desde la que un píxel tiene `MIN_CONTRAST` contra el fondo. */
const MIN_LUM = MIN_CONTRAST * (BG_LUM + 0.05) - 0.05

/**
 * Tono de un logo a partir de sus píxeles RGBA (lo que da `getImageData`). Solo cuentan los opacos:
 * es claro si al menos `LIGHT_SHARE` de ellos tiene contraste 3:1 contra el fondo oscuro. Sin píxeles
 * suficientes devuelve `undefined` (no se sabe).
 */
export function classifyLogoPixels(data: ArrayLike<number>): LogoTone | undefined {
  let opaque = 0
  let readable = 0
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < MIN_ALPHA) continue
    opaque++
    if (relativeLuminance(data[i], data[i + 1], data[i + 2]) >= MIN_LUM) readable++
  }
  if (opaque < MIN_PIXELS) return undefined
  return readable / opaque >= LIGHT_SHARE ? 'light' : 'dark'
}

/** Sitios de logos con CORS (`access-control-allow-origin: *`): solo ahí se puede leer el canvas. */
const CORS_HOSTS = /(^|\.)metahub\.space$|^image\.tmdb\.org$/

/** Si el tono de este logo se puede medir (https y de un sitio con CORS). */
export function canMeasureLogo(src: string | undefined): boolean {
  if (!src) return false
  try {
    const url = new URL(src)
    return url.protocol === 'https:' && CORS_HOSTS.test(url.hostname)
  } catch {
    return false
  }
}

const METAHUB_LIVE = 'live.metahub.space'

/**
 * Otra copia del mismo logo para cuando la primera no se puede leer con CORS: el mismo camino en
 * `live.metahub.space`. `images.metahub.space` a veces redirige ahí con un 307 sin CORS (el navegador corta
 * el pedido; como el <img> ya siguió la redirección, la copia de `live` sale de la caché) y a veces responde
 * 200 sin `access-control-allow-origin`. Con otra query no sirve: la CDN lo repite y el navegador lo
 * rechaza igual. Para otros sitios no hay reintento.
 */
export function retryUrl(src: string): string | undefined {
  try {
    const url = new URL(src)
    if (!/(^|\.)metahub\.space$/.test(url.hostname) || url.hostname === METAHUB_LIVE) return undefined
    url.hostname = METAHUB_LIVE
    return url.toString()
  } catch {
    return undefined
  }
}

// ---------- Caché por URL ----------

const STORAGE_KEY = 'sp-logo-tone'
/** Cuántos tonos se guardan como mucho (los más viejos se van primero): ~30 KB. */
export const STORAGE_MAX = 400
const memory = new Map<string, LogoTone>()
let stored: Record<string, 'd' | 'l'> | undefined
let saveTimer: ReturnType<typeof setTimeout> | undefined

function storedTones(): Record<string, 'd' | 'l'> {
  if (stored) return stored
  stored = {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : undefined
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (v === 'd' || v === 'l') stored[k] = v
    }
  } catch {
    // Sin localStorage (ventana privada, bloqueado) o con basura: queda solo la memoria.
  }
  return stored
}

function scheduleSave() {
  if (saveTimer !== undefined) return
  saveTimer = setTimeout(() => {
    saveTimer = undefined
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storedTones()))
    } catch {
      // Cuota llena o bloqueado: no pasa nada, se vuelve a medir.
    }
  }, 1000)
}

/** Tono ya conocido de un logo (medido en esta sesión o guardado de antes). */
export function cachedLogoTone(src: string): LogoTone | undefined {
  const mem = memory.get(src)
  if (mem) return mem
  const s = storedTones()[src]
  if (!s) return undefined
  const tone: LogoTone = s === 'd' ? 'dark' : 'light'
  memory.set(src, tone)
  return tone
}

/** Anota el tono. `persist` = medido de verdad (el valor seguro por una falla queda solo en memoria). */
export function rememberLogoTone(src: string, tone: LogoTone, persist: boolean) {
  memory.set(src, tone)
  if (!persist) return
  const s = storedTones()
  delete s[src]
  s[src] = tone === 'dark' ? 'd' : 'l'
  const keys = Object.keys(s)
  for (let i = 0; i < keys.length - STORAGE_MAX; i++) delete s[keys[i]]
  scheduleSave()
}

// ---------- Medir ----------

let canvas: HTMLCanvasElement | undefined

/** Píxeles del logo ya cargado (con CORS), dibujado chico. Tira si el canvas quedó "tainted". */
function pixelsOf(img: HTMLImageElement): Uint8ClampedArray | undefined {
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) return undefined
  const scale = Math.min(1, SAMPLE_SIZE / Math.max(w, h))
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))
  canvas ??= document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return undefined
  ctx.clearRect(0, 0, cw, ch)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, cw, ch)
  return ctx.getImageData(0, 0, cw, ch).data
}

/** Carga `url` con CORS y devuelve sus píxeles; `undefined` si no carga o no se puede leer. */
function loadPixels(url: string): Promise<Uint8ClampedArray | undefined> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      try {
        resolve(pixelsOf(img))
      } catch {
        resolve(undefined)
      }
    }
    img.onerror = () => resolve(undefined)
    img.src = url
  })
}

const inFlight = new Map<string, Promise<LogoTone>>()

/**
 * Tono del logo `src` (de la caché o medido). Conviene llamarla cuando el <img> ya cargó: así el pedido con
 * CORS sale de la caché HTTP. Nunca falla: sin poder medir, `FALLBACK_TONE`.
 */
export function measureLogoTone(src: string): Promise<LogoTone> {
  const known = cachedLogoTone(src)
  if (known) return Promise.resolve(known)
  if (!canMeasureLogo(src)) return Promise.resolve(FALLBACK_TONE)
  let job = inFlight.get(src)
  if (!job) {
    job = (async () => {
      const retry = retryUrl(src)
      const pixels = (await loadPixels(src)) ?? (retry ? await loadPixels(retry) : undefined)
      const tone = pixels ? classifyLogoPixels(pixels) : undefined
      // Imagen vacía = siempre igual: se guarda. Sin poder leerla, solo en memoria (se reintenta otro día).
      rememberLogoTone(src, tone ?? FALLBACK_TONE, !!pixels)
      inFlight.delete(src)
      return tone ?? FALLBACK_TONE
    })()
    inFlight.set(src, job)
  }
  return job
}

export interface LogoToneProps {
  'data-logo-tone'?: LogoTone
  ref: (img: HTMLImageElement | null) => void
  onLoad: (e: SyntheticEvent<HTMLImageElement>) => void
}

/**
 * Props para el `<img>` de un logo: `data-logo-tone`, que el CSS usa para poner el halo solo con `dark`.
 * Con el tono guardado va desde el primer cuadro; si no, el logo aparece con la sombra suave y, si es
 * oscuro, el halo entra con una transición corta (`--logo-halo-in`) apenas se mide. En un sitio sin CORS
 * va el valor seguro (con halo) sin medir.
 */
export function useLogoTone(src: string | undefined): LogoToneProps {
  const [measured, setMeasured] = useState<{ src: string; tone: LogoTone }>()
  const measurable = canMeasureLogo(src)
  const tone = !src ? undefined : !measurable ? FALLBACK_TONE : (cachedLogoTone(src) ?? (measured?.src === src ? measured.tone : undefined))
  const start = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img || !src || !measurable || !img.complete || !img.naturalWidth) return
      // Con el `src` recién cambiado puede seguir la imagen anterior: se espera al `onLoad` de la nueva.
      if (img.currentSrc && img.currentSrc !== src) return
      measureLogoTone(src)
        .then((t) => setMeasured((m) => (m?.src === src && m.tone === t ? m : { src, tone: t })))
        .catch(() => {})
    },
    [src, measurable],
  )
  const onLoad = useCallback((e: SyntheticEvent<HTMLImageElement>) => start(e.currentTarget), [start])
  return { 'data-logo-tone': tone, ref: start, onLoad }
}

/** Solo para los tests: vacía la caché en memoria y la copia leída de localStorage. */
export function resetLogoToneCache() {
  memory.clear()
  inFlight.clear()
  stored = undefined
  if (saveTimer !== undefined) clearTimeout(saveTimer)
  saveTimer = undefined
}
