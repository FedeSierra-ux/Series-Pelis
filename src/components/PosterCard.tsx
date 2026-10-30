import { memo, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { prefetchMeta } from '../lib/addons'
import { smallPoster } from '../lib/format'
import { displayYear } from '../lib/yearLabel'
import { genreLabel } from '../lib/i18n'
import { justRestored } from '../lib/focusMemory'
import { armTrailer, disarmTrailer, mouseMoveTrailer } from '../lib/hoverTrailer'
import { LABEL_TEXT, usePosterLabel } from '../lib/posterLabels'
import { useLocalTitle } from '../lib/localTitles'
import { useLogoTone } from '../lib/logoTone'
import { addonsStore, settingsStore, useStore } from '../lib/store'
import { cardBackdrop, useNearOnce, useTitleLogo } from '../lib/titleArt'
import { portraitLogo } from './focusBillboardData'
import { posterAriaLabel } from '../lib/posterAria'
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
  /**
   * Pide la imagen con prioridad alta (v0.36, sistema-02): solo la primera fila visible de la pantalla. Las demás
   * `eager` van con prioridad automática y no le quitan el ancho de banda al LCP (el fondo de la portada).
   */
  priority?: boolean
  /** Muestra un botón ✕ sobre la tarjeta (por ejemplo para sacarla de "Seguir viendo"). */
  onRemove?: () => void
  removeLabel?: string
  /**
   * Tarjeta apaisada (v0.14, U10): fondo 16:9 con el logo del título encima y, abajo, año y género.
   * Sin logo va el nombre. La forma de cada fila se elige en el gestor de catálogos.
   */
  landscape?: boolean
  /**
   * Sin la etiqueta "Top 10" (pasa a la siguiente, ej. "Estreno"). Va en todas las filas de Inicio y de
   * Películas/Series (las dos pantallas ya tienen la fila del Top 10) y en la grilla de catálogos; la etiqueta
   * queda donde no hay Top 10 a la vista: Buscar, la ficha, personas, Mi lista y listas.
   */
  hideTop10Label?: boolean
  /** Puesto en la fila "Top 10": el número grande es decorativo, esto lo dice al lector de pantalla (a11y-06). */
  rank?: number
}

export const PosterCard = memo(function PosterCard({ meta, progress, watched, subtitle, to, eager, priority, onRemove, removeLabel, landscape, hideTop10Label, rank }: Props) {
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
  // Cerca de la pantalla: pide el logo (apaisadas) y el nombre en español (v0.28, todas).
  const [imgRef, near] = useNearOnce<HTMLDivElement>(!eager)
  const logo = useTitleLogo(meta, !!landscape && (eager || near))
  const name = useLocalTitle(meta.id, meta.name, { type: meta.type, enabled: eager || near })
  const [brokenLogo, setBrokenLogo] = useState<string>()
  const showLogo = !!logo && logo !== brokenLogo
  const logoTone = useLogoTone(showLogo ? logo : undefined)
  // v0.5: puntaje sobre el póster, etiqueta y tráiler al quedarse encima.
  const { posterRating, posterLabels } = useStore(settingsStore)
  const posterLabel = usePosterLabel(meta, posterLabels, hideTop10Label)
  const linkRef = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    const el = linkRef.current
    return () => {
      if (el) disarmTrailer(el)
    }
  }, [])
  // El tráiler se arma con un movimiento real del mouse (pc-02): Chrome manda `mouseenter` con el puntero quieto
  // cuando cambia lo que hay debajo (se cerró el asistente o la tarjeta ampliada), y eso abría tráileres solos.
  const onMove = (e: MouseEvent<HTMLAnchorElement>) => mouseMoveTrailer({ anchor: e.currentTarget, meta, via: 'mouse' }, e.clientX, e.clientY)
  const onFocus = (e: FocusEvent<HTMLAnchorElement>) => {
    prefetch()
    // Solo con teclado o control remoto (no al hacer clic con el mouse).
    // Tampoco cuando el foco vuelve solo (Atrás desde la ficha): el tráiler espera a que el usuario se mueva.
    if (e.currentTarget.matches(':focus-visible') && !justRestored()) armTrailer({ anchor: e.currentTarget, meta, via: 'focus' })
  }

  // a11y-10: el nombre accesible arranca con el título y dice qué es ("Carrie, película, 2026, IMDb 7,8, Estreno,
  // Puesto 2"); lo visual (puesto, etiqueta, puntaje, año) queda `aria-hidden` para que no se lea dos veces.
  const info = subtitle ?? (landscape ? landInfo(meta) : displayYear(meta))
  const ariaLabel = posterAriaLabel({
    name,
    type: meta.type,
    info,
    rating: posterRating === 'off' ? undefined : meta.imdbRating,
    // "Top 10" con el puesto dicho sería repetir.
    label: posterLabel && !(posterLabel === 'top10' && rank !== undefined) ? LABEL_TEXT[posterLabel] : undefined,
    watched,
    rank,
  })

  const card = (
    <Link
      to={to ?? `/detail/${meta.type}/${encodeURIComponent(meta.id)}`}
      ref={linkRef}
      data-focus-id={meta.id}
      data-name={name}
      className={landscape ? 'poster-card is-landscape' : `poster-card shape-${meta.posterShape ?? 'poster'}`}
      aria-label={ariaLabel}
      onMouseEnter={prefetch}
      onMouseMove={onMove}
      onMouseLeave={(e) => disarmTrailer(e.currentTarget, 'mouse')}
      onFocus={onFocus}
      onBlur={(e) => disarmTrailer(e.currentTarget, 'focus')}
      onTouchStart={prefetch}
      // Con `aria-label`, un `title` igual al nombre se leería de nuevo como descripción: en las de póster va en el
      // renglón del título (el tooltip que sirve cuando el nombre queda cortado).
      title={landscape ? name : undefined}
    >
      <div className="poster-img" ref={imgRef}>
        {src && src !== brokenSrc ? (
          <img
            src={src}
            alt=""
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            className={landscape && !backdrop ? 'is-poster' : undefined}
            onError={() => setBrokenSrc(src)}
          />
        ) : (
          !landscape && <div className="poster-fallback">{name}</div>
        )}
        {landscape && (
          <div className="land-art" aria-hidden>
            {showLogo ? (
              <img
                className="land-logo"
                {...logoTone}
                src={logo}
                alt=""
                loading="lazy"
                decoding="async"
                onLoad={(e) => {
                  logoTone.onLoad(e)
                  // Logo vertical de metahub (visual-01): en 16:9 queda ilegible, va el nombre.
                  if (portraitLogo(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)) setBrokenLogo(logo)
                }}
                onError={() => setBrokenLogo(logo)}
              />
            ) : (
              <span className="land-name">{name}</span>
            )}
          </div>
        )}
        {posterLabel && (
          <span className={`poster-label poster-label-${posterLabel}`} aria-hidden>
            {LABEL_TEXT[posterLabel]}
          </span>
        )}
        {/* Arriba a la derecha: el puntaje y, debajo, el ✓ de "vista". */}
        {((posterRating === 'on' && meta.imdbRating) || watched) && (
          <span className="poster-corner" aria-hidden>
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
      <div className="poster-info" aria-hidden>
        {!landscape && (
          <span className="poster-title" title={name}>
            {name}
          </span>
        )}
        <span className="poster-sub">
          {info}
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

/** Debajo de la tarjeta apaisada: "2024 · Ciencia ficción". */
function landInfo(meta: MetaPreview): string {
  const genre = (meta.genres ?? meta.genre ?? [])[0]
  return [displayYear(meta), genre ? genreLabel(genre) : undefined].filter(Boolean).join(' · ')
}

export function PosterSkeleton({ landscape }: { landscape?: boolean }) {
  return (
    <div className={`poster-card skeleton-card${landscape ? ' is-landscape' : ''}`} aria-hidden>
      <div className="poster-img skeleton" />
      {/* Los mismos dos renglones que la tarjeta (título y año): si no, al llegar los datos la fila crecía (1 px en
          PC, ~22 px en la TV, donde el texto es más alto). */}
      <div className="poster-info">
        <span className="poster-title">
          <span className="skeleton skeleton-line" />
          {' '}
        </span>
        <span className="poster-sub">{' '}</span>
      </div>
    </div>
  )
}
