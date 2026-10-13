import { episodeNumber, releaseDate } from '../../lib/upNext'
import type { WatchEntry } from '../../lib/store'
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
  return videos.find((v) => isReleased(v, now) && !progress[v.id]?.watched) ?? firstEpisode(videos, now)
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
