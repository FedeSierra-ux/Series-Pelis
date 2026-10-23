import { memo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { prefetchMeta } from '../lib/addons'
import { useLocalTitle } from '../lib/localTitles'
import { continueSubtitle } from '../lib/remaining'
import { addonsStore, type WatchEntry } from '../lib/store'
import { useNearOnce } from '../lib/titleArt'
import './rows.css'

// Tarjeta apaisada de "Seguir viendo" del Tema 2: fondo 16:9, título, "T1 E3 · quedan 24 min"
// y la barra de progreso. Con el Tema 1 se sigue usando PosterCard.

/** Fondo 16:9 de un título: el que trae la meta o, para ids de IMDb, el de metahub. */
export function backdropFor(metaId: string, background?: string): string | undefined {
  if (background) return background
  if (metaId.startsWith('tt')) return `https://images.metahub.space/background/medium/${metaId}/img`
  return undefined
}

interface Props {
  entry: WatchEntry
  to: string
  onRemove: () => void
  /** Reproduce directo (sin pasar por la ficha); `to` queda para abrir en otra pestaña y como respaldo. */
  onPlay?: () => void
  busy?: boolean
  /** Ficha del título (botón ⓘ). */
  infoTo?: string
}

export const ContinueCard = memo(function ContinueCard({ entry: e, to, onRemove, onPlay, busy, infoTo }: Props) {
  return (
    <LandscapeCard
      metaId={e.metaId}
      type={e.type}
      name={e.name}
      subtitle={continueSubtitle(e)}
      backdrop={backdropFor(e.metaId, e.background) ?? e.poster}
      poster={e.poster}
      progress={e.duration ? e.position / e.duration : 0}
      to={to}
      onRemove={onRemove}
      removeLabel="Quitar de Seguir viendo"
      onPlay={onPlay}
      busy={busy}
      infoTo={infoTo}
    />
  )
})

interface LandscapeProps {
  metaId: string
  type: string
  name: string
  subtitle?: string
  backdrop?: string
  poster?: string
  /** De 0 a 1. */
  progress?: number
  to: string
  onRemove?: () => void
  removeLabel?: string
  /** Si está, OK / clic reproduce directo en vez de seguir el enlace (que queda para abrir en otra pestaña). */
  onPlay?: () => void
  /** Buscando la fuente: "Buscando fuente…" encima de la imagen. */
  busy?: boolean
  /** Ficha del título: botón chico ⓘ arriba (con ↑ desde la tarjeta, igual que el ✕). */
  infoTo?: string
  /** Etiqueta sobre la imagen ("Siguiente", "Episodio nuevo"). */
  badge?: string
}

/** "Más info" abre la ficha sin la cuenta regresiva del modo automático. */
const INFO_STATE = { noAuto: true }

/** Tarjeta apaisada genérica (Seguir viendo, Próximos episodios…) del Tema 2. */
export const LandscapeCard = memo(function LandscapeCard({
  metaId,
  type,
  name: savedName,
  subtitle,
  backdrop,
  poster,
  progress,
  to,
  onRemove,
  removeLabel,
  onPlay,
  busy,
  infoTo,
  badge,
}: LandscapeProps) {
  // v0.28: el nombre guardado es el original; se muestra el de TMDB en español si se sabe, y si no se pide
  // cuando la tarjeta se acerca a la pantalla (igual que en PosterCard).
  const [wrapRef, near] = useNearOnce<HTMLDivElement>(true)
  const name = useLocalTitle(metaId, savedName, { type, enabled: near })
  const [broken, setBroken] = useState(false)
  const src = broken ? poster : backdrop
  const pct = progress ? Math.min(100, progress * 100) : 0
  const prefetch = () => prefetchMeta(addonsStore.get(), type, metaId)
  const hasActions = !!onRemove || !!infoTo

  // Igual que en PosterCard: con ↑ desde la tarjeta se llega a los botones de arriba (ⓘ, ✕) y con ↓ se vuelve.
  const onKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    const target = ev.target as HTMLElement
    if (ev.key === 'ArrowUp' && target.classList.contains('t2-cont')) {
      ev.preventDefault()
      target.parentElement?.querySelector<HTMLElement>('.t2-cont-action')?.focus()
    } else if (ev.key === 'ArrowDown' && target.classList.contains('t2-cont-action')) {
      ev.preventDefault()
      target.parentElement?.parentElement?.querySelector<HTMLElement>('.t2-cont')?.focus()
    }
  }
  const remove = (ev: MouseEvent<HTMLButtonElement>) => {
    const wrap = ev.currentTarget.closest('.t2-cont-wrap')
    const neighbor = (wrap?.nextElementSibling ?? wrap?.previousElementSibling)?.querySelector<HTMLElement>('.t2-cont')
    onRemove?.()
    if (neighbor) requestAnimationFrame(() => neighbor.focus({ preventScroll: false }))
  }
  const click = (ev: MouseEvent<HTMLAnchorElement>) => {
    // Ctrl/⌘/clic del medio: abrir la ficha en otra pestaña como cualquier enlace.
    if (!onPlay || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return
    ev.preventDefault()
    onPlay()
  }
  const label = removeLabel ?? 'Quitar'

  return (
    <div ref={wrapRef} className={`t2-cont-wrap${busy ? ' is-busy' : ''}`} onKeyDown={hasActions ? onKey : undefined}>
      <Link
        to={to}
        className="t2-cont"
        title={name}
        aria-busy={busy || undefined}
        aria-label={onPlay ? `Reproducir ${name}${subtitle ? `, ${subtitle}` : ''}` : undefined}
        onClick={click}
        onMouseEnter={prefetch}
        onFocus={prefetch}
        onTouchStart={prefetch}
      >
        <div className={`t2-cont-img${broken ? ' is-poster' : ''}`}>
          {src ? (
            <img src={src} alt="" loading="lazy" decoding="async" onError={() => !broken && poster && setBroken(true)} />
          ) : (
            <div className="poster-fallback">{name}</div>
          )}
          {badge && <span className="t2-cont-badge">{badge}</span>}
          {onPlay && !busy && (
            <span className="t2-cont-play" aria-hidden>
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path d="M8 5.5v13a.5.5 0 0 0 .77.42l10-6.5a.5.5 0 0 0 0-.84l-10-6.5A.5.5 0 0 0 8 5.5z" fill="currentColor" />
              </svg>
            </span>
          )}
          {busy && (
            <span className="t2-cont-busy" role="status">
              <span className="t2-cont-spinner" aria-hidden />
              Buscando fuente…
            </span>
          )}
          {pct > 0 && (
            <div className="progress-bar">
              <div style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <span className="t2-cont-title">{name}</span>
        {subtitle && <span className="t2-cont-sub">{subtitle}</span>}
      </Link>
      {hasActions && (
        <div className="t2-cont-actions">
          {infoTo && (
            // `data-nav-skip` (visual-05): ↓ desde la portada cae en la tarjeta, no en estos botoncitos (más cerca); con
            // ↑ desde la tarjeta se sigue llegando (`onKey`). Mouse y Tab, como siempre.
            <Link to={infoTo} state={INFO_STATE} className="poster-remove t2-cont-action t2-cont-info" aria-label={`Ficha de ${name}`} title="Ver la ficha" data-nav-skip>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v6M12 7.5v.01" />
              </svg>
            </Link>
          )}
          {onRemove && (
            <button type="button" className="poster-remove t2-cont-action t2-cont-remove" aria-label={label} title={label} onClick={remove} data-nav-skip>
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  )
})
