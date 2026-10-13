import { memo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { prefetchMeta } from '../lib/addons'
import { continueSubtitle } from '../lib/remaining'
import { addonsStore, type WatchEntry } from '../lib/store'

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
}

export const ContinueCard = memo(function ContinueCard({ entry: e, to, onRemove }: Props) {
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
}

/** Tarjeta apaisada genérica (Seguir viendo, Próximos episodios…) del Tema 2. */
export const LandscapeCard = memo(function LandscapeCard({
  metaId,
  type,
  name,
  subtitle,
  backdrop,
  poster,
  progress,
  to,
  onRemove,
  removeLabel,
}: LandscapeProps) {
  const [broken, setBroken] = useState(false)
  const src = broken ? poster : backdrop
  const pct = progress ? Math.min(100, progress * 100) : 0
  const prefetch = () => prefetchMeta(addonsStore.get(), type, metaId)

  // Igual que en PosterCard: con ↑ desde la tarjeta se llega al ✕ y con ↓ se vuelve.
  const onKey = (ev: KeyboardEvent<HTMLDivElement>) => {
    const target = ev.target as HTMLElement
    if (ev.key === 'ArrowUp' && target.classList.contains('t2-cont')) {
      ev.preventDefault()
      target.parentElement?.querySelector<HTMLElement>('.t2-cont-remove')?.focus()
    } else if (ev.key === 'ArrowDown' && target.classList.contains('t2-cont-remove')) {
      ev.preventDefault()
      target.parentElement?.querySelector<HTMLElement>('.t2-cont')?.focus()
    }
  }
  const remove = (ev: MouseEvent<HTMLButtonElement>) => {
    const wrap = ev.currentTarget.parentElement
    const neighbor = (wrap?.nextElementSibling ?? wrap?.previousElementSibling)?.querySelector<HTMLElement>('.t2-cont')
    onRemove?.()
    if (neighbor) requestAnimationFrame(() => neighbor.focus({ preventScroll: false }))
  }
  const label = removeLabel ?? 'Quitar'

  return (
    <div className="t2-cont-wrap" onKeyDown={onRemove ? onKey : undefined}>
      <Link to={to} className="t2-cont" title={name} onMouseEnter={prefetch} onFocus={prefetch} onTouchStart={prefetch}>
        <div className={`t2-cont-img${broken ? ' is-poster' : ''}`}>
          {src ? (
            <img src={src} alt="" loading="lazy" decoding="async" onError={() => !broken && poster && setBroken(true)} />
          ) : (
            <div className="poster-fallback">{name}</div>
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
      {onRemove && (
        <button type="button" className="poster-remove t2-cont-remove" aria-label={label} title={label} onClick={remove}>
          ✕
        </button>
      )}
    </div>
  )
})
