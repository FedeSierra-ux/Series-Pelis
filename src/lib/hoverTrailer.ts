import { useSyncExternalStore } from 'react'
import { getMeta } from './addons'
import { saveDataOn } from './dataSaver'
import { addonsStore, settingsStore } from './store'
import { getDetails, getDetailsByImdb, hasTmdb, ORIGINAL_TRAILER, parseTmdbId, pickTrailer, tmdbImg, trailerLangScore } from './tmdb'
import type { Meta, MetaPreview } from './types'

// Tráiler al pasar por un póster: si el mouse (o el foco del control remoto) se queda ~2 s sobre una
// tarjeta, se abre una tarjeta ampliada con el tráiler de YouTube, sin sonido y con subtítulos en
// español. Hay un único tráiler a la vez para toda la app: este módulo es el que lo controla.

/** Cuánto hay que quedarse sobre el póster. */
export const HOVER_DELAY_MS = 2000
/** A partir de cuándo se empieza a buscar el tráiler (así está listo a los 2 s sin pedir nada al pasar de largo). */
export const RESOLVE_AFTER_MS = 700
/** Si el tráiler tarda más que esto en aparecer, no lo mostramos. */
const GIVE_UP_MS = 7000

export type TrailerVia = 'mouse' | 'focus'

/** Campos de tráiler que Cinemeta ya manda en los catálogos (y en la ficha). */
export type TrailerFields = Pick<Meta, 'trailers' | 'trailerStreams'>

export interface HoverTarget {
  anchor: HTMLElement
  meta: MetaPreview & TrailerFields
  via: TrailerVia
}

export interface OpenTrailer extends HoverTarget {
  ytId: string
  backdrop?: string
}

/** Id de YouTube del tráiler que trae Cinemeta (`trailerStreams` o `trailers`). */
export function trailerKeyFromMeta(meta: TrailerFields | undefined): string | undefined {
  const isId = (s: string | undefined): s is string => !!s && /^[\w-]{6,20}$/.test(s)
  const stream = meta?.trailerStreams?.find((t) => isId(t.ytId))?.ytId
  if (stream) return stream
  const list = meta?.trailers ?? []
  return (list.find((t) => t.type === 'Trailer' && isId(t.source)) ?? list.find((t) => isId(t.source)))?.source
}

/**
 * URL del reproductor de YouTube para la vista previa: arranca solo y sin sonido (los navegadores no
 * dejan reproducir con sonido sin un clic), sin controles, en loop y con subtítulos en español
 * (`cc_load_policy=1` los fuerza, `cc_lang_pref=es` elige el idioma, `hl=es` la interfaz).
 * `enablejsapi` permite activar el sonido después con postMessage.
 */
export function hoverTrailerUrl(ytId: string, origin?: string): string {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    controls: '0',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    iv_load_policy: '3',
    disablekb: '1',
    fs: '0',
    loop: '1',
    playlist: ytId,
    cc_load_policy: '1',
    cc_lang_pref: 'es',
    hl: 'es',
    enablejsapi: '1',
  })
  if (origin) params.set('origin', origin)
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(ytId)}?${params.toString()}`
}

export interface TrailerEnv {
  enabled: boolean
  saveData: boolean
  reducedMotion: boolean
  wide: boolean
  /** Mouse de verdad (hover + puntero fino). */
  finePointer: boolean
  /** Pantalla táctil como puntero principal (celular, tablet). */
  coarsePointer: boolean
}

/** Si corresponde mostrar el tráiler: nunca en táctiles, con "reducir movimiento" ni con ahorro de datos. */
export function trailerAllowed(env: TrailerEnv, via: TrailerVia): boolean {
  if (!env.enabled || env.saveData || env.reducedMotion || !env.wide || env.coarsePointer) return false
  // Con el mouse, solo si es un mouse de verdad; con el foco (teclado, control remoto de la TV) alcanza con no ser táctil.
  return via === 'mouse' ? env.finePointer : true
}

function currentEnv(): TrailerEnv {
  const mq = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches
  return {
    enabled: settingsStore.get().hoverTrailer,
    saveData: saveDataOn(),
    reducedMotion: mq('(prefers-reduced-motion: reduce)'),
    wide: mq('(min-width: 760px)'),
    finePointer: mq('(hover: hover) and (pointer: fine)'),
    coarsePointer: mq('(pointer: coarse)'),
  }
}

/** Busca el tráiler: TMDB primero (prefiere el que está en español), si no el de Cinemeta. */
export async function resolveTrailer(meta: MetaPreview & TrailerFields): Promise<{ ytId?: string; backdrop?: string }> {
  const tmdb = parseTmdbId(meta.id)
  const fromCatalog = trailerKeyFromMeta(meta)
  let backdrop = meta.background ?? (meta.id.startsWith('tt') ? `https://images.metahub.space/background/medium/${meta.id}/img` : undefined)
  if (hasTmdb() && (tmdb || meta.id.startsWith('tt'))) {
    try {
      const d = tmdb ? await getDetails(tmdb.type, tmdb.id) : await getDetailsByImdb(meta.id, meta.type)
      backdrop ??= tmdbImg(d?.backdrop_path, 'w780')
      const t = pickTrailer(d?.videos?.results, d?.original_language)
      // Un buen tráiler en español (latino, o el de España subtitulado) le gana al de Cinemeta (casi siempre en inglés).
      if (t && (trailerLangScore(t, d?.original_language) > ORIGINAL_TRAILER || !fromCatalog)) return { ytId: t.key, backdrop }
    } catch {
      // Sin TMDB seguimos con Cinemeta.
    }
  }
  if (fromCatalog) return { ytId: fromCatalog, backdrop }
  if (tmdb) return { backdrop }
  // La ficha de Cinemeta ya la precarga el póster al pasar por encima: casi siempre sale de la caché.
  const full = await getMeta(addonsStore.get(), meta.type, meta.id).catch(() => undefined)
  return { ytId: trailerKeyFromMeta(full), backdrop: backdrop ?? full?.background }
}

/** Alto aproximado de la franja de texto debajo del video, para que la tarjeta no se salga de la pantalla. */
const INFO_H = 92
/** Debajo de la barra de navegación (64 px) para no taparla. */
const MIN_TOP = 72

export interface CardPlace {
  left: number
  top: number
  width: number
}

/** La tarjeta ampliada queda centrada sobre el póster, sin salirse de la pantalla. */
export function placeCard(r: { left: number; top: number; width: number; height: number }, vw: number, vh: number): CardPlace {
  const width = Math.round(Math.min(Math.max(r.width * 2.3, 340), 520, vw - 24))
  const videoH = (width * 9) / 16
  const left = Math.min(Math.max(r.left + r.width / 2 - width / 2, 12), vw - width - 12)
  const top = Math.min(Math.max(r.top + r.height / 2 - (videoH + INFO_H) / 2, MIN_TOP), vh - videoH - INFO_H - 8)
  return { left: Math.round(left), top: Math.round(Math.max(top, MIN_TOP)), width }
}

// ---------- Estado global (un solo tráiler a la vez) ----------

let armed: HoverTarget | undefined
let open: OpenTrailer | undefined
let timers: ReturnType<typeof setTimeout>[] = []
let closeTimer: ReturnType<typeof setTimeout> | undefined
let suppressed = 0
/** Póster cuyo tráiler se cerró con Escape/Atrás: no se vuelve a armar con el mouse hasta que lo deje (v0.31, pc-02). */
let dismissed: HTMLElement | undefined
const listeners = new Set<() => void>()

/**
 * Movimiento real del mouse (puro, para los tests). Chrome manda `mouseenter` y hasta un `mousemove` con el
 * puntero quieto cuando cambia lo que hay debajo (se cerró el asistente, se cerró la tarjeta ampliada, la página
 * se movió con la rueda): el tráiler se arma solo con un `mousemove` cuyas coordenadas cambiaron. La primera
 * posición solo se anota, como hace `BrowseHero` con `still`.
 */
export function createMouseTracker() {
  let x = NaN
  let y = NaN
  return {
    /** Devuelve verdadero si el mouse se movió de verdad respecto del último `mousemove`. */
    note(nx: number, ny: number): boolean {
      const first = Number.isNaN(x)
      const moved = nx !== x || ny !== y
      x = nx
      y = ny
      return moved && !first
    },
  }
}

const mouse = createMouseTracker()

/**
 * Apaga el tráiler de los pósters mientras la pantalla tiene el suyo (Películas y Series pasan el
 * tráiler a la portada de arriba): nunca dos videos a la vez. Devuelve la función para volver a prenderlo.
 */
export function suppressHoverTrailer(): () => void {
  suppressed += 1
  closeTrailer()
  let done = false
  return () => {
    if (done) return
    done = true
    suppressed = Math.max(0, suppressed - 1)
  }
}

function emit() {
  listeners.forEach((l) => l())
}

function clearTimers() {
  timers.forEach(clearTimeout)
  timers = []
}

/**
 * El mouse se movió sobre un póster (`mousemove`): arma el tráiler solo si fue un movimiento real
 * (ver `createMouseTracker`). El `mouseenter` solo no alcanza: Chrome lo manda con el puntero quieto.
 */
export function mouseMoveTrailer(target: HoverTarget, x: number, y: number) {
  if (!mouse.note(x, y)) return
  armTrailer(target)
}

/** El mouse o el foco llegó a un póster: si se queda, a los 2 s se abre el tráiler. */
export function armTrailer(target: HoverTarget) {
  if (armed?.anchor === target.anchor) {
    // Mismo póster (por ejemplo, volvió desde la tarjeta ampliada): seguimos como estábamos.
    clearTimeout(closeTimer)
    return
  }
  // Cerrado con Escape: con el mouse encima no se reabre solo; recién al salir y volver a entrar.
  if (target.via === 'mouse' && dismissed === target.anchor) return
  dismissed = undefined
  closeTrailer()
  if (suppressed > 0 || !trailerAllowed(currentEnv(), target.via)) return
  armed = target
  const started = Date.now()
  let resolved: Promise<{ ytId?: string; backdrop?: string }> | undefined
  timers.push(
    setTimeout(() => {
      if (armed !== target) return
      resolved = resolveTrailer(target.meta)
      resolved.catch(() => {})
    }, RESOLVE_AFTER_MS),
    setTimeout(async () => {
      if (armed !== target || !resolved) return
      const res = await resolved.catch(() => undefined)
      if (armed !== target || !res?.ytId || Date.now() - started > GIVE_UP_MS) return
      // El póster puede haber desaparecido (cambio de página) o el foco haberse ido.
      if (!target.anchor.isConnected) return
      open = { ...target, ytId: res.ytId, backdrop: res.backdrop }
      emit()
    }, HOVER_DELAY_MS),
  )
}

/** El mouse o el foco se fue del póster. Con el mouse damos un respiro por si pasó a la tarjeta ampliada. */
export function disarmTrailer(anchor: HTMLElement, via?: TrailerVia) {
  if (dismissed === anchor && via !== 'focus') dismissed = undefined
  if (armed?.anchor === anchor && (!via || armed.via === via)) {
    if (open?.anchor === anchor && via === 'mouse') {
      clearTimeout(closeTimer)
      closeTimer = setTimeout(closeTrailer, 160)
      return
    }
    closeTrailer()
  }
}

/** El mouse entró a la tarjeta ampliada: que no se cierre. */
export function keepTrailer() {
  clearTimeout(closeTimer)
}

/** Cerrado por el usuario (Escape/Atrás): además de cerrar, ese póster no se rearma con el mouse hasta que lo deje. */
export function dismissTrailer() {
  dismissed = open?.anchor ?? armed?.anchor
  closeTrailer()
}

export function closeTrailer() {
  clearTimers()
  clearTimeout(closeTimer)
  armed = undefined
  if (open) {
    open = undefined
    emit()
  }
}

const getOpen = () => open
function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useOpenTrailer(): OpenTrailer | undefined {
  return useSyncExternalStore(subscribe, getOpen, getOpen)
}

/** Preferencia de sonido de esta sesión: si lo activó una vez, los siguientes intentan arrancar con sonido. */
export const trailerSound = { on: false }

/** Mensaje para el reproductor de YouTube (API de iframes vía postMessage). */
export function ytCommand(func: string, args: unknown[] = []): string {
  return JSON.stringify({ event: 'command', func, args })
}

export const YT_ORIGIN = 'https://www.youtube-nocookie.com'

/** Pide los eventos del reproductor (listo, estado, silencio). Se manda al cargar el iframe. */
export const YT_LISTEN = JSON.stringify({ event: 'listening', id: 1, channel: 'widget' })

/**
 * Estado del reproductor que viene en un mensaje de YouTube: -1 sin empezar, 0 terminó, 1 reproduciendo,
 * 2 pausado, 3 cargando, 5 en espera. Mostramos el video recién con el 1: antes (o si el navegador frenó
 * la reproducción automática) YouTube pone su botón grande de play encima.
 */
export function ytPlayerState(data: unknown): number | undefined {
  let msg: unknown = data
  if (typeof data === 'string') {
    try {
      msg = JSON.parse(data)
    } catch {
      return undefined
    }
  }
  if (!msg || typeof msg !== 'object') return undefined
  const { event, info } = msg as { event?: string; info?: unknown }
  if (event === 'onStateChange' && typeof info === 'number') return info
  if (event === 'infoDelivery' && info && typeof info === 'object') {
    const state = (info as { playerState?: unknown }).playerState
    return typeof state === 'number' ? state : undefined
  }
  return undefined
}
