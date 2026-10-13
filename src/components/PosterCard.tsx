import { memo, useRef, type KeyboardEvent, type MouseEvent } from 'react'
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
  /** Muestra un botón ✕ sobre la tarjeta (por ejemplo para sacarla de "Seguir viendo"). */
  onRemove?: () => void
  removeLabel?: string
}

export const PosterCard = memo(function PosterCard({ meta, progress, watched, subtitle, to, eager, onRemove, removeLabel }: Props) {
  const prefetched = useRef(false)
  // Precargamos la ficha cuando el usuario se detiene en el póster: al entrar ya está lista.
  const prefetch = () => {
    if (prefetched.current) return
    prefetched.current = true
    prefetchMeta(addonsStore.get(), meta.type, meta.id)
  }
  const src = smallPoster(meta.id, meta.poster)

  const card = (
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
  if (!onRemove) return card

  const label = removeLabel ?? 'Quitar'
  // El ✕ queda encima del póster, así que la navegación espacial nunca lo elegiría:
  // con ↑ desde la tarjeta se llega al botón y con ↓ se vuelve.
  const onCardKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (e.key === 'ArrowUp' && target.classList.contains('poster-card')) {
      e.preventDefault()
      target.parentElement?.querySelector<HTMLElement>('.poster-remove')?.focus()
    } else if (e.key === 'ArrowDown' && target.classList.contains('poster-remove')) {
      e.preventDefault()
      target.parentElement?.querySelector<HTMLElement>('.poster-card')?.focus()
    }
  }
  const remove = (e: MouseEvent<HTMLButtonElement>) => {
    // Pasamos el foco a la tarjeta vecina para no dejar al control remoto "en el aire".
    const wrap = e.currentTarget.parentElement
    const neighbor = (wrap?.nextElementSibling ?? wrap?.previousElementSibling)?.querySelector<HTMLElement>('.poster-card')
    onRemove()
    if (neighbor) requestAnimationFrame(() => neighbor.focus({ preventScroll: false }))
  }
  return (
    <div className="poster-card-wrap" onKeyDown={onCardKey}>
      {card}
      <button type="button" className="poster-remove" aria-label={label} title={label} onClick={remove}>
        ✕
      </button>
    </div>
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
