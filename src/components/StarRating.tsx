import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { clearRating, setRating, useRating, type RatedTitle } from '../lib/ratings'
import { formatStars, MAX_STARS, starFill, starsFromKey, starsFromPointer, starsLabel } from '../lib/stars'

const STARS = [1, 2, 3, 4, 5]

/** Las 5 estrellas pintadas (llenas, medias o vacías). Solo dibujo. */
export function StarIcons({ value, className = '' }: { value: number; className?: string }) {
  return (
    <span className={`stars ${className}`} aria-hidden>
      {STARS.map((i) => (
        <span key={i} className={`star star-${starFill(value, i)}`} data-star={i}>
          ★
        </span>
      ))}
    </span>
  )
}

/** "★ 4,5" chiquito con tu puntaje (nada si no lo puntuaste). */
export function UserStars({ id, className = '' }: { id: string; className?: string }) {
  const rating = useRating(id)
  if (!rating) return null
  return (
    <span className={`user-stars ${className}`} title={`Tu puntaje: ${starsLabel(rating.stars)}`} aria-label={`Tu puntaje: ${starsLabel(rating.stars)}`}>
      ★ {formatStars(rating.stars)}
    </span>
  )
}

interface Props {
  title: RatedTitle
  tmdbId?: number
  /** Texto arriba de las estrellas. */
  label?: string
  autoFocus?: boolean
  /** Después de guardar (para cerrar la tarjeta del final, por ejemplo). */
  onSaved?: (stars: number) => void
  /** Sin el botón "Quitar" ni la ayuda larga (tarjeta del reproductor). */
  compact?: boolean
}

/**
 * Tu puntaje de 0,5 a 5 estrellas. Con el control remoto: ← → eligen de a media estrella (o 1 a 5
 * directo) y Enter confirma; Atrás o salir de las estrellas descarta. En los bordes la flecha pasa
 * al botón de al lado. Con mouse o dedo: la mitad
 * izquierda de una estrella vale media.
 */
/** `:focus-visible`, o true en navegadores que no lo conocen (los de TV viejos, que van con control). */
function focusVisible(el: HTMLElement) {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

export function StarRatingInput({ title, tmdbId, label = 'Tu puntaje', autoFocus, onSaved, compact }: Props) {
  const rating = useRating(title.id)
  const saved = rating?.stars
  const [draft, setDraft] = useState<number>()
  const [hover, setHover] = useState<number>()
  const [focused, setFocused] = useState(false)
  const [flash, setFlash] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(flashTimer.current), [])
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true })
  }, [autoFocus])

  const shown = hover ?? draft ?? saved ?? 0

  const commit = (stars: number) => {
    setRating(title, stars, tmdbId)
    setDraft(undefined)
    setFlash(true)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(false), 1800)
    onSaved?.(stars)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const own = () => {
      e.preventDefault()
      // El reproductor escucha las teclas en window: que no adelante el video ni salga.
      e.nativeEvent.stopPropagation()
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (draft !== undefined) {
        own()
        commit(draft)
      } else if (e.key === ' ') own()
      return
    }
    if ((e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') && draft !== undefined) {
      own()
      setDraft(undefined)
      return
    }
    const current = draft ?? saved
    const next = starsFromKey(current, e.key)
    // En los bordes (← sin puntaje o en 0,5; → en 5) la flecha sigue de largo: así el foco no
    // queda atrapado en la fila y se puede llegar a los botones de al lado.
    if (next === undefined || (next === current && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))) return
    own()
    setDraft(next)
  }

  const pointerValue = (e: MouseEvent<HTMLElement>) => {
    const star = (e.target as HTMLElement).closest<HTMLElement>('[data-star]')
    if (!star) return undefined
    const r = star.getBoundingClientRect()
    return starsFromPointer(Number(star.dataset.star), r.width ? (e.clientX - r.left) / r.width : 1)
  }

  const hint = flash
    ? '✓ Guardado'
    : draft !== undefined
      ? `${formatStars(draft)} · Enter para guardar`
      : focused
        ? '← → para elegir'
        : saved !== undefined
          ? formatStars(saved)
          : compact
            ? ''
            : 'Sin puntuar'

  return (
    <div className={`star-rating${compact ? ' compact' : ''}`}>
      <div
        ref={ref}
        className={`star-input${draft !== undefined ? ' drafting' : ''}`}
        role="slider"
        tabIndex={0}
        aria-labelledby={label ? `stars-${title.id}` : undefined}
        aria-label={label ? undefined : 'Tu puntaje'}
        aria-valuemin={0}
        aria-valuemax={MAX_STARS}
        aria-valuenow={draft ?? saved ?? 0}
        aria-valuetext={draft !== undefined ? `${starsLabel(draft)}, Enter para guardar` : saved !== undefined ? starsLabel(saved) : 'Sin puntuar'}
        onKeyDown={onKeyDown}
        // La ayuda de las flechas solo con teclado o control remoto: con el dedo o el mouse no sirve.
        onFocus={(e) => setFocused(focusVisible(e.currentTarget))}
        onBlur={() => {
          setFocused(false)
          setDraft(undefined)
        }}
        onMouseMove={(e) => setHover(pointerValue(e))}
        onMouseLeave={() => setHover(undefined)}
        onClick={(e) => {
          const v = pointerValue(e)
          if (v !== undefined) commit(v)
        }}
      >
        <StarIcons value={shown} />
      </div>
      {/* El texto va después de las estrellas: así quedan alineadas con los botones de arriba y
          la navegación con flechas las encuentra al bajar. */}
      {label && (
        <span className="star-rating-label" id={`stars-${title.id}`}>
          {label}
        </span>
      )}
      <span className="star-rating-hint" aria-live="polite">
        {hint}
      </span>
      {!compact && saved !== undefined && (
        <button type="button" className="btn btn-ghost btn-small star-clear" onClick={() => clearRating(title.id)}>
          Quitar
        </button>
      )}
    </div>
  )
}
