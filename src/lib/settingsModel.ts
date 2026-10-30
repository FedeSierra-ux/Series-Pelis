import { playerById } from './externalPlayers'
import { SCREENSAVER_OPTIONS } from './idle'
import type { Settings } from './store'

// Validación de los ajustes (v0.34, uso-01). Lo que llega de afuera —una copia importada, lo guardado en
// IndexedDB, lo que baja de la casa— puede tener cualquier forma: un `sourceRules: null` rompía Ajustes entero y
// un `subtitleStyle: 5` daba NaN en la posición de los subtítulos. Cada campo se revisa contra su tipo y su lista
// de valores; lo que no cuadra se descarta y queda lo que ya había (el valor de fábrica o el actual). Lógica pura.

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

type Check = (v: unknown) => boolean
/** Devuelve el valor limpio, o `undefined` si no se puede usar. */
type Clean = (v: unknown) => unknown

const oneOf =
  (...allowed: readonly unknown[]): Check =>
  (v) =>
    allowed.includes(v)
const isBool: Check = (v) => typeof v === 'boolean'
const isStr: Check = (v) => typeof v === 'string'
const isNum: Check = (v) => typeof v === 'number' && Number.isFinite(v)
const nonNegative: Check = (v) => isNum(v) && (v as number) >= 0

const cleanWith =
  (check: Check): Clean =>
  (v) =>
    check(v) ? v : undefined

/** Lista de textos: lo que no es texto se saca (una lista que no es lista se descarta entera). */
const strings: Clean = (v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined)

/** Lista de valores permitidos. */
const listOf =
  (...allowed: readonly unknown[]): Clean =>
  (v) =>
    Array.isArray(v) ? v.filter((x) => allowed.includes(x)) : undefined

/** Un objeto de ajustes: cada campo con su validador; se completa con `base`. */
const objectOf =
  (fields: Record<string, Clean>): ((v: unknown, base: unknown) => unknown) =>
  (v, base) => {
    if (!isPlain(v)) return undefined
    const out: Record<string, unknown> = isPlain(base) ? { ...base } : {}
    for (const [k, clean] of Object.entries(fields)) {
      if (!(k in v)) continue
      const c = clean(v[k])
      if (c !== undefined) out[k] = c
    }
    return out
  }

const subtitleStyle = objectOf({
  size: cleanWith(oneOf('s', 'm', 'l', 'xl')),
  color: cleanWith(oneOf('white', 'yellow')),
  background: cleanWith(oneOf('none', 'light', 'semi', 'solid')),
  outline: cleanWith(isBool),
  font: cleanWith(oneOf('system', 'rounded', 'serif', 'mono')),
  position: cleanWith(oneOf(0, 10, 20)),
})

const sourceRules = objectOf({
  mode: cleanWith(oneOf('manual', 'auto')),
  rememberLast: cleanWith(isBool),
  preferredQuality: cleanWith(oneOf('any', '2160p', '1080p', '720p')),
  preferKeywords: strings,
  excludeKeywords: strings,
  maxSizeGB: cleanWith(nonNegative),
  excludeCodecs: listOf('hevc', 'av1'),
  hdr: cleanWith(oneOf('allow', 'prefer', 'exclude')),
  dedupe: cleanWith(isBool),
})

/** Validador de cada ajuste. Un campo que no está acá (o que se agregue y se olvide) se descarta: sumarlo es una línea. */
const FIELDS: { [K in keyof Settings]: Clean | ((v: unknown, base: unknown) => unknown) } = {
  streamingServerUrl: cleanWith(isStr),
  subtitleLangs: strings,
  autoSubtitles: cleanWith(isBool),
  audioLangs: strings,
  subtitleStyle,
  hideSdh: cleanWith(isBool),
  autoplayNext: cleanWith(isBool),
  skipSegments: cleanWith(oneOf('button', 'auto', 'off')),
  stillWatchingAfter: cleanWith(nonNegative),
  seekPreview: cleanWith(isBool),
  sourceRules,
  externalPlayer: (v: unknown) => (typeof v === 'string' && playerById(v) ? v : undefined),
  nativePlayer: cleanWith(isBool),
  tmdbKey: cleanWith(isStr),
  spoilerFree: cleanWith(isBool),
  spoilerUnstarted: cleanWith(isBool),
  spoilerDefaulted: cleanWith(isBool),
  langsChosen: cleanWith(isBool),
  askRatingAtEnd: cleanWith(isBool),
  posterRating: cleanWith(oneOf('on', 'below', 'off')),
  posterLabels: cleanWith(isBool),
  hoverTrailer: cleanWith(isBool),
  curatedRows: strings,
  screensaverMinutes: cleanWith(oneOf(...SCREENSAVER_OPTIONS)),
  tvMode: cleanWith(oneOf('auto', 'on', 'off')),
  showAdvanced: cleanWith(isBool),
  onboardingDone: cleanWith(isBool),
  hintsSeen: cleanWith(isBool),
  sendReports: cleanWith(isBool),
  autoSubsMigrated: cleanWith(isBool),
  // Los tamaños válidos están en `UI_SCALES` (lib/tv.ts, que depende del store): acá solo que sea un número.
  uiScale: cleanWith((v: unknown) => isNum(v) && (v as number) > 0),
}

/**
 * Pone encima de `base` los campos de `raw` que tienen el tipo y los valores correctos. Lo que sobra, lo mal
 * tipado y lo que no es un objeto se ignora; los objetos anidados se completan campo por campo.
 */
export function cleanSettings(raw: unknown, base: Settings): Settings {
  if (!isPlain(raw)) return base
  const out: Record<string, unknown> = { ...base }
  for (const key of Object.keys(FIELDS) as (keyof Settings)[]) {
    if (!(key in raw)) continue
    const clean = FIELDS[key] as (v: unknown, base: unknown) => unknown
    const c = clean(raw[key], base[key])
    if (c !== undefined) out[key] = c
  }
  return out as unknown as Settings
}

/** Los campos de los ajustes que se validan (lo usa el test para vigilar que no falte ninguno). */
export const SETTINGS_KEYS = Object.keys(FIELDS) as (keyof Settings)[]
