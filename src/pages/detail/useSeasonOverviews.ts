import { useEffect, useMemo, useState } from 'react'
import { getSeasonInfo, useTmdbKey } from '../../lib/tmdb'
import type { Video } from '../../lib/types'
import { overviewsByEpisode, type SeasonEpisodeInfo } from './episodes'

/**
 * v0.26 (ficha-11): con TMDB, la sinopsis en español de los episodios de la temporada que se ve (un pedido por
 * temporada, con la caché de `tmdbCached`). Sin TMDB, o mientras carga, el mapa viene vacío y quedan las de Cinemeta.
 * Los títulos de los episodios no se tocan (quedan en su idioma original).
 */
export function useSeasonOverviews(tvId: number | undefined, season: number, seasonVideos: Video[]): Map<string, string> {
  const key = useTmdbKey()
  const enabled = !!(key && tvId)
  const [data, setData] = useState<{ for: string; episodes: SeasonEpisodeInfo[] }>()
  const want = enabled ? `${tvId}:${season}` : ''
  useEffect(() => {
    if (!enabled || !tvId) return
    let alive = true
    getSeasonInfo(tvId, season)
      .then((episodes) => {
        if (alive) setData({ for: `${tvId}:${season}`, episodes })
      })
      .catch(() => {
        // Sin la temporada de TMDB quedan las sinopsis de Cinemeta.
      })
    return () => {
      alive = false
    }
  }, [enabled, tvId, season])
  const episodes = data?.for === want ? data.episodes : undefined
  return useMemo(() => overviewsByEpisode(seasonVideos, episodes), [seasonVideos, episodes])
}
