import type { Settings, WatchEntry } from './store'

// Modo sin spoilers: qué se esconde (miniaturas difuminadas y sinopsis ocultas) y qué no.
// Lógica pura; el componente que la usa está en `components/Spoiler.tsx`.

export interface EpisodePos {
  season: number
  episode: number
}

/**
 * Hasta qué episodio llegaste en cada serie (el visto más adelante, sin contar los especiales).
 * Todo lo anterior se da por visto aunque no esté marcado: si viste la T3, la T1 no es spoiler.
 */
export function furthestWatched(progress: Record<string, WatchEntry>): Map<string, EpisodePos> {
  const map = new Map<string, EpisodePos>()
  for (const e of Object.values(progress)) {
    if (!e.watched || !e.season || e.episode === undefined) continue
    const cur = map.get(e.metaId)
    if (!cur || e.season > cur.season || (e.season === cur.season && e.episode > cur.episode)) map.set(e.metaId, { season: e.season, episode: e.episode })
  }
  return map
}

/** Si ese episodio ya lo viste (o está antes del último que viste). */
export function episodeSeen(
  ep: { videoId: string; season?: number; episode?: number },
  progress: Record<string, WatchEntry>,
  furthest: EpisodePos | undefined,
): boolean {
  if (progress[ep.videoId]?.watched) return true
  if (!furthest || !ep.season || ep.episode === undefined) return false
  return ep.season < furthest.season || (ep.season === furthest.season && ep.episode <= furthest.episode)
}

/** Esconder miniatura y sinopsis de un episodio: modo activado y episodio sin ver. */
export function hideEpisode(
  settings: Pick<Settings, 'spoilerFree'>,
  ep: { videoId: string; season?: number; episode?: number },
  progress: Record<string, WatchEntry>,
  furthest: EpisodePos | undefined,
): boolean {
  return settings.spoilerFree && !episodeSeen(ep, progress, furthest)
}

/**
 * Esconder la sinopsis de un título entero: solo si además pediste ocultar lo que no empezaste,
 * y no lo empezaste ni lo puntuaste.
 */
export function hideTitleSynopsis(
  settings: Pick<Settings, 'spoilerFree' | 'spoilerUnstarted'>,
  metaId: string,
  progress: Record<string, WatchEntry>,
  rated: boolean,
): boolean {
  if (!settings.spoilerFree || !settings.spoilerUnstarted || rated) return false
  return !Object.values(progress).some((e) => e.metaId === metaId)
}
