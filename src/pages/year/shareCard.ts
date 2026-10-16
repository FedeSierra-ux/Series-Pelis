import { getDetailsByImdb, hasTmdb, tmdbImg } from '../../lib/tmdb'
import type { TitleStat, YearStats } from '../../lib/stats'
import { busiestMonth, MONTH_NAMES } from '../../lib/yearStory'

// Imagen para compartir el resumen del año (1080×1920, formato historia), dibujada en un canvas.

const W = 1080
const H = 1920
const PAD = 80
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

function cssVar(name: string, fallback: string) {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  } catch {
    return fallback
  }
}

/** Póster con CORS: si el servidor no lo permite (o tarda), no se usa y el canvas queda limpio para exportar. */
function loadImage(src: string | undefined, ms = 4000): Promise<HTMLImageElement | undefined> {
  if (!src) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const t = setTimeout(() => resolve(undefined), ms)
    img.onload = () => {
      clearTimeout(t)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(t)
      resolve(undefined)
    }
    img.src = src
  })
}

/**
 * Póster que se pueda dibujar en el canvas sin "ensuciarlo": los de Metahub/Cinemeta no mandan CORS,
 * así que se usan los de TMDB (si hay key); si no, queda un cuadro con la inicial.
 */
async function posterFor(t: TitleStat): Promise<string | undefined> {
  try {
    if (t.poster && new URL(t.poster).hostname === 'image.tmdb.org') return t.poster
    if (!hasTmdb() || !t.metaId.startsWith('tt')) return undefined
    const d = await Promise.race([getDetailsByImdb(t.metaId, t.type), new Promise<undefined>((r) => setTimeout(r, 4000))])
    return tmdbImg(d?.poster_path, 'w342')
  } catch {
    return undefined
  }
}

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function topTitles(s: YearStats, n = 5): TitleStat[] {
  return [...s.topSeries, ...s.topMovies].sort((a, b) => b.seconds - a.seconds).slice(0, n)
}

export function shareFacts(s: YearStats): [string, string][] {
  const facts: [string, string][] = []
  if (s.genres[0]) facts.push(['Género favorito', s.genres[0].label])
  const m = busiestMonth(s.days)
  if (m) facts.push(['Mes más activo', MONTH_NAMES[m.month][0].toUpperCase() + MONTH_NAMES[m.month].slice(1)])
  if (s.streak.days > 1) facts.push(['Racha más larga', `${s.streak.days} días seguidos`])
  if (s.busiestWeekday) facts.push(['Día favorito', s.busiestWeekday.label])
  return facts
}

export function bigNumber(s: YearStats): { value: string; unit: string } {
  const hours = s.seconds / 3600
  return hours >= 1 ? { value: Math.round(hours).toLocaleString('es-AR'), unit: 'horas de pelis y series' } : { value: String(Math.round(s.seconds / 60)), unit: 'minutos de pelis y series' }
}

export async function renderShareCard(s: YearStats): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Este navegador no puede generar la imagen')

  const bg = cssVar('--bg', '#0b0b10')
  const bg2 = cssVar('--bg-2', '#14141c')
  const text = cssVar('--text', '#f4f4f7')
  const muted = cssVar('--muted', '#9a9aae')
  const accent = cssVar('--accent', '#8b5cf6')
  const accent2 = cssVar('--accent-2', '#e11d48')

  // Fondo: oscuro con dos manchas de color del tema.
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const glow = (x: number, y: number, r: number, color: string, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalAlpha = alpha
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
    ctx.globalAlpha = 1
  }
  glow(0, 0, 1100, accent, 0.6)
  glow(W, H * 0.62, 1000, accent2, 0.45)

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = muted
  ctx.font = `700 34px ${FONT}`
  ctx.fillText('FLIX', PAD, 150)

  ctx.fillStyle = text
  ctx.font = `900 150px ${FONT}`
  ctx.fillText(`Mi ${s.year}`, PAD - 6, 320)

  const big = bigNumber(s)
  ctx.fillStyle = text
  ctx.font = `900 250px ${FONT}`
  ctx.fillText(fit(ctx, big.value, W - 2 * PAD), PAD - 10, 610)
  ctx.fillStyle = text
  ctx.font = `600 48px ${FONT}`
  ctx.fillText(big.unit + (s.approx ? ' (aprox.)' : ''), PAD, 690)

  // KPIs
  const kpis: [number, string][] = [
    [s.movies, s.movies === 1 ? 'película' : 'películas'],
    [s.episodes, s.episodes === 1 ? 'episodio' : 'episodios'],
    [s.series, s.series === 1 ? 'serie' : 'series'],
    [s.activeDays, s.activeDays === 1 ? 'día' : 'días'],
  ]
  const colW = (W - 2 * PAD) / 4
  kpis.forEach(([n, label], i) => {
    const x = PAD + i * colW
    ctx.fillStyle = text
    ctx.font = `800 84px ${FONT}`
    ctx.fillText(fit(ctx, n.toLocaleString('es-AR'), colW - 16), x, 850)
    ctx.fillStyle = muted
    ctx.font = `600 32px ${FONT}`
    ctx.fillText(label, x, 900)
  })

  // Lo más visto: pósters
  const tops = topTitles(s)
  if (tops.length) {
    ctx.fillStyle = accent
    ctx.font = `800 32px ${FONT}`
    ctx.fillText('LO MÁS VISTO', PAD, 1010)
    const pw = 160
    const ph = 240
    const gap = (W - 2 * PAD - 5 * pw) / 4
    // Con "?cors=1" no se usa la copia "opaca" que el service worker guardó para los <img> comunes.
    const corsUrl = (u?: string) => (u ? `${u}${u.includes('?') ? '&' : '?'}cors=1` : undefined)
    const imgs = await Promise.all(tops.map(async (t) => loadImage(corsUrl(await posterFor(t)))))
    tops.forEach((t, i) => {
      const x = PAD + i * (pw + gap)
      const y = 1040
      ctx.save()
      roundRect(ctx, x, y, pw, ph, 14)
      ctx.clip()
      const img = imgs[i]
      if (img) {
        // Recorte tipo "cover".
        const r = Math.max(pw / img.width, ph / img.height)
        const iw = img.width * r
        const ih = img.height * r
        ctx.drawImage(img, x + (pw - iw) / 2, y + (ph - ih) / 2, iw, ih)
      } else {
        const g = ctx.createLinearGradient(x, y, x + pw, y + ph)
        g.addColorStop(0, accent)
        g.addColorStop(1, accent2)
        ctx.fillStyle = g
        ctx.fillRect(x, y, pw, ph)
        ctx.fillStyle = text
        ctx.font = `800 64px ${FONT}`
        ctx.textAlign = 'center'
        ctx.fillText(t.name.trim().charAt(0).toUpperCase() || '?', x + pw / 2, y + ph / 2 + 22)
        ctx.textAlign = 'left'
      }
      ctx.restore()
      ctx.fillStyle = text
      ctx.font = `700 26px ${FONT}`
      ctx.fillText(fit(ctx, `${i + 1}. ${t.name}`, pw + gap - 10), x, y + ph + 40)
    })
  }

  // Datos
  const facts = shareFacts(s)
  let y = tops.length ? 1370 : 1040
  for (const [label, value] of facts) {
    ctx.fillStyle = bg2
    ctx.globalAlpha = 0.75
    roundRect(ctx, PAD, y, W - 2 * PAD, 96, 22)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = muted
    ctx.font = `600 32px ${FONT}`
    ctx.fillText(label, PAD + 32, y + 60)
    ctx.fillStyle = text
    ctx.font = `800 40px ${FONT}`
    ctx.textAlign = 'right'
    ctx.fillText(fit(ctx, value, (W - 2 * PAD) / 2), W - PAD - 32, y + 62)
    ctx.textAlign = 'left'
    y += 112
  }

  ctx.fillStyle = muted
  ctx.font = `600 30px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText('Hecho con Flix', W / 2, H - 52)
  ctx.textAlign = 'left'

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), 'image/png'))
}

export type ShareResult = 'shared' | 'downloaded' | 'cancelled'

/** Compartir con archivo si el navegador puede (celular); si no, se descarga el PNG. */
export async function shareOrDownload(blob: Blob, year: number, text: string): Promise<ShareResult> {
  const file = new File([blob], `mi-${year}-flix.png`, { type: 'image/png' })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Mi ${year} en Flix`, text })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      // Sin permiso (se perdió el gesto del usuario, por ejemplo): descargamos.
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  return 'downloaded'
}
