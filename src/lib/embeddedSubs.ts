import { fetchWithTimeout } from './abort'
import type { MediaProbe } from './stremioServer'
import { looksForced, looksSdh, type SubOption } from './subtitlePrefs'
import { stripSdh } from './subtitles'

// v0.30.1: subtítulos que vienen dentro del video (SRT/ASS de un MKV, mov_text de un MP4) en la app de Windows. El
// motor (`desktop-app/engine/subtitles.js`) los pasa a WebVTT por tramos de 2 minutos: el reproductor pide el tramo
// donde está y, cerca del final, el siguiente, y va sumando los cues a la pista. Así se lee solo la parte del
// torrent que ya se está bajando. Los de imagen (PGS, VobSub) no se pueden pasar a texto: no se ofrecen.

/** Igual que `SUB_WINDOW_S` del motor. */
export const EMBEDDED_WINDOW_S = 120
/** A cuántos segundos del final del tramo se pide el siguiente. */
export const EMBEDDED_AHEAD_S = 30
/** ffmpeg puede esperar piezas del torrent (un salto lejos lee el índice del final del MKV). */
const WINDOW_TIMEOUT_MS = 100_000
const RETRY_MS = 5000
const MAX_TRIES = 3

/** Igual que `TEXT_SUB_CODECS` del motor. */
const TEXT_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'text'])
/** Lo que dicen las pistas en latino ("Latino", "Spanish (Latin America)", "LatAm", "es-419", "México"). */
const LATINO_TITLE = /latin|latam|\blat\b|419|m[eé]xic/i
/** …y las de España. */
const SPAIN_TITLE = /castellano|espa[ñn]a|spain|european|\beu\b|\bes-es\b/i

/** De dónde salen: el servidor (motor de la app), el video que lee y lo que dijo el probe. */
export interface VideoSubsSource {
  base: string
  mediaUrl: string
  probe: MediaProbe
}

/** Clave de la opción en el menú. */
export const videoSubKey = (index: number) => `vid:${index}`

/**
 * Idioma para el menú y la elección automática: el español latino pasa a `spl` y el de España a `spn` (así el de
 * España nunca se elige solo, igual que con los online). Sin idioma: vacío.
 */
export function videoSubLang(language: string | null | undefined, title: string | null | undefined): string {
  const lang = (language ?? '').toLowerCase()
  const t = title ?? ''
  if (/^(spa|es|esp)$|^es[-_]/.test(lang) || (!lang && /espa[ñn]ol|spanish|latino/i.test(t))) {
    if (LATINO_TITLE.test(t) || /^es[-_](419|la|mx|ar)$/.test(lang)) return 'spl'
    if (SPAIN_TITLE.test(t) || /^es[-_]es$/.test(lang)) return 'spn'
    return 'spa'
  }
  return lang
}

/**
 * Opciones del menú para las pistas de texto del video. `langName` da el nombre del idioma ("Español latino").
 */
export function videoSubOptions(probe: MediaProbe, langName: (code: string) => string): SubOption[] {
  const streams = Array.isArray(probe.streams) ? probe.streams : []
  const out: SubOption[] = []
  let k = 0
  for (const s of streams) {
    if (s.track !== 'subtitle') continue
    k++
    if (typeof s.index !== 'number' || !TEXT_CODECS.has(s.codec ?? '')) continue
    const lang = videoSubLang(s.language, s.title)
    const title = s.title?.trim() || undefined
    const name = lang ? langName(lang) : (title ?? `Pista ${k}`)
    out.push({
      id: `video-${s.index}`,
      url: videoSubKey(s.index),
      lang,
      label: `${name} (del video)`,
      embedded: s.index,
      latino: lang === 'spl' || undefined,
      forced: !!s.forced || looksForced(title) || undefined,
      sdh: !!s.sdh || looksSdh(title) || undefined,
    })
  }
  return out
}

let emptyUrl: string | undefined

/** `<track>` vacío (una URL blob para toda la página): los cues se suman después. */
export function emptyVttUrl(): string {
  emptyUrl ??= URL.createObjectURL(new Blob(['WEBVTT\n\n'], { type: 'text/vtt' }))
  return emptyUrl
}

/** URL de un tramo en el motor. */
export function videoSubWindowUrl(base: string, mediaUrl: string, index: number, n: number): string {
  return `${base.replace(/\/+$/, '')}/subtitles/${index}/${n}.vtt?${new URLSearchParams([['mediaURL', mediaUrl]])}`
}

/** Tramos que hacen falta en `t`: el actual y, cerca de su final, el siguiente (sin pasarse del final). */
export function windowsAt(t: number, duration?: number): number[] {
  if (!Number.isFinite(t) || t < 0) t = 0
  const n = Math.floor(t / EMBEDDED_WINDOW_S)
  const out = [n]
  const next = (n + 1) * EMBEDDED_WINDOW_S
  if (next - t <= EMBEDDED_AHEAD_S && !(duration !== undefined && Number.isFinite(duration) && next >= duration)) out.push(n + 1)
  return out
}

export interface ParsedCue {
  start: number
  end: number
  text: string
}

/** `[hh:]mm:ss.mmm` → segundos. */
function seconds(t: string): number {
  return t.split(':').reduce((acc, x) => acc * 60 + Number(x), 0)
}

/** Los cues de un WebVTT (sin estilos ni notas). */
export function parseVttCues(vtt: string): ParsedCue[] {
  const out: ParsedCue[] = []
  for (const block of vtt.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n')
    const i = lines.findIndex((l) => l.includes('-->'))
    if (i < 0) continue
    const m = /^\s*((?:\d+:)?\d+:\d+\.\d+)\s+-->\s+((?:\d+:)?\d+:\d+\.\d+)/.exec(lines[i])
    if (!m) continue
    const text = lines.slice(i + 1).join('\n').trim()
    const start = seconds(m[1])
    const end = seconds(m[2])
    if (!text || !(end > start)) continue
    out.push({ start, end, text })
  }
  return out
}

/**
 * Va sumando a `track` los cues de la pista `index` a medida que avanza el video (y al saltar). Devuelve la función
 * que lo frena. `onCues`: se sumaron cues (para el retraso y la altura).
 */
export function feedVideoSubs(o: {
  video: HTMLVideoElement
  track: TextTrack
  source: VideoSubsSource
  index: number
  stripSdh: boolean
  onCues: () => void
}): () => void {
  const loaded = new Set<number>()
  const tries = new Map<number, number>()
  const ctrl = new AbortController()
  let busy = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const duration = o.source.probe.format?.duration

  const pump = () => {
    if (busy || ctrl.signal.aborted) return
    const n = windowsAt(o.video.currentTime, duration).find((w) => !loaded.has(w) && (tries.get(w) ?? 0) < MAX_TRIES)
    if (n === undefined) return
    busy = true
    let ok = false
    fetchWithTimeout(videoSubWindowUrl(o.source.base, o.source.mediaUrl, o.index, n), { timeoutMs: WINDOW_TIMEOUT_MS, signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`subtítulo ${res.status}`)
        let vtt = await res.text()
        if (ctrl.signal.aborted) return
        if (o.stripSdh) vtt = stripSdh(vtt)
        for (const c of parseVttCues(vtt)) o.track.addCue(new VTTCue(c.start, c.end, c.text))
        loaded.add(n)
        ok = true
        o.onCues()
      })
      .catch(() => {
        tries.set(n, (tries.get(n) ?? 0) + 1)
        if (!ctrl.signal.aborted) timer = setTimeout(pump, RETRY_MS)
      })
      .finally(() => {
        busy = false
        // El siguiente que haga falta (al saltar, o el de más adelante). Si falló, espera al reintento.
        if (ok && !ctrl.signal.aborted) pump()
      })
  }

  o.video.addEventListener('timeupdate', pump)
  o.video.addEventListener('seeking', pump)
  pump()
  return () => {
    ctrl.abort()
    clearTimeout(timer)
    o.video.removeEventListener('timeupdate', pump)
    o.video.removeEventListener('seeking', pump)
  }
}
