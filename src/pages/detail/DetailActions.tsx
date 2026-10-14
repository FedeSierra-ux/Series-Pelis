import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { StarRatingInput } from '../../components/StarRating'
import { useNotInterested } from '../../components/NotInterested'
import { formatStars } from '../../lib/stars'
import { useRating, type RatedTitle } from '../../lib/ratings'
import { DetailIcon } from './DetailIcons'
import { MoreMenu, type MoreItem } from './MoreMenu'

// Botones de la portada de la ficha (v0.14, U16): un solo botón grande "▶ Reproducir / Continuar
// T2 E4", una fila de íconos con rótulo chico (Mi lista, Calificar, Tráiler) y un ⋯ con lo que se usa
// poco. Antes eran hasta 8 botones del mismo tamaño.

const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])

export interface PrimaryAction {
  label: string
  /** Texto chico debajo ("quedan 23 min", "T1 E1 · Pilot"). */
  sub?: string
  title?: string
  /** Buscando la fuente para reproducir directo. */
  busy?: boolean
  onClick: () => void
}

interface Props {
  title: RatedTitle
  tmdbId?: number
  primary?: PrimaryAction
  inList: boolean
  onToggleList: () => void
  /** Hay tráiler: el ícono lo abre a pantalla completa. */
  onTrailer?: () => void
  /** Ítems del ⋯ además de "No me interesa", que va siempre al final. */
  more: MoreItem[]
}

export function DetailActions({ title, tmdbId, primary, inList, onToggleList, onTrailer, more }: Props) {
  const rating = useRating(title.id)
  const [rateOpen, setRateOpen] = useState(false)
  const rateBtn = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const notInterested = useNotInterested(title, tmdbId)
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const closeRating = () => {
    clearTimeout(closeTimer.current)
    setRateOpen(false)
    requestAnimationFrame(() => rateBtn.current?.focus({ preventScroll: true }))
  }

  // Atrás con las estrellas abiertas (y sin un puntaje a medio elegir): se cierran, no se va de la ficha.
  const onRateKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || !BACK_KEYS.has(e.key)) return
    e.preventDefault()
    e.stopPropagation()
    closeRating()
  }

  const items: MoreItem[] = [
    ...more,
    {
      id: 'not-interested',
      label: notInterested.marked ? 'No me interesa (deshacer)' : 'No me interesa',
      icon: 'ban',
      checked: notInterested.marked,
      onSelect: notInterested.toggle,
    },
  ]

  // Con el control remoto, ↓ desde los botones va siempre a la pestaña elegida (la navegación espacial,
  // desde un ícono de la derecha, se salteaba las pestañas y caía en las temporadas).
  const onActionsKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' || e.defaultPrevented) return
    if (rateOpen && !(e.target as Element).closest('.d-rate')) return
    const tab = document.querySelector<HTMLElement>('.dt-tabs [role="tab"][aria-selected="true"]')
    if (!tab) return
    e.preventDefault()
    tab.focus({ preventScroll: true })
    tab.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return (
    <div className="d-actions" onKeyDown={onActionsKeyDown}>
      <div className="d-actions-row">
        {primary && (
          <button
            type="button"
            className={`btn btn-primary d-play${primary.busy ? ' busy' : ''}`}
            title={primary.title}
            onClick={primary.onClick}
            aria-busy={primary.busy || undefined}
            data-autofocus
          >
            {primary.busy ? <span className="d-play-spinner" aria-hidden /> : <DetailIcon name="play" size={24} />}
            <span className="d-play-text">
              <span className="d-play-label">{primary.label}</span>
              {primary.sub && (
                <span className="d-play-sub" aria-live="polite">
                  {primary.sub}
                </span>
              )}
            </span>
          </button>
        )}
        <div className="d-icons">
          <button type="button" className={`d-icon-btn${inList ? ' on' : ''}`} aria-pressed={inList} onClick={onToggleList}>
            <span className="d-icon-circle">
              <DetailIcon name={inList ? 'check' : 'plus'} />
            </span>
            <span className="d-icon-label">Mi lista</span>
          </button>
          <button
            ref={rateBtn}
            type="button"
            className={`d-icon-btn${rating ? ' on' : ''}`}
            aria-expanded={rateOpen}
            aria-label={rating ? `Tu puntaje: ${formatStars(rating.stars)} estrellas. Cambiar` : 'Calificar'}
            onClick={() => (rateOpen ? closeRating() : setRateOpen(true))}
          >
            <span className="d-icon-circle">
              <DetailIcon name={rating ? 'starFilled' : 'star'} />
            </span>
            <span className="d-icon-label">{rating ? `★ ${formatStars(rating.stars)}` : 'Calificar'}</span>
          </button>
          {onTrailer && (
            <button type="button" className="d-icon-btn" onClick={onTrailer}>
              <span className="d-icon-circle">
                <DetailIcon name="trailer" />
              </span>
              <span className="d-icon-label">Tráiler</span>
            </button>
          )}
          <MoreMenu items={items} />
        </div>
      </div>
      {rateOpen && (
        <div className="d-rate" onKeyDown={onRateKeyDown}>
          <StarRatingInput
            title={title}
            tmdbId={tmdbId}
            autoFocus
            onSaved={() => {
              clearTimeout(closeTimer.current)
              closeTimer.current = setTimeout(closeRating, 1200)
            }}
          />
        </div>
      )}
      {notInterested.toast}
    </div>
  )
}
