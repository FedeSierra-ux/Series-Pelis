import { memo, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { prefetchMeta } from '../lib/addons'
import { seriesYear, smallPoster } from '../lib/format'
import { genreLabel } from '../lib/i18n'
import { armTrailer, disarmTrailer } from '../lib/hoverTrailer'
import { LABEL_TEXT, usePosterLabel } from '../lib/posterLabels'
import { addonsStore, settingsStore, useStore } from '../lib/store'
import { cardBackdrop, useNearOnce, useTitleLogo } from '../lib/titleArt'
import { imdbFromTmdb, parseTmdbId } from '../lib/tmdb'
import type { MetaPreview } from '../lib/types'
import { ImdbRating, PosterRating } from './Rating'
import './landscape-card.css'

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
  /**
   * Tarjeta apaisada (v0.14, U10): fondo 16:9 con el logo del título encima y, abajo, año y género.
   * Sin logo va el nombre. La forma de cada fila se elige en el gestor de catálogos.
   */
  landscape?: boolean
  /** Es el título de la página actual (por ejemplo en la saga): se muestra sin enlace. */
  current?: boolean
}

export const PosterCard = memo(function PosterCard({ meta, progress, watched, subtitle, to, eager, onRemove, removeLabel, landscape, current }: Props) {
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
  const backdrop = landscape ? cardBackdrop(meta) : undefined
  const posterSrc = smallPoster(meta.id, meta.poster)
  // Apaisada sin fondo: el póster centrado y recortado (mejor que un hueco).
  const src = landscape ? (backdrop ?? posterSrc) : posterSrc
  // Si la imagen no carga (404, CDN caído) mostramos el nombre en vez de un hueco vacío.
  const [brokenSrc, setBrokenSrc] = useState<string>()
  const [imgRef, near] = useNearOnce<HTMLDivElement>(!!landscape && !eager)
  const logo = useTitleLogo(meta, !!landscape && (eager || near))
  const [brokenLogo, setBrokenLogo] = useState<string>()
  const showLogo = !!logo && logo !== brokenLogo
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

  const cls = landscape ? 'poster-card is-landscape' : `poster-card shape-${meta.posterShape ?? 'poster'}`
  const body = (
    <>
      <div className="poster-img" ref={landscape ? imgRef : undefined}>
        {src && src !== brokenSrc ? (
          <img
            src={src}
            alt=""
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={eager ? 'high' : 'auto'}
            className={landscape && !backdrop ? 'is-poster' : undefined}
            onError={() => setBrokenSrc(src)}
          />
        ) : (
          !landscape && <div className="poster-fallback">{meta.name}</div>
        )}
        {landscape && (
          <div className="land-art" aria-hidden>
            {showLogo ? (
              <img className="land-logo" src={logo} alt="" loading="lazy" decoding="async" onError={() => setBrokenLogo(logo)} />
            ) : (
              <span className="land-name">{meta.name}</span>
            )}
          </div>
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
        {!landscape && <span className="poster-title">{meta.name}</span>}
        <span className="poster-sub">
          {subtitle ?? (landscape ? landInfo(meta) : seriesYear(meta.releaseInfo ?? meta.year))}
          {posterRating === 'below' && <ImdbRating value={meta.imdbRating} size="sm" />}
        </span>
      </div>
    </>
  )
  // El título que ya estás viendo no lleva a ningún lado (volver a abrirlo sumaba una entrada al historial).
  const card = current ? (
    <div className={`${cls} is-current`} aria-current="page" title={meta.name}>
      {body}
    </div>
  ) : (
    <Link
      to={to ?? `/detail/${meta.type}/${encodeURIComponent(meta.id)}`}
      ref={linkRef}
      data-focus-id={meta.id}
      className={cls}
      // Apaisada: el nombre está en el logo, así que no se repite abajo (sí para el lector de pantalla).
      aria-label={landscape ? [meta.name, landInfo(meta)].filter(Boolean).join(', ') : undefined}
      onMouseEnter={onEnter}
      onMouseLeave={(e) => disarmTrailer(e.currentTarget, 'mouse')}
      onFocus={onFocus}
      onBlur={(e) => disarmTrailer(e.currentTarget, 'focus')}
      onTouchStart={prefetch}
      title={meta.name}
    >
      {body}
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

/** Debajo de la tarjeta apaisada: "2024 · Ciencia ficción". */
function landInfo(meta: MetaPreview): string {
  const genre = (meta.genres ?? meta.genre ?? [])[0]
  return [seriesYear(meta.releaseInfo ?? meta.year), genre ? genreLabel(genre) : undefined].filter(Boolean).join(' · ')
}

export function PosterSkeleton({ landscape }: { landscape?: boolean }) {
  return (
    <div className={`poster-card skeleton-card${landscape ? ' is-landscape' : ''}`} aria-hidden>
      <div className="poster-img skeleton" />
      <div className="poster-info">
        <span className="skeleton skeleton-line" />
      </div>
    </div>
  )
}
