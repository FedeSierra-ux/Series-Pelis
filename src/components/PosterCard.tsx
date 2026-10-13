import { memo, useEffect, useRef, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { prefetchMeta } from '../lib/addons'
import { smallPoster } from '../lib/format'
import { armTrailer, disarmTrailer } from '../lib/hoverTrailer'
import { LABEL_TEXT, usePosterLabel } from '../lib/posterLabels'
import { addonsStore, settingsStore, useStore } from '../lib/store'
import { imdbFromTmdb, parseTmdbId } from '../lib/tmdb'
import type { MetaPreview } from '../lib/types'
import { ImdbRating, PosterRating } from './Rating'

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
    // Ítems de TMDB: primero averiguamos el id de IMDb, que es lo que usan Cinemeta y los addons.
    const tmdb = parseTmdbId(meta.id)
    if (tmdb) imdbFromTmdb(tmdb.id, tmdb.type).then((tt) => tt && prefetchMeta(addonsStore.get(), meta.type, tt)).catch(() => {})
    else prefetchMeta(addonsStore.get(), meta.type, meta.id)
  }
  const src = smallPoster(meta.id, meta.poster)
  // v0.5: puntaje sobre el póster, etiqueta y tráiler al quedarse encima.
  const { posterRating, posterLabels } = useStore(settingsStore)
  const posterLabel = usePosterLabel(meta, posterLabels)
  const linkRef = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    const el = linkRef.current
    return () => {
      if (el) disarmTrailer(el)
    }
  }, [])
  const onEnter = (e: MouseEvent<HTMLAnchorElement>) => {
    prefetch()
    armTrailer({ anchor: e.currentTarget, meta, via: 'mouse' })
  }
  const onFocus = (e: FocusEvent<HTMLAnchorElement>) => {
    prefetch()
    // Solo con teclado o control remoto (no al hacer clic con el mouse).
    if (e.currentTarget.matches(':focus-visible')) armTrailer({ anchor: e.currentTarget, meta, via: 'focus' })
  }

  const card = (
    <Link
      to={to ?? `/detail/${meta.type}/${encodeURIComponent(meta.id)}`}
      ref={linkRef}
      className={`poster-card shape-${meta.posterShape ?? 'poster'}`}
      onMouseEnter={onEnter}
      onMouseLeave={(e) => disarmTrailer(e.currentTarget, 'mouse')}
      onFocus={onFocus}
      onBlur={(e) => disarmTrailer(e.currentTarget, 'focus')}
      onTouchStart={prefetch}
      title={meta.name}
    >
      <div className="poster-img">
        {src ? (
          <img src={src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : 'auto'} />
        ) : (
          <div className="poster-fallback">{meta.name}</div>
        )}
        {posterLabel && <span className={`poster-label poster-label-${posterLabel}`}>{LABEL_TEXT[posterLabel]}</span>}
        {/* Arriba a la derecha: el puntaje y, debajo, el ✓ de "vista". */}
        {((posterRating === 'on' && meta.imdbRating) || watched) && (
          <span className="poster-corner">
            {posterRating === 'on' && <PosterRating value={meta.imdbRating} />}
            {watched && <span className="badge-watched" title="Vista">✓</span>}
          </span>
        )}
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
          {posterRating === 'below' && <ImdbRating value={meta.imdbRating} size="sm" />}
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
