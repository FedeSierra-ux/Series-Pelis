import { episodeNumber, releaseDate } from '../../lib/upNext'
import { RESUME_MIN_S, type WatchEntry } from '../../lib/store'
import type { Video } from '../../lib/types'

// Lógica pura de la lista de episodios de la ficha (orden, estrenos, siguiente, fechas).

export { episodeNumber }

export function sortVideos(videos: Video[]): Video[] {
  return [...videos].sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (episodeNumber(a) ?? 0) - (episodeNumber(b) ?? 0))
}

/** Ya se estrenó (o no tiene fecha: se da por estrenado, así no se esconde nada por un dato que falta). */
export function isReleased(v: Video, now = Date.now()): boolean {
  const d = releaseDate(v)
  return !d || d.at <= now
}

/** El siguiente episodio ya estrenado después de `current` (los que vienen "Próximamente" se saltean). */
export function nextReleased(videos: Video[], current: Video, now = Date.now()): Video | undefined {
  const i = videos.indexOf(current)
  if (i < 0) return undefined
  for (let j = i + 1; j < videos.length; j++) if (isReleased(videos[j], now)) return videos[j]
  return undefined
}

/** Primer episodio estrenado de la primera temporada (los especiales, temporada 0, no cuentan). */
export function firstEpisode(videos: Video[], now = Date.now()): Video | undefined {
  const regular = videos.filter((v) => (v.season ?? 0) !== 0)
  return (regular.length > 0 ? regular : videos).find((v) => isReleased(v, now))
}

/**
 * Qué episodio corresponde a "Continuar": el último que se tocó si quedó a medias; si ya se terminó,
 * el siguiente estrenado después de ese; sin progreso, el primero sin ver.
 */
export function episodeToContinue(videos: Video[], progress: Record<string, WatchEntry>, now = Date.now()): Video | undefined {
  const last = videos
    .map((v) => progress[v.id])
    .filter((e): e is WatchEntry => !!e)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const lastVideo = last && videos.find((v) => v.id === last.videoId)
  if (lastVideo) return last.watched ? nextReleased(videos, lastVideo, now) : lastVideo
  // Sin progreso: el primero sin ver de las temporadas normales. Los especiales (temporada 0) van
  // primero en la lista ordenada, pero "Ver ahora" tiene que ser el piloto, no un especial.
  const unseen = (v: Video) => isReleased(v, now) && !progress[v.id]?.watched
  return videos.find((v) => (v.season ?? 0) !== 0 && unseen(v)) ?? videos.find(unseen) ?? firstEpisode(videos, now)
}

/** Con más de estas temporadas (sin contar los especiales), las pestañas pasan a un desplegable. */
export const SEASON_TABS_MAX = 6

/** ¿Las temporadas van en un desplegable ("Temporada 3 ▾") en vez de pestañas? */
export function seasonsAsDropdown(seasons: number[]): boolean {
  return seasons.filter((s) => s !== 0).length > SEASON_TABS_MAX
}

export function seasonLabel(season: number): string {
  return season === 0 ? 'Especiales' : `Temporada ${season}`
}

/**
 * Marca del episodio sugerido: "Continuar" si quedó a medias, "Siguiente" si es el que sigue a lo
 * último que viste. Sin nada visto de la serie no se marca nada (sería siempre el primero).
 */
export function episodeBadge(
  v: Video,
  suggested: Video | undefined,
  progress: Record<string, WatchEntry>,
  started: boolean,
): 'Continuar' | 'Siguiente' | undefined {
  if (!started || !suggested || v.id !== suggested.id) return undefined
  const p = progress[v.id]
  return p && !p.watched && p.position > RESUME_MIN_S ? 'Continuar' : 'Siguiente'
}

/** Fecha de estreno para mostrar ("13 oct 2026"), respetando el día tal como lo manda Cinemeta. */
export function formatReleaseDate(v: Video): string | undefined {
  const d = releaseDate(v)
  if (!d) return undefined
  return new Date(d.at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Hoy en fecha local ("2026-10-13"): `toISOString` daría el día siguiente después de las 21:00 en Argentina. */
export function localToday(d = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Los episodios de la temporada ya estrenados y si están todos vistos. */
export function seasonStatus(seasonVideos: Video[], progress: Record<string, WatchEntry>, now = Date.now()) {
  const released = seasonVideos.filter((v) => isReleased(v, now))
  const complete = released.length > 0 && released.every((v) => progress[v.id]?.watched)
  return { released, complete }
}

/**
 * v0.26 (ficha-04): el episodio que muestra el panel de fuentes mientras no se eligió ninguno, con su título.
 * Es el mismo de "Reproducir T1 E1" / "Continuar": sin nada visto, el primero; si ya la terminaste, el primero
 * para volver a verla.
 */
export function suggestedForPanel(
  suggested: Video | undefined,
  first: Video | undefined,
  progress: Record<string, WatchEntry>,
  started: boolean,
): { video: Video; kicker: string } | undefined {
  if (suggested) return { video: suggested, kicker: started ? (episodeBadge(suggested, suggested, progress, true) ?? 'Siguiente') : 'Para empezar' }
  return first && { video: first, kicker: 'Volver a ver' }
}

/** "T1 · E1 · Pilot" (sin nombre si no tiene). */
export function episodeHeading(v: Video): string {
  const name = v.title ?? v.name
  return `T${v.season ?? 0} · E${episodeNumber(v) ?? '?'}${name ? ` · ${name}` : ''}`
}

/** Un episodio de la temporada según TMDB (`/tv/{id}/season/{n}`). */
export interface SeasonEpisodeInfo {
  episode_number: number
  overview?: string
  air_date?: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Hasta cuántos días puede diferir el estreno entre Cinemeta y TMDB (husos horarios, estrenos a medianoche). */
const SAME_EPISODE_DAYS = 3

/**
 * v0.26 (ficha-11): la sinopsis en español de cada episodio de la temporada (por id de Cinemeta). Solo las que
 * TMDB tiene escritas, y si los dos dicen la fecha de estreno, tiene que coincidir (si la numeración de Cinemeta
 * y TMDB no es la misma, queda la de Cinemeta en vez de la sinopsis de otro episodio).
 */
export function overviewsByEpisode(seasonVideos: Video[], tmdbEpisodes: SeasonEpisodeInfo[] | undefined): Map<string, string> {
  const out = new Map<string, string>()
  if (!tmdbEpisodes?.length) return out
  const byNumber = new Map(tmdbEpisodes.map((e) => [e.episode_number, e]))
  for (const v of seasonVideos) {
    const n = episodeNumber(v)
    const e = n === undefined ? undefined : byNumber.get(n)
    const text = e?.overview?.trim()
    if (!e || !text) continue
    const ours = releaseDate(v)
    const m = e.air_date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(e.air_date) : null
    if (ours && m && Math.abs(new Date(+m[1], +m[2] - 1, +m[3]).getTime() - ours.at) > SAME_EPISODE_DAYS * DAY_MS) continue
    out.set(v.id, text)
  }
  return out
}
