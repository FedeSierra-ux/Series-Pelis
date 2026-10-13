import { PosterCard } from '../../components/PosterCard'
import { Row } from '../../components/Row'
import { useHiddenIds } from '../../lib/ratings'
import {
  findByImdb,
  getRecommendations,
  getTrending,
  LANG,
  peekTmdb,
  tmdbToPreview,
  toTmdbType,
  type TmdbListItem,
  type TmdbPage,
} from '../../lib/tmdb'
import { useNearViewport, useTmdbQuery, type TmdbState } from './lazy'

/** Solo pelis y series (las tendencias también traen personas). */
export const onlyTitles = (list: TmdbListItem[] | undefined) =>
  (list ?? []).filter((i) => i.media_type === 'movie' || i.media_type === 'tv')

/** Tendencias de TMDB; `day` la comparten la portada y el Top 10. */
export function useTrending(window: 'day' | 'week', tmdbKey: string, enabled = true): TmdbState<TmdbPage> {
  return useTmdbQuery(
    tmdbKey && enabled ? `${window}|${tmdbKey}` : undefined,
    () => getTrending('all', window),
    () => peekTmdb<TmdbPage>(`/trending/all/${window}`, { language: LANG }),
  )
}

/** "Top 10 de hoy" con el número grande al costado del póster. */
export function Top10Row({ state }: { state: TmdbState<TmdbPage> }) {
  const hidden = useHiddenIds()
  const items = onlyTitles(state.data?.results)
    .filter((i) => !hidden.has(`tmdb:${i.media_type}:${i.id}`))
    .slice(0, 10)
  return (
    <Row title="Top 10 de hoy" loading={state.loading} error={state.failed ? 'error' : undefined} empty={items.length === 0}>
      {items.map((item, i) => (
        <div key={`${item.media_type}:${item.id}`} className="top10-item">
          <span className="top10-rank" aria-hidden>
            {i + 1}
          </span>
          <PosterCard meta={tmdbToPreview(item)} eager={i < 6} />
        </div>
      ))}
    </Row>
  )
}

export function TrendingWeekRow({ tmdbKey }: { tmdbKey: string }) {
  const [ref, visible] = useNearViewport<HTMLDivElement>(false)
  const state = useTrending('week', tmdbKey, visible)
  const hidden = useHiddenIds()
  const items = onlyTitles(state.data?.results).filter((i) => !hidden.has(`tmdb:${i.media_type}:${i.id}`))
  return (
    <div ref={ref}>
      <Row title="Tendencias de la semana" loading={state.loading || !visible} error={state.failed ? 'error' : undefined} empty={items.length === 0}>
        {items.map((item) => (
          <PosterCard key={`${item.media_type}:${item.id}`} meta={tmdbToPreview(item)} />
        ))}
      </Row>
    </div>
  )
}

export interface Seed {
  metaId: string
  type: string
  name: string
}

/** "Porque viste …": recomendaciones de TMDB a partir de un título del historial. */
export function BecauseRow({ seed, tmdbKey }: { seed: Seed; tmdbKey: string }) {
  const [ref, visible] = useNearViewport<HTMLDivElement>(false)
  const tmdbType = toTmdbType(seed.type)
  const state = useTmdbQuery(
    tmdbKey && visible ? `${seed.metaId}|${seed.type}|${tmdbKey}` : undefined,
    async () => {
      const id = await findByImdb(seed.metaId, seed.type)
      return id ? (await getRecommendations(tmdbType, id)).results : []
    },
  )
  const hidden = useHiddenIds()
  const items = (state.data ?? [])
    .filter((i) => (!i.media_type || i.media_type === 'movie' || i.media_type === 'tv') && !hidden.has(`tmdb:${i.media_type ?? tmdbType}:${i.id}`))
    .slice(0, 20)
  return (
    <div ref={ref}>
      <Row
        title={`Porque viste ${seed.name}`}
        loading={state.loading || !visible}
        error={state.failed ? 'error' : undefined}
        empty={items.length === 0}
      >
        {items.map((item) => (
          <PosterCard key={`${item.media_type ?? tmdbType}:${item.id}`} meta={tmdbToPreview(item, tmdbType)} />
        ))}
      </Row>
    </div>
  )
}
