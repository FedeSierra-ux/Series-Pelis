import { originalName, spanishName, type TmdbTitleLike } from '../../lib/localTitlesStore'

// v0.28: nombres de la ficha. Lo que se ve va en español latino (como Netflix Argentina); el logo sigue en el
// idioma original y, si hace falta, va el original en texto ("Título original: …"). Lógica pura para los tests.

export interface DetailNameInput {
  /** El nombre en español del mapa de `localTitles` (si ya se sabe). */
  local?: string
  /** La ficha de TMDB en es-MX (`title`/`name` en español, `original_*` y `original_language`). */
  tmdb?: TmdbTitleLike & { original_language?: string }
  /** El de Cinemeta (el que se guarda en el historial y en Mi lista). */
  cinemeta?: string
  /** El original del mapa de `localTitles`, por si la ficha de TMDB todavía no llegó. */
  storedOriginal?: string
}

export interface DetailNames {
  /** Para mostrar (h1, pestaña del navegador, `alt` del logo, tráiler). */
  name: string
  /** El original, solo si se lee distinto del nombre para mostrar. */
  original?: string
  /** Idioma del original (ISO 639-1) para el atributo `lang`; solo si vino de la ficha de TMDB. */
  originalLang?: string
}

const ARTICLE = /^(the|a|an|el|la|los|las|lo|un|una|le|les|l)\s+/

/** Para comparar nombres: sin tildes, mayúsculas, signos ni el artículo del principio ("The Matrix" = "Matrix"). */
export function titleKey(s: string | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    // Solo las tildes del alfabeto latino (el ゛ del japonés cambia la letra).
    .replace(/[\u0300-\u036f]/g, '')
    // Vuelve a componer lo demás (el coreano se separa en letras sueltas con NFD).
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(ARTICLE, '')
}

export function sameTitle(a: string | undefined, b: string | undefined): boolean {
  return titleKey(a) === titleKey(b)
}

/**
 * Nombre para mostrar: el del mapa → el `title`/`name` de la ficha de TMDB (si `spanishName` lo acepta) → Cinemeta
 * → el original. El original va aparte solo si se lee distinto.
 */
export function detailNames({ local, tmdb, cinemeta, storedOriginal }: DetailNameInput): DetailNames {
  const tmdbOriginal = originalName(tmdb)
  const name = local?.trim() || spanishName(tmdb) || cinemeta?.trim() || tmdbOriginal || storedOriginal || ''
  const original = tmdbOriginal ?? storedOriginal
  if (!original || sameTitle(original, name)) return { name }
  return { name, original, originalLang: tmdbOriginal ? tmdb?.original_language || undefined : undefined }
}

/** Lo que va debajo de un logo (que está en el idioma original). */
export interface LogoCaption {
  /** El nombre en español en texto, debajo del logo. */
  name?: string
  /** "Título original: …" (con el logo en español, el original no se ve en ningún lado). */
  original?: string
}

/**
 * Con logo: el nombre en español debajo, salvo que el logo ya lo diga. El logo dice el original o el de Cinemeta
 * (los de metahub y casi todos los de TMDB están en inglés); si es el logo en español (`logoLang = 'es'`, cuando
 * TMDB no tiene otro), va "Título original" en su lugar.
 */
export function logoCaption(names: DetailNames, cinemeta: string | undefined, logoLang: string | null | undefined): LogoCaption {
  if (logoLang === 'es') return names.original ? { original: names.original } : {}
  // Una peli argentina ("Relatos salvajes") tiene el original igual al español, pero el logo en inglés ("Wild Tales").
  const differs = cinemeta ? !sameTitle(names.name, cinemeta) : !!names.original
  return differs ? { name: names.name } : {}
}
