import type { TmdbDetails, TmdbProvider, TmdbProviders } from './tmdb'

// Pestaña "Detalles" de la ficha de una serie (v0.25): quién la creó (o la dirigió), de qué país es y
// dónde se ve en Argentina. Todo en texto (sin logos). Lógica pura, sin React, para poder probarla.

export interface PersonRef {
  /** Id de TMDB: con él, el nombre lleva a la página de la persona. Sin él (Cinemeta), a Buscar. */
  id?: number
  name: string
}

export interface PeopleFact {
  label: 'Creación' | 'Dirección'
  people: PersonRef[]
}

export interface ProviderGroup {
  label: 'Suscripción' | 'Alquiler' | 'Compra'
  names: string[]
}

export interface SeriesFacts {
  people?: PeopleFact
  countries: string[]
  providers: ProviderGroup[]
}

/** Lo que se usa de Cinemeta cuando falta TMDB (o TMDB no trae el dato). */
export interface SeriesMetaFallback {
  /** En las series, Cinemeta pone acá a quienes la crearon (los "Creators" de IMDb). */
  writer?: string[]
  /** En inglés y separado por comas: "United States, France". */
  country?: string
}

/** Cuántos directores se muestran cuando la serie no tiene "creación". */
export const MAX_DIRECTORS = 3

function uniqueBy<T>(list: T[], key: (item: T) => string | number): T[] {
  const seen = new Set<string | number>()
  return list.filter((item) => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const cleanName = (name: unknown): string => (typeof name === 'string' ? name.trim() : '')

/**
 * Directores de una serie: los de `credits.crew` (job "Director") o los del equipo agregado (`jobs`),
 * sin repetir y con los que dirigieron más episodios primero.
 */
export function seriesDirectors(d: TmdbDetails | undefined, max = MAX_DIRECTORS): PersonRef[] {
  const fromCredits = (Array.isArray(d?.credits?.crew) ? d.credits.crew : [])
    .filter((c) => c?.job === 'Director' && cleanName(c.name))
    .map((c) => ({ id: c.id, name: cleanName(c.name), episodes: 0 }))
  const fromAggregate = (Array.isArray(d?.aggregate_credits?.crew) ? d.aggregate_credits.crew : []).flatMap((c) => {
    const job = (Array.isArray(c?.jobs) ? c.jobs : []).find((j) => j?.job === 'Director')
    return job && cleanName(c.name) ? [{ id: c.id, name: cleanName(c.name), episodes: job.episode_count ?? 0 }] : []
  })
  // `sort` es estable: a igual cantidad de episodios queda el orden de TMDB.
  const all = [...fromCredits, ...fromAggregate.sort((a, b) => b.episodes - a.episodes)]
  return uniqueBy(all, (p) => p.id ?? p.name)
    .slice(0, max)
    .map(({ id, name }) => ({ id, name }))
}

/**
 * "Creación" (TMDB `created_by`); si está vacío, "Dirección" con los directores; y si TMDB no trae
 * ninguno, quienes figuran en Cinemeta (que en las series son los creadores).
 */
export function seriesPeople(d: TmdbDetails | undefined, meta?: SeriesMetaFallback): PeopleFact | undefined {
  const creators = uniqueBy(
    (Array.isArray(d?.created_by) ? d.created_by : []).filter((p) => cleanName(p?.name)).map((p) => ({ id: p.id, name: cleanName(p.name) })),
    (p) => p.id ?? p.name,
  )
  if (creators.length > 0) return { label: 'Creación', people: creators }
  const directors = seriesDirectors(d)
  if (directors.length > 0) return { label: 'Dirección', people: directors }
  const writers = uniqueBy((Array.isArray(meta?.writer) ? meta.writer : []).map(cleanName).filter(Boolean), (n) => n)
  return writers.length > 0 ? { label: 'Creación', people: writers.map((name) => ({ name })) } : undefined
}

// ---------- País ----------

/** Códigos viejos que `Intl` no conoce (o traduce mal: SU daría "Rusia") y nombres que quedan largos. */
const REGION_NAMES: Record<string, string> = {
  SU: 'Unión Soviética',
  XC: 'Checoslovaquia',
  CS: 'Checoslovaquia',
  YU: 'Yugoslavia',
  XG: 'Alemania del Este',
  DD: 'Alemania del Este',
  HK: 'Hong Kong',
  MO: 'Macao',
}

let esNames: Intl.DisplayNames | null | undefined
function displayNames(): Intl.DisplayNames | null {
  if (esNames === undefined) {
    try {
      esNames = new Intl.DisplayNames(['es'], { type: 'region' })
    } catch {
      esNames = null
    }
  }
  return esNames
}

/** "US" → "Estados Unidos". Si no se puede traducir, el nombre que mandó TMDB (o nada). */
export function countryName(code: string, fallback?: string): string | undefined {
  const cc = code.trim().toUpperCase()
  if (REGION_NAMES[cc]) return REGION_NAMES[cc]
  if (/^[A-Z]{2}$/.test(cc)) {
    try {
      const name = displayNames()?.of(cc)
      // Con un código que no conoce, `of` devuelve el mismo código.
      if (name && name !== cc) return name
    } catch {
      // Sigue con el nombre de TMDB.
    }
  }
  return cleanName(fallback) || undefined
}

const EN_ALIASES: Record<string, string> = { usa: 'US', uk: 'GB', 'soviet union': 'SU', 'west germany': 'DE', 'east germany': 'DD', czechoslovakia: 'XC', yugoslavia: 'YU' }
let enIndex: Map<string, string> | undefined
/** Nombre en inglés (el de Cinemeta) → código ISO. Se arma una sola vez con `Intl`. */
function codeFromEnglish(name: string): string | undefined {
  const key = name.trim().toLowerCase()
  if (EN_ALIASES[key]) return EN_ALIASES[key]
  if (!enIndex) {
    enIndex = new Map()
    try {
      const en = new Intl.DisplayNames(['en'], { type: 'region' })
      for (let a = 65; a <= 90; a++)
        for (let b = 65; b <= 90; b++) {
          const cc = String.fromCharCode(a, b)
          const n = en.of(cc)
          if (n && n !== cc && !enIndex.has(n.toLowerCase())) enIndex.set(n.toLowerCase(), cc)
        }
    } catch {
      // Sin `Intl.DisplayNames` no se traduce: mejor no mostrar el país en inglés.
    }
  }
  return enIndex.get(key)
}

/**
 * Países de la serie en español: `origin_country` (o, si viene vacío, `production_countries`); sin
 * TMDB, el texto de Cinemeta traducido (lo que no se reconoce se deja afuera, no va en inglés).
 */
export function seriesCountries(d: TmdbDetails | undefined, meta?: SeriesMetaFallback): string[] {
  const origin = (Array.isArray(d?.origin_country) ? d.origin_country : []).filter((c): c is string => typeof c === 'string')
  const production = Array.isArray(d?.production_countries) ? d.production_countries.filter((c) => typeof c?.iso_3166_1 === 'string') : []
  let names: (string | undefined)[]
  if (origin.length > 0) {
    names = origin.map((c) => countryName(c, production.find((p) => p.iso_3166_1 === c.toUpperCase())?.name))
  } else if (production.length > 0) {
    names = production.map((p) => countryName(p.iso_3166_1, p.name))
  } else {
    names = (typeof meta?.country === 'string' ? meta.country.split(',') : []).map((n) => {
      const cc = codeFromEnglish(n)
      return cc ? countryName(cc) : undefined
    })
  }
  return uniqueBy(names.filter((n): n is string => !!n), (n) => n)
}

// ---------- Dónde ver en Argentina ----------

const PROVIDER_GROUPS: { key: 'flatrate' | 'rent' | 'buy'; label: ProviderGroup['label'] }[] = [
  { key: 'flatrate', label: 'Suscripción' },
  { key: 'rent', label: 'Alquiler' },
  { key: 'buy', label: 'Compra' },
]

/** Plataformas por tipo (en el orden de JustWatch, sin repetir). Los grupos vacíos no van. */
export function providerGroups(p: TmdbProviders | undefined): ProviderGroup[] {
  if (!p) return []
  return PROVIDER_GROUPS.flatMap(({ key, label }) => {
    const list = (Array.isArray(p[key]) ? p[key] : []).filter((x): x is TmdbProvider => !!x && !!cleanName(x.provider_name))
    const sorted = [...list].sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999))
    const names = uniqueBy(sorted, (x) => x.provider_id ?? x.provider_name).map((x) => cleanName(x.provider_name))
    const unique = uniqueBy(names, (n) => n.toLowerCase())
    return unique.length > 0 ? [{ label, names: unique }] : []
  })
}

export function seriesFacts(d: TmdbDetails | undefined, meta?: SeriesMetaFallback, region = 'AR'): SeriesFacts {
  return {
    people: seriesPeople(d, meta),
    countries: seriesCountries(d, meta),
    providers: providerGroups(d?.['watch/providers']?.results?.[region]),
  }
}

/** ¿Hay algo para mostrar en la pestaña? (si no, la pestaña no aparece) */
export function hasSeriesDetails(facts: SeriesFacts, castCount: number): boolean {
  return castCount > 0 || !!facts.people || facts.countries.length > 0 || facts.providers.length > 0
}
