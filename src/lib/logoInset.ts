import { useCallback, useState, type CSSProperties } from 'react'
import { canMeasureLogo, retryUrl } from './logoTone'

// Margen transparente a la izquierda de un logo de metahub (visual-pc-05). Algunos PNG (Breaking Bad, 800×310) traen
// 50–70 px de aire antes de la primera letra: la caja del logo está alineada con el texto y las insignias, pero la
// tinta arranca más a la derecha y el título parece flotar. Se mide con un canvas chico, como el tono (`logoTone`),
// y se corre el logo a la izquierda ese porcentaje de su ancho.

/** Un píxel cuenta como tinta si es al menos algo opaco (los bordes suavizados casi invisibles no). */
export const INSET_ALPHA = 48
/** Lado más largo del dibujo de prueba (igual que el del tono). */
const SAMPLE_SIZE = 128
/** Tope: un logo con la tinta muy a la derecha (o medido mal) no sale volando. */
export const MAX_INSET = 0.4
/** Menos que esto no se corrige (da lo mismo y evita un salto de 1 px). */
export const MIN_INSET = 0.03

/**
 * Fracción del ancho (0 a `MAX_INSET`) que hay de margen transparente a la izquierda, a partir de los píxeles RGBA
 * de una imagen de `width` columnas. Sin tinta, o con un margen mínimo, 0.
 */
export function leftInsetFraction(data: ArrayLike<number>, width: number): number {
  if (!(width > 0)) return 0
  const height = Math.floor(data.length / 4 / width)
  let first = width
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < first; x++) {
      if (data[(row + x) * 4 + 3] >= INSET_ALPHA) {
        first = x
        break
      }
    }
  }
  if (first >= width) return 0
  const inset = Math.min(MAX_INSET, first / width)
  return inset < MIN_INSET ? 0 : Math.round(inset * 1000) / 1000
}

/** `transform` que corre el logo a la izquierda lo que mide su margen; sin margen, nada. */
export const insetStyle = (inset: number): CSSProperties | undefined =>
  inset > 0 ? { transform: `translateX(-${(inset * 100).toFixed(1)}%)` } : undefined

const memory = new Map<string, number>()
const inFlight = new Map<string, Promise<number>>()

function loadInset(url: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    const img = new Image()
    const timer = setTimeout(() => resolve(undefined), 8000)
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      clearTimeout(timer)
      try {
        const w = img.naturalWidth
        const h = img.naturalHeight
        if (!w || !h) return resolve(undefined)
        const scale = Math.min(1, SAMPLE_SIZE / Math.max(w, h))
        const cw = Math.max(1, Math.round(w * scale))
        const ch = Math.max(1, Math.round(h * scale))
        const canvas = document.createElement('canvas')
        canvas.width = cw
        canvas.height = ch
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(undefined)
        ctx.drawImage(img, 0, 0, cw, ch)
        resolve(leftInsetFraction(ctx.getImageData(0, 0, cw, ch).data, cw))
      } catch {
        resolve(undefined)
      }
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(undefined)
    }
    img.src = url
  })
}

/** Margen izquierdo del logo `src` (fracción del ancho). Nunca falla: si no se puede medir, 0 (queda como estaba). */
export function measureLogoInset(src: string): Promise<number> {
  const known = memory.get(src)
  if (known !== undefined) return Promise.resolve(known)
  if (!canMeasureLogo(src)) return Promise.resolve(0)
  let job = inFlight.get(src)
  if (!job) {
    job = (async () => {
      const retry = retryUrl(src)
      const inset = (await loadInset(src)) ?? (retry ? await loadInset(retry) : undefined)
      if (inset !== undefined) memory.set(src, inset)
      inFlight.delete(src)
      return inset ?? 0
    })()
    inFlight.set(src, job)
  }
  return job
}

export interface LogoInsetProps {
  style?: CSSProperties
  ref: (img: HTMLImageElement | null) => void
  onLoad: () => void
}

/** Para el `<img>` de un logo alineado a la izquierda: `style` (el corrimiento), `ref` y `onLoad` (miden al cargar). */
export function useLogoInset(src: string | undefined): LogoInsetProps {
  const [measured, setMeasured] = useState<{ src: string; inset: number }>()
  const inset = !src ? 0 : (memory.get(src) ?? (measured?.src === src ? measured.inset : 0))
  const start = useCallback(() => {
    if (!src || !canMeasureLogo(src)) return
    measureLogoInset(src)
      .then((v) => setMeasured((m) => (m?.src === src && m.inset === v ? m : { src, inset: v })))
      .catch(() => {})
  }, [src])
  const ref = useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete && img.naturalWidth) start()
    },
    [start],
  )
  return { style: insetStyle(inset), ref, onLoad: start }
}

/** Solo para los tests. */
export function resetLogoInsetCache() {
  memory.clear()
  inFlight.clear()
}
