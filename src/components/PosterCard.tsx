import { memo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { prefetchMeta } from '../lib/addons'
import { smallPoster } from '../lib/format'
import { addonsStore } from '../lib/store'
import type { MetaPreview } from '../lib/types'
import { ImdbRating } from './Rating'

interface Props {
  meta: MetaPreview
  progress?: number
  watched?: boolean
  subtitle?: string
  to?: string
  eager?: boolean
}

export const PosterCard = memo(function PosterCard({ meta, progress, watched, subtitle, to, eager }: Props) {
  const prefetched = useRef(false)
  // Precargamos la ficha cuando el usuario se detiene en el póster: al entrar ya está lista.
  const prefetch = () => {
    if (prefetched.current) return
    prefetched.current = true
    prefetchMeta(addonsStore.get(), meta.type, meta.id)
  }
  const src = smallPoster(meta.id, meta.poster)

  return (
    <Link
      to={to ?? `/detail/${meta.type}/${encodeURIComponent(meta.id)}`}
      className={`poster-card shape-${meta.posterShape ?? 'poster'}`}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      onTouchStart={prefetch}
      title={meta.name}
    >
      <div className="poster-img">
        {src ? (
          <img src={src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : 'auto'} />
        ) : (
          <div className="poster-fallback">{meta.name}</div>
        )}
        {watched && <span className="badge-watched" title="Vista">✓</span>}
        {progress !== undefined && progress > 0 && (
          <div className="progress-bar">
            <div style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="poster-info">
        <span className="poster-title">{meta.name}</span>
        <span className="poster-sub">
          {subtitle ?? meta.releaseInfo ?? meta.year}
          <ImdbRating value={meta.imdbRating} size="sm" />
        </span>
      </div>
    </Link>
  )
})

export function PosterSkeleton() {
  return (
    <div className="poster-card skeleton-card" aria-hidden>
      <div className="poster-img skeleton" />
      <div className="poster-info">
        <span className="skeleton skeleton-line" />
      </div>
    </div>
  )
}
