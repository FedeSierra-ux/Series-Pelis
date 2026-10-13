import { memo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { prefetchMeta } from '../lib/addons'
import { continueSubtitle } from '../lib/remaining'
import { addonsStore, type WatchEntry } from '../lib/store'

// Tarjeta apaisada de "Seguir viendo" del Tema 2: fondo 16:9, título, "T1 E3 · quedan 24 min"
// y la barra de progreso. Con el Tema 1 se sigue usando PosterCard.

function backdropOf(e: WatchEntry): string | undefined {
  if (e.background) return e.background
  if (e.metaId.startsWith('tt')) return `https://images.metahub.space/background/medium/${e.metaId}/img`
  return e.poster
}

interface Props {
  entry: WatchEntry
  to: string
  onRemove: () => void
}

export const ContinueCard = memo(function ContinueCard({ entry: e, to, onRemove }: Props) {
  const [broken, setBroken] = useState(false)
  const backdrop = backdropOf(e)
  const src = broken ? e.poster : backdrop
  const pct = e.duration ? Math.min(100, (e.position / e.duration) * 100) : 0
  const prefetch = () => prefetchMeta(addonsStore.get(), e.type, e.metaId)

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
    onRemove()
    if (neighbor) requestAnimationFrame(() => neighbor.focus({ preventScroll: false }))
  }

  return (
    <div className="t2-cont-wrap" onKeyDown={onKey}>
      <Link to={to} className="t2-cont" title={e.name} onMouseEnter={prefetch} onFocus={prefetch} onTouchStart={prefetch}>
        <div className={`t2-cont-img${broken ? ' is-poster' : ''}`}>
          {src ? (
            <img src={src} alt="" loading="lazy" decoding="async" onError={() => !broken && e.poster && setBroken(true)} />
          ) : (
            <div className="poster-fallback">{e.name}</div>
          )}
          {pct > 0 && (
            <div className="progress-bar">
              <div style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <span className="t2-cont-title">{e.name}</span>
        <span className="t2-cont-sub">{continueSubtitle(e)}</span>
      </Link>
      <button type="button" className="poster-remove t2-cont-remove" aria-label="Quitar de Seguir viendo" title="Quitar de Seguir viendo" onClick={remove}>
        ✕
      </button>
    </div>
  )
})
