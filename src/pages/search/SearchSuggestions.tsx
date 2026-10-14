import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CINEMETA_URL } from '../../lib/addons'
import { smallPoster } from '../../lib/format'
import { useAddons, useCatalog } from '../../lib/hooks'
import { genreLabel, typeLabel } from '../../lib/i18n'
import { useHiddenIds } from '../../lib/ratings'
import { genreLink, SUGGESTED_GENRES } from '../../lib/searchResults'
import { itemTitle, itemYear, tmdbDetailPath, tmdbImg, useTmdbKey } from '../../lib/tmdb'
import { onlyTitles, useTrending } from '../home/TmdbRows'

// v0.14 (U13): Buscar con el campo vacío. "Lo más buscado" (tendencias de hoy en TMDB; sin TMDB, lo popular
// de Cinemeta) como lista con mini póster, y chips de géneros que llevan a Películas o Series ya filtradas.

const TOP = 10

interface Suggestion {
  key: string
  to: string
  title: string
  poster?: string
  sub: string
}

function useTrendingSuggestions(): { items: Suggestion[]; loading: boolean; title: string } {
  const tmdbKey = useTmdbKey()
  const trending = useTrending('day', tmdbKey)
  const hidden = useHiddenIds()
  // Sin TMDB: lo más popular de Cinemeta (pelis y series intercaladas).
  const addons = useAddons()
  const cinemeta = tmdbKey ? undefined : addons.find((a) => a.transportUrl === CINEMETA_URL && !a.disabled)
  const topMovies = useCatalog(cinemeta, cinemeta?.manifest.catalogs.find((c) => c.type === 'movie' && c.id === 'top'))
  const topSeries = useCatalog(cinemeta, cinemeta?.manifest.catalogs.find((c) => c.type === 'series' && c.id === 'top'))

  return useMemo(() => {
    if (tmdbKey) {
      const items = onlyTitles(trending.data?.results)
        .filter((i) => !hidden.has(`tmdb:${i.media_type}:${i.id}`))
        .slice(0, TOP)
        .map((i) => ({
          key: `${i.media_type}:${i.id}`,
          to: tmdbDetailPath(i),
          title: itemTitle(i),
          poster: tmdbImg(i.poster_path, 'w92'),
          sub: [itemYear(i), typeLabel(i.media_type === 'movie' ? 'movie' : 'series', false)].filter(Boolean).join(' · '),
        }))
      return { items, loading: trending.loading, title: 'Lo más buscado' }
    }
    const movies = topMovies.data ?? []
    const series = topSeries.data ?? []
    const mixed = Array.from({ length: TOP }, (_, i) => (i % 2 === 0 ? movies[i / 2] : series[(i - 1) / 2])).filter(Boolean)
    const items = mixed
      .filter((m) => !hidden.has(m.id))
      .map((m) => ({
        key: m.id,
        to: `/detail/${m.type}/${encodeURIComponent(m.id)}`,
        title: m.name,
        poster: smallPoster(m.id, m.poster),
        sub: [m.releaseInfo ?? m.year, typeLabel(m.type, false)].filter(Boolean).join(' · '),
      }))
    return { items, loading: topMovies.loading || topSeries.loading, title: 'Populares ahora' }
  }, [tmdbKey, trending.data, trending.loading, hidden, topMovies.data, topMovies.loading, topSeries.data, topSeries.loading])
}

export function SearchSuggestions() {
  const { items, loading, title } = useTrendingSuggestions()
  return (
    <div className="search-suggest">
      {(loading || items.length > 0) && (
        <section className="search-trending" aria-labelledby="search-trending-title" aria-busy={loading || undefined}>
          <h2 id="search-trending-title">{title}</h2>
          <ol className="search-trending-list">
            {items.length > 0
              ? items.map((s, i) => (
                  <li key={s.key}>
                    <Link to={s.to} className="search-trending-item">
                      <span className="search-trending-rank" aria-hidden>
                        {i + 1}
                      </span>
                      <MiniPoster src={s.poster} />
                      <span className="search-trending-text">
                        <strong>{s.title}</strong>
                        {s.sub && <span>{s.sub}</span>}
                      </span>
                    </Link>
                  </li>
                ))
              : Array.from({ length: 6 }, (_, i) => (
                  <li key={i} aria-hidden>
                    <span className="search-trending-item is-skeleton">
                      <span className="search-trending-rank">{i + 1}</span>
                      <span className="search-trending-noimg skeleton" />
                      <span className="search-trending-text">
                        <span className="skeleton skeleton-line" />
                      </span>
                    </span>
                  </li>
                ))}
          </ol>
        </section>
      )}

      <section className="search-genres" aria-labelledby="search-genres-title">
        <h2 id="search-genres-title">Explorar por género</h2>
        {(['movie', 'series'] as const).map((type) => (
          <div key={type} className="search-genre-line">
            <h3>{typeLabel(type)}</h3>
            <ul className="search-genre-chips" aria-label={`Géneros de ${typeLabel(type).toLowerCase()}`}>
              {SUGGESTED_GENRES[type].map((g) => (
                <li key={g}>
                  <Link to={genreLink(type, g)} className="chip search-genre-chip">
                    {genreLabel(g)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  )
}

/** Mini póster; si no carga, queda el recuadro vacío (sin el ícono de imagen rota). */
function MiniPoster({ src }: { src?: string }) {
  const [broken, setBroken] = useState<string>()
  if (!src || src === broken) return <span className="search-trending-noimg" aria-hidden />
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setBroken(src)} />
}
