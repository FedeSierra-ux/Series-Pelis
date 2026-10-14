import { useMemo } from 'react'
import { useHiddenIds } from '../../lib/ratings'
import { TmdbHero } from '../home/TmdbHero'
import { onlyTitles, Top10Row, useTrendingMovies } from '../home/TmdbRows'

/**
 * Portada de Películas, de borde a borde y estilo Stremio: fondo de la peli, logo, IMDb, duración y
 * reparto, con el Top 10 de hoy montado sobre el borde de abajo.
 */
export function MoviesHero({ tmdbKey }: { tmdbKey: string }) {
  const trending = useTrendingMovies(tmdbKey)
  const hidden = useHiddenIds()
  const items = useMemo(
    () => onlyTitles(trending.data?.results).filter((i) => i.backdrop_path && !hidden.has(`tmdb:movie:${i.id}`)).slice(0, 8),
    [trending.data, hidden],
  )
  if (items.length === 0) return trending.loading ? <div className="hero hero-full hero-skeleton skeleton" /> : null
  return (
    <TmdbHero items={items} variant="full" fallbackType="movie">
      <Top10Row state={trending} title="Top 10 películas de hoy" />
    </TmdbHero>
  )
}
