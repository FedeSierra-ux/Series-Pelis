import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PosterCard } from '../../components/PosterCard'
import { Row } from '../../components/Row'
import {
  argentinasMoreTo,
  exploreAllTo,
  GENRE_ROWS,
  genreMoreTo,
  TOP10_TITLE,
  wellRatedMoreTo,
  type BrowseKind,
} from '../../lib/browseRows'
import { useTitle } from '../../lib/hooks'
import { suppressHoverTrailer } from '../../lib/hoverTrailer'
import { typeLabel } from '../../lib/i18n'
import { useHiddenIds } from '../../lib/ratings'
import { withoutHidden } from '../../lib/recommend'
import { useTmdbKey } from '../../lib/tmdb'
import type { MetaPreview } from '../../lib/types'
import { useNearViewport, useTmdbQuery } from '../home/lazy'
import { BrowseHero } from './BrowseHero'
import { loadArgentinas, loadGenre, loadTop10, loadWellRated } from './browseData'

// Películas y Series sin filtros (v0.15, U11): portada que sigue al póster y filas. La grilla con
// filtros de siempre queda detrás de "Explorar todo" y de "Ver todo" de cada fila.

/** Tope de títulos por fila. */
const ROW_MAX = 30

export function BrowsePage({ kind }: { kind: BrowseKind }) {
  const tmdbKey = useTmdbKey()
  const tmdbOn = tmdbKey.length > 0
  const label = typeLabel(kind)
  const rowsRef = useRef<HTMLDivElement>(null)
  useTitle(label)

  // Acá el tráiler va en la portada de arriba: el de los pósters se apaga mientras tanto.
  useEffect(() => {
    const release = suppressHoverTrailer()
    return release
  }, [])

  const top10 = useTmdbQuery(`top10w|${kind}|${tmdbKey}`, () => loadTop10(kind, tmdbOn))
  const hidden = useHiddenIds()
  const topItems = useMemo(() => withoutHidden(top10.data?.items ?? [], hidden).slice(0, 10), [top10.data, hidden])
  const first = topItems[0]
  const firstTarget = useMemo(() => first && { type: first.type, id: first.id, name: first.name, poster: first.poster }, [first])
  const topTitle = top10.data && !top10.data.trending ? `Top 10 ${label.toLowerCase()} populares` : TOP10_TITLE[kind]

  return (
    <div className="page discover browse">
      <BrowseHero title={label} first={firstTarget} exploreTo={exploreAllTo(kind)} rowsRef={rowsRef} />
      <div className="browse-rows" ref={rowsRef}>
        <Row title={topTitle} loading={top10.loading} error={top10.failed ? 'error' : undefined} empty={topItems.length === 0}>
          {topItems.map((m, i) => (
            <div key={m.id} className="top10-item">
              <span className="top10-rank" aria-hidden>
                {i + 1}
              </span>
              <PosterCard meta={m} eager={i < 6} hideTop10Label rank={i + 1} />
            </div>
          ))}
        </Row>
        <LazyRow id={`rated|${kind}`} title="Bien calificadas" load={() => loadWellRated(kind)} moreTo={wellRatedMoreTo(kind)} eager />
        {GENRE_ROWS[kind].map((g) => (
          <LazyRow key={g.key} id={`genre|${kind}|${g.genre}`} title={g.title} load={() => loadGenre(kind, g.genre)} moreTo={genreMoreTo(kind, g.genre)} />
        ))}
        {tmdbOn && (
          <LazyRow id={`ar|${kind}|${tmdbKey}`} title="Argentinas" load={() => loadArgentinas(kind)} moreTo={argentinasMoreTo(kind)} />
        )}
      </div>
    </div>
  )
}

interface LazyRowProps {
  id: string
  title: string
  load: () => Promise<MetaPreview[]>
  moreTo: string
  /** Se pide al abrir (las demás, cuando se acercan a la pantalla). */
  eager?: boolean
}

function LazyRow({ id, title, load, moreTo, eager = false }: LazyRowProps) {
  const [ref, visible] = useNearViewport<HTMLDivElement>(eager)
  const state = useTmdbQuery(visible ? id : undefined, load)
  const hidden = useHiddenIds()
  const items = useMemo(() => withoutHidden(state.data ?? [], hidden).slice(0, ROW_MAX), [state.data, hidden])
  return (
    <div ref={ref}>
      <Row title={title} moreTo={moreTo} loading={state.loading || !visible} error={state.failed ? 'error' : undefined} empty={items.length === 0}>
        {items.map((m, i) => (
          <PosterCard key={m.id} meta={m} eager={eager && i < 8} hideTop10Label />
        ))}
        <MoreCard to={moreTo} title={title} />
      </Row>
    </div>
  )
}

/** "Ver todo" como última tarjeta (TV y celular: ahí el link del título queda lejos del control o del pulgar). */
function MoreCard({ to, title }: { to: string; title: string }) {
  return (
    <Link to={to} className="poster-card row-more-card" aria-label={`Ver todo: ${title}`}>
      <div className="poster-img">
        <span className="row-more-icon" aria-hidden>
          ›
        </span>
        <span>Ver todo</span>
      </div>
    </Link>
  )
}
