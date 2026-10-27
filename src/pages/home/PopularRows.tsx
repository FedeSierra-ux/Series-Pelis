import { useMemo } from 'react'
import { PosterCard, PosterSkeleton } from '../../components/PosterCard'
import { Row } from '../../components/Row'
import { exploreAllTo, type BrowseKind } from '../../lib/browseRows'
import { useHiddenIds } from '../../lib/ratings'
import { withoutHidden } from '../../lib/recommend'
import { loadPopular, loadTop10Mix } from '../discover/browseData'
import { useNearViewport, useTmdbQuery } from './lazy'

// v0.32: filas de Inicio con el pedido del usuario: Top 10 mezclando películas y series (sin anime) y,
// después, Películas populares y Series populares.

const POPULAR_MAX = 30

const TOP10_SKELETON = Array.from({ length: 8 }, (_, i) => (
  <div key={i} className="top10-item" aria-hidden>
    <span className="top10-rank is-skel">{i + 1}</span>
    <PosterSkeleton />
  </div>
))

/** "Top 10 en Argentina": películas y series juntas, con el número grande al costado del póster. */
export function MixTop10Row({ tmdbOn, tmdbKey }: { tmdbOn: boolean; tmdbKey: string }) {
  const state = useTmdbQuery(`top10mix|${tmdbKey}`, () => loadTop10Mix(tmdbOn))
  const hidden = useHiddenIds()
  const items = useMemo(() => withoutHidden(state.data ?? [], hidden).slice(0, 10), [state.data, hidden])
  return (
    <Row
      title={tmdbOn && state.data ? 'Top 10 en Argentina' : 'Top 10 populares'}
      loading={state.loading}
      error={state.failed ? 'error' : undefined}
      empty={items.length === 0}
      skeleton={TOP10_SKELETON}
    >
      {items.map((m, i) => (
        <div key={m.id} className="top10-item">
          <span className="top10-rank" aria-hidden>
            {i + 1}
          </span>
          <PosterCard meta={m} eager={i < 6} hideTop10Label rank={i + 1} />
        </div>
      ))}
    </Row>
  )
}

/** "Películas populares" / "Series populares" (lo popular de Cinemeta). */
export function PopularRow({ kind }: { kind: BrowseKind }) {
  const [ref, visible] = useNearViewport<HTMLDivElement>(false)
  const state = useTmdbQuery(visible ? `popular|${kind}` : undefined, () => loadPopular(kind))
  const hidden = useHiddenIds()
  const items = useMemo(() => withoutHidden(state.data ?? [], hidden).slice(0, POPULAR_MAX), [state.data, hidden])
  return (
    <div ref={ref}>
      <Row
        title={kind === 'movie' ? 'Películas populares' : 'Series populares'}
        moreTo={exploreAllTo(kind)}
        loading={state.loading || !visible}
        error={state.failed ? 'error' : undefined}
        empty={items.length === 0}
      >
        {items.map((m) => (
          <PosterCard key={m.id} meta={m} hideTop10Label />
        ))}
      </Row>
    </div>
  )
}
