import { useEffect, useRef, useState, type AnimationEvent, type PointerEvent, type ReactNode } from 'react'
import { useMediaQuery } from '../detail/useMediaQuery'
import { HeroIcon } from './HeroInfo'
import './hero.css'

/** Cada cuánto pasa sola la portada. Lo marca la barrita del indicador (ver `onFillEnd`). */
export const ROTATE_MS = 8000
// Un deslizamiento con el dedo cuenta a partir de esto (y si es más horizontal que vertical).
const SWIPE_PX = 50

export interface HeroSlide {
  /** Clave estable del título (por ejemplo `movie:603`). */
  key: string
  /** Nombre para los indicadores ("Destacado 2 de 8: Dune"). */
  title: string
  /** Imagen de fondo apaisada. */
  backdrop?: string
}

interface Props {
  slides: HeroSlide[]
  index: number
  onIndex: (index: number) => void
  /** `compact`: banner redondeado de Inicio (carrusel estilo Disney+). `full`: Películas / Series, de borde a borde (Netflix). */
  variant: 'compact' | 'full'
  /** Nombre del carrusel para los lectores de pantalla. */
  label: string
  /** Lo del título visible (logo, datos, sinopsis, botones). */
  children: ReactNode
  /** Lo que va montado sobre el borde de abajo (el Top 10 en Películas / Series). */
  row?: ReactNode
}

// Las flechas no se quedan con el foco al tocarlas.
const noFocus = (e: React.MouseEvent) => e.preventDefault()

/** La portada solo avanza a la vista y con la pestaña abierta. */
function useOnScreen(ref: React.RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(true)
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden')
  useEffect(() => {
    const onVis = () => setPageVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVis)
    const el = ref.current
    const io = el && typeof IntersectionObserver === 'function' ? new IntersectionObserver(([e]) => setInView(e.intersectionRatio >= 0.4), { threshold: [0, 0.4, 1] }) : undefined
    if (el) io?.observe(el)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      io?.disconnect()
    }
  }, [ref])
  return inView && pageVisible
}

/**
 * Portada con varios títulos: fondos que se funden, indicadores con barra de progreso y flechas al
 * pasar el mouse. Avanza sola cada `ROTATE_MS` y se frena con el mouse encima, con el foco adentro
 * (control remoto, teclado), fuera de la vista, con el botón de pausa o con "reducir movimiento".
 *
 * Con el control remoto los indicadores son botones comunes: ←/→ los recorre `spatialNav` y al
 * enfocar uno se muestra ese título; desde el primero, ← sigue hacia los botones, sin trabar nada.
 */
export function HeroCarousel({ slides, index, onIndex, variant, label, children, row }: Props) {
  const ref = useRef<HTMLElement>(null)
  const onScreen = useOnScreen(ref)
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [hover, setHover] = useState(false)
  const [focusIn, setFocusIn] = useState(false)
  const [userPaused, setUserPaused] = useState(false)
  const swipe = useRef<{ x: number; y: number }>(undefined)

  const count = slides.length
  const current = count ? index % count : 0
  const next = count ? (current + 1) % count : 0
  const multi = count > 1
  const running = multi && !reduced && !userPaused && !hover && !focusIn && onScreen

  // Fondos montados: los vistos y el siguiente (así ya está descargado cuando le toca).
  const [seen, setSeen] = useState(() => new Set([0, 1]))
  useEffect(() => {
    setSeen((s) => (s.has(current) && s.has(next) ? s : new Set([...s, current, next])))
  }, [current, next])

  const go = (i: number) => onIndex(((i % count) + count) % count)

  // La barra del indicador activo es el reloj: al terminar su animación pasa al siguiente. Así la
  // barra y el cambio nunca se desfasan, y pausar (mouse, foco, fuera de la vista) es pausar la animación.
  const onFillEnd = (e: AnimationEvent) => {
    if (e.animationName === 'portada-fill' && running) go(current + 1)
  }

  const onPointerDown = (e: PointerEvent) => {
    swipe.current = e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY } : undefined
  }
  const onPointerUp = (e: PointerEvent) => {
    const start = swipe.current
    swipe.current = undefined
    if (!start || !multi) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return
    go(current + (dx < 0 ? 1 : -1))
  }

  return (
    <section
      ref={ref}
      className={`portada portada--${variant}${running ? '' : ' is-held'}${row ? ' has-row' : ''}`}
      aria-roledescription="carrusel"
      aria-label={label}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={() => setHover(false)}
      // Solo el foco del teclado o del control remoto frena la portada; el de un clic con el mouse, no.
      onFocus={(e) => e.target.matches(':focus-visible') && setFocusIn(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIn(false)
      }}
      style={{ '--portada-ms': `${ROTATE_MS}ms` } as React.CSSProperties}
    >
      <div className="portada-bgs" aria-hidden>
        {slides.map((s, i) =>
          s.backdrop && (seen.has(i) || i === current) ? (
            <img
              key={s.key}
              className={`portada-bg${i === current ? ' is-active' : ''}`}
              src={s.backdrop}
              alt=""
              decoding="async"
              draggable={false}
              fetchPriority={i === current ? 'high' : 'low'}
            />
          ) : null,
        )}
        <div className="portada-shade" />
      </div>

      {multi && variant === 'compact' && (
        // Solo con mouse (el teclado y el control remoto usan los indicadores): fuera del orden de foco.
        <>
          <button type="button" className="portada-arrow is-prev" tabIndex={-1} aria-label="Anterior" onMouseDown={noFocus} onClick={() => go(current - 1)}>
            <HeroIcon name="prev" />
          </button>
          <button type="button" className="portada-arrow is-next" tabIndex={-1} aria-label="Siguiente" onMouseDown={noFocus} onClick={() => go(current + 1)}>
            <HeroIcon name="next" />
          </button>
        </>
      )}

      <div className="portada-main" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (swipe.current = undefined)}>
        {/* Mientras pasa sola no se anuncia cada cambio; quieta (pausa, foco), sí. */}
        <div className="portada-slot" aria-live={running ? 'off' : 'polite'}>
          {children}
        </div>
        {multi && (
          <div className="portada-controls">
            <div className="portada-dots" role="group" aria-label="Elegir destacado">
              {slides.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  className={`portada-dot${i === current ? ' is-active' : ''}`}
                  aria-label={`${i + 1} de ${count}: ${s.title}`}
                  aria-current={i === current || undefined}
                  onClick={() => go(i)}
                  // Con las flechas del control remoto, enfocar un indicador ya muestra ese título.
                  onFocus={() => i !== current && go(i)}
                >
                  <span className="portada-dot-track">
                    {i === current && <i key={`${s.key}-${current}`} onAnimationEnd={onFillEnd} />}
                  </span>
                </button>
              ))}
            </div>
            {!reduced && (
              <button
                type="button"
                className="portada-pause"
                aria-label={userPaused ? 'Seguir pasando los destacados' : 'Pausar los destacados'}
                onClick={() => setUserPaused((p) => !p)}
              >
                <HeroIcon name={userPaused ? 'play' : 'pause'} size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {row && <div className="portada-row">{row}</div>}
    </section>
  )
}
