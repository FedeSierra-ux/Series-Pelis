import type { SubtitleStyle, TrackPref } from './store'
import type { Stream, Subtitle } from './types'

// Qué subtítulo activar solo y cómo se ven: funciones puras que usa el reproductor.

// Los addons y las pistas HLS mezclan códigos de 2 y 3 letras.
const LANG3: Record<string, string> = { es: 'spa', spl: 'spa', en: 'eng', pt: 'por', pob: 'por', fr: 'fre', fra: 'fre', de: 'ger', deu: 'ger', it: 'ita', ja: 'jpn', ko: 'kor' }
export function lang3(code?: string) {
  const c = (code ?? '').toLowerCase()
  return LANG3[c] ?? LANG3[c.split(/[-_]/)[0]] ?? c.split(/[-_]/)[0]
}
/** Posición del idioma en las preferencias (99 si no está). */
export function langRank(code: string | undefined, prefs: string[]) {
  const i = prefs.map(lang3).indexOf(lang3(code))
  return i < 0 ? 99 : i
}

/** Un subtítulo del menú: de un addon, del stream HLS o un archivo propio. */
export interface SubOption extends Subtitle {
  /** Texto para el menú (pistas HLS y archivos). */
  label?: string
  forced?: boolean
  sdh?: boolean
  /** Índice en `hls.subtitleTracks`. */
  hls?: number
  file?: boolean
}

const SDH_RE = /(^|[^a-z0-9])(sdh|cc|hearing[ ._-]?impaired|sordos)([^a-z0-9]|$)/i
/** "HI" solo en nombres: en una URL puede ser el código del hindi. */
const HI_RE = /(^|[^a-z0-9])hi([^a-z0-9]|$)/i
const FORCED_RE = /forced|forzad/i

export function looksSdh(label?: string, url?: string) {
  return (!!label && (SDH_RE.test(label) || HI_RE.test(label))) || (!!url && SDH_RE.test(url))
}
export function looksForced(...texts: (string | undefined)[]) {
  return texts.some((t) => !!t && FORCED_RE.test(t))
}

/** Subtítulo de un addon con las marcas de forzado y SDH que se deducen del id o la URL. */
export function addonSubOption(s: Subtitle): SubOption {
  return { ...s, forced: looksForced(s.id, s.url), sdh: looksSdh(s.id, s.url) }
}

export interface AutoSubContext {
  pref?: TrackPref
  autoSubtitles: boolean
  subtitleLangs: string[]
  audioLangs: string[]
  /** Idioma del audio que suena (si se sabe). */
  audioLang?: string
  hideSdh: boolean
}

/** Idiomas de audio en orden: el elegido para este título primero. */
export function audioPrefs(pref: TrackPref | undefined, audioLangs: string[]) {
  return pref?.audioLang ? [pref.audioLang, ...audioLangs.filter((l) => lang3(l) !== pref.audioLang)] : audioLangs
}

/** Rango del forzado automático: cualquier subtítulo completo elegido por las reglas le gana. */
export const FORCED_RANK = 90

/**
 * Subtítulo para activar solo, con su prioridad (menor = mejor; si después llega uno mejor,
 * se cambia). Orden: lo elegido para este título, los idiomas de Ajustes (si están activados)
 * y por último los forzados en el idioma del audio.
 */
export function autoSubtitle(options: SubOption[], ctx: AutoSubContext): { option: SubOption; rank: number } | undefined {
  const usable = options.filter((o) => !o.file && !(ctx.hideSdh && o.sdh))
  const { pref } = ctx

  if (pref?.subLang && !pref.subOff) {
    const same = usable.filter((o) => lang3(o.lang) === pref.subLang)
    const pick = same.find((o) => !!o.forced === !!pref.subForced) ?? same[0]
    if (pick) return { option: pick, rank: 0 }
  }

  if (ctx.autoSubtitles && !pref?.subOff) {
    let best: { option: SubOption; rank: number } | undefined
    for (const o of usable) {
      const i = langRank(o.lang, ctx.subtitleLangs)
      if (i === 99) continue
      // Entre dos del mismo idioma, el completo antes que el forzado.
      const rank = 1 + i * 2 + (o.forced ? 1 : 0)
      if (!best || rank < best.rank) best = { option: o, rank }
    }
    if (best) return best
  }

  const audio = ctx.audioLang && lang3(ctx.audioLang)
  if (audio && langRank(audio, audioPrefs(pref, ctx.audioLangs)) < 99) {
    // Los del propio stream (HLS) primero: vienen sincronizados con el video.
    const forced = usable.filter((o) => o.forced && lang3(o.lang) === audio).sort((x, y) => Number(y.hls !== undefined) - Number(x.hls !== undefined))[0]
    if (forced) return { option: forced, rank: FORCED_RANK }
  }
  return undefined
}

const AUDIO_HINTS: [string, RegExp][] = [
  ['spa', /(^|[^a-z])(latino|castellano|español|espanol|spanish|esp|spa|lat)([^a-z]|$)/i],
  ['eng', /(^|[^a-z])(english|eng)([^a-z]|$)/i],
  ['por', /(^|[^a-z])(portugu[eê]s|dublado)([^a-z]|$)/i],
]

/**
 * Idioma del audio según lo que dice el addon ("Latino", "Castellano"…). Los streams con varios
 * audios ("Dual", "Multi") no cuentan: no se sabe cuál suena.
 */
export function guessAudioLang(s: Stream): string | undefined {
  const text = [s.name, s.title, s.description, s.behaviorHints?.filename].filter(Boolean).join(' ')
  if (/(^|[^a-z])(dual|multi)([^a-z]|$)/i.test(text)) return undefined
  const found = AUDIO_HINTS.filter(([, re]) => re.test(text)).map(([l]) => l)
  return found.length === 1 ? found[0] : undefined
}

/** Clases del estilo de subtítulos (en `.player` y en la vista previa de Ajustes). */
export function subtitleClasses(style: SubtitleStyle) {
  return [
    `sub-size-${style.size}`,
    `sub-color-${style.color}`,
    `sub-bg-${style.background}`,
    `sub-font-${style.font}`,
    `sub-pos-${style.position}`,
    style.outline ? 'sub-outline' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * Sube el cue `position` % (0 = donde lo pone el navegador). `clear` es el % de abajo que tiene que quedar
 * libre (la barra de controles cuando se ve), así el subtítulo no queda tapado.
 */
export function placeCue(cue: TextTrackCue, position: number, clear = 0) {
  if (!('line' in cue)) return
  const c = cue as VTTCue
  const line = clear > 0 ? Math.min(92 - position, 98 - clear) : position > 0 ? 92 - position : undefined
  // Solo se asigna lo que cambia: cada cambio vuelve a dibujar los subtítulos.
  if (line !== undefined) {
    if (c.snapToLines) c.snapToLines = false
    if (c.lineAlign !== 'end') c.lineAlign = 'end'
    if (c.line !== line) c.line = line
  } else if (!c.snapToLines) {
    c.snapToLines = true
    c.lineAlign = 'start'
    c.line = 'auto'
  }
}

// ---------- Nombres de idioma para el menú de subtítulos ----------

/** Códigos propios de OpenSubtitles (y parecidos) que ni `langLabel` ni Intl conocen. */
const EXTRA_LANGS: Record<string, string> = {
  spl: 'Español latino',
  spn: 'Español (España)',
  ea: 'Español latino',
  pob: 'Portugués (Brasil)',
  pom: 'Portugués (Mozambique)',
  zht: 'Chino tradicional',
  zhs: 'Chino simplificado',
  zhe: 'Chino e inglés',
  ze: 'Chino e inglés',
  mne: 'Montenegrino',
}

let displayNames: Intl.DisplayNames | null | undefined

/** Intl.DisplayNames en español; `null` si el navegador (una TV vieja) no lo tiene. */
function languageNames(): Intl.DisplayNames | null {
  if (displayNames !== undefined) return displayNames
  try {
    displayNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['es-AR', 'es'], { type: 'language' }) : null
  } catch {
    displayNames = null
  }
  return displayNames
}

/**
 * Nombre del idioma en español para un código de 2 o 3 letras ("tur" → "Turco"). Primero la tabla de la
 * app (`langLabel`), después Intl; si nadie lo conoce, el código en mayúsculas (o "Sin idioma").
 */
export function subLangName(code: string | undefined, known: (code: string) => string = (c) => c): string {
  const raw = (code ?? '').trim()
  if (!raw) return 'Sin idioma'
  const lower = raw.toLowerCase()
  const own = known(lower)
  if (own && own.toLowerCase() !== lower) return own
  if (EXTRA_LANGS[lower]) return EXTRA_LANGS[lower]
  let name: string | undefined
  try {
    name = languageNames()?.of(lower)
  } catch {
    name = undefined
  }
  if (name && name.toLowerCase() !== lower) return name.charAt(0).toLocaleUpperCase('es') + name.slice(1)
  return raw.toUpperCase()
}

export interface SubMenuLabel {
  main: string
  /** Detalle chico: "Opción 2", "Forzados", "SDH". */
  extra: string
}

/**
 * Textos del menú CC. Nunca muestra los ids internos de los addons (OpenSubtitles da números como
 * "4026007"): cuando hay varios del mismo idioma se numeran ("Opción 1", "Opción 2"…), en el orden de la lista.
 */
export function subMenuLabels(options: SubOption[], langName: (code: string) => string = (c) => subLangName(c)): SubMenuLabel[] {
  const mains = options.map((o) => o.label ?? langName(o.lang))
  const total = new Map<string, number>()
  for (const m of mains) total.set(m, (total.get(m) ?? 0) + 1)
  const seen = new Map<string, number>()
  return options.map((o, i) => {
    const main = mains[i]
    const n = (seen.get(main) ?? 0) + 1
    seen.set(main, n)
    const tags = [
      (total.get(main) ?? 0) > 1 ? `Opción ${n}` : undefined,
      o.forced && !looksForced(o.label) ? 'Forzados' : undefined,
      o.sdh && !looksSdh(o.label) ? 'SDH' : undefined,
    ].filter(Boolean)
    return { main, extra: tags.join(' · ') }
  })
}
