import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { seriesYear } from '../../lib/format'
import { hiddenIdSet, withoutHidden } from '../../lib/recommend'
import { notInterestedStore, useStore } from '../../lib/store'
import { getDetailsByImdb, hasTmdb, tmdbImg, tmdbToPreview, type TmdbDetails, type TmdbListItem } from '../../lib/tmdb'
import type { MetaPreview } from '../../lib/types'

// Post-play de una peli (F5): al empezar los créditos, 3 títulos de "Más como esto" (las mismas
// recomendaciones de TMDB que la ficha, en TmdbExtras). No reproduce nada solo: elegir uno abre su ficha.

const COUNT = 3

/** Recomendaciones de TMDB (o las "similares" si no hay), sin los marcados "Ya no me interesa". */
export function postPlayPicks(details: Pick<TmdbDetails, 'recommendations' | 'similar'> | undefined, hidden: Set<string>, count = COUNT) {
  const recs = details?.recommendations?.results ?? []
  const list: TmdbListItem[] = recs.length > 0 ? recs : (details?.similar?.results ?? [])
  const previews = list
    .filter((i) => i.media_type !== 'person')
    .map((i) => ({ ...tmdbToPreview(i, 'movie'), still: tmdbImg(i.backdrop_path, 'w300') }))
  return withoutHidden(previews, hidden).slice(0, count)
}

export type PostPlayPick = MetaPreview & { still?: string }

interface Props {
  imdbId: string
  /** Ya empezaron los créditos (o el final, sin datos). */
  due: boolean
  onOpen: (pick: PostPlayPick) => void
  onClose: () => void
  /** Enfocar el primer título al aparecer (en la TV, como "Ver ahora" en la tarjeta del siguiente). */
  autoFocus?: boolean
  /** Lo que va en la esquina si no hay recomendaciones (sin TMDB): el botón "Saltar créditos". */
  children?: ReactNode
}

export function PostPlay({ imdbId, due, onOpen, onClose, autoFocus, children }: Props) {
  const notInterested = useStore(notInterestedStore)
  const [details, setDetails] = useState<TmdbDetails>()

  // Se pide recién cuando hace falta (y queda en la caché de TMDB de la ficha).
  useEffect(() => {
    if (!due || details || !hasTmdb() || !imdbId.startsWith('tt')) return
    let alive = true
    getDetailsByImdb(imdbId, 'movie')
      .then((d) => {
        if (alive) setDetails(d)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [due, details, imdbId])

  const picks = useMemo(() => postPlayPicks(details, hiddenIdSet(Object.values(notInterested))), [details, notInterested])
  if (!due || picks.length === 0) return <>{children}</>

  return (
    <div className="postplay" role="group" aria-labelledby="postplay-title">
      <div className="postplay-head">
        <strong id="postplay-title">Más como esto</strong>
        <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <div className="postplay-items">
        {picks.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className="postplay-item"
            autoFocus={autoFocus && i === 0}
            onClick={() => onOpen(p)}
            aria-label={`${p.name}${p.releaseInfo ? ` (${seriesYear(p.releaseInfo)})` : ''}: ver la ficha`}
          >
            {p.still || p.poster ? <img src={p.still ?? p.poster} alt="" loading="lazy" decoding="async" /> : <span className="postplay-ph" aria-hidden />}
            <span className="postplay-name">{p.name}</span>
            {p.releaseInfo && <span className="postplay-year muted small">{seriesYear(p.releaseInfo)}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
