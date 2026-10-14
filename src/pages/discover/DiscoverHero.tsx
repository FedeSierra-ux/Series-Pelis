import { useMemo } from 'react'
import { useHiddenIds } from '../../lib/ratings'
import type { TmdbType } from '../../lib/tmdb'
import { TmdbHero } from '../home/TmdbHero'
import { onlyTitles, Top10Row, useTrendingOf } from '../home/TmdbRows'

const TOP10_TITLE: Record<TmdbType, string> = { movie: 'Top 10 películas de hoy', tv: 'Top 10 series de hoy' }

/**
 * Portada de Películas y de Series, de borde a borde y estilo Stremio: fondo del título, logo, IMDb,
 * duración y reparto, con el Top 10 de hoy montado sobre el borde de abajo.
 */
export function DiscoverHero({ type, tmdbKey }: { type: TmdbType; tmdbKey: string }) {
  const trending = useTrendingOf(type, tmdbKey)
  const hidden = useHiddenIds()
  const items = useMemo(
    () => onlyTitles(trending.data?.results).filter((i) => i.backdrop_path && !hidden.has(`tmdb:${type}:${i.id}`)).slice(0, 8),
    [trending.data, hidden, type],
  )
  if (items.length === 0) return trending.loading ? <div className="hero hero-full hero-skeleton skeleton" /> : null
  return (
    <TmdbHero items={items} variant="full" fallbackType={type}>
      <Top10Row state={trending} title={TOP10_TITLE[type]} />
    </TmdbHero>
  )
}
