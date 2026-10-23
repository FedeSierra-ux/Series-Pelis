import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PosterSkeleton } from './PosterCard'
import { ReportButton } from './ReportButton'
import './rows.css'

interface Props {
  title: string
  moreTo?: string
  loading?: boolean
  error?: string
  empty?: boolean
  /** Si se pasa, cuando falla y no hay nada para mostrar queda la fila con este aviso en vez de desaparecer. */
  errorNotice?: string
  /** Datos para el informe del aviso (ej. `{ addon: addon.transportUrl }`: se manda solo el host). */
  reportContext?: Record<string, string | undefined>
  /** Muestra lo anterior atenuado mientras carga lo nuevo (ej. resultados de la búsqueda anterior). */
  stale?: boolean
  /** Fila de tarjetas apaisadas: los esqueletos de carga tienen esa forma. */
  landscape?: boolean
  /** Bajada debajo del título (ej. el porqué de "Para vos" cuando es el mismo para toda la fila). */
  subtitle?: string
  /** Esqueletos de carga propios (ej. el Top 10 con el lugar del número); si no, 8 pósters grises. */
  skeleton?: ReactNode
  children: ReactNode
}

/** Margen para dar por llegado al borde (redondeos del zoom). */
const EDGE_PX = 4

/**
 * Flechas ‹ › para recorrer la fila con el mouse (en Windows la rueda vertical no mueve una fila
 * horizontal). Avanzan una "página" de tarjetas y el `scroll-snap` deja la fila alineada a una tarjeta.
 * El CSS solo las muestra con un mouse de verdad y fuera del modo TV; quedan fuera del orden de foco
 * y la navegación con flechas no las elige (`data-nav-skip`).
 */
function useRowPaging(deps: unknown) {
  // Con estado (no useRef): la fila puede aparecer recién cuando llegan los datos.
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  const measure = useCallback(() => {
    if (!el) return
    const start = el.scrollLeft <= EDGE_PX
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - EDGE_PX
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [el])

  useEffect(() => {
    if (!el) return
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : undefined
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', measure)
      ro?.disconnect()
    }
  }, [el, measure])

  // Llegaron (o se fueron) tarjetas: el ancho total cambió.
  useEffect(() => {
    measure()
  }, [deps, measure])

  const page = (dir: -1 | 1) => {
    if (!el) return
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth - pad * 2), behavior: reduced ? 'auto' : 'smooth' })
  }

  return { ref: setEl, edges, page }
}

// Las flechas no se quedan con el foco al tocarlas (si no, el anillo queda pintado).
const noFocus = (e: React.MouseEvent) => e.preventDefault()

export function Row({ title, moreTo, loading, error, empty, errorNotice, reportContext, stale, landscape, subtitle, skeleton, children }: Props) {
  const showSkeleton = !!(loading && empty)
  const { ref, edges, page } = useRowPaging(showSkeleton ? 'skeleton' : children)

  if (!loading && error && empty && errorNotice) {
    return (
      <section className="row" data-row-key={title}>
        <header className="row-header">
          <h2>{title}</h2>
        </header>
        <div className="row-notice has-report" role="status" title={error}>
          <span>{errorNotice}</span>
          <ReportButton kind="addon" error={error} context={{ fila: title, ...reportContext }} className="btn btn-ghost btn-small" />
        </div>
      </section>
    )
  }
  if (!loading && (empty || (error && empty !== false))) return null
  return (
    // `data-row-key`: la memoria de foco vuelve al póster en esta fila (puede estar repetido en otra);
    // `data-row-loading`: todavía no llegaron las tarjetas, hay que esperarla.
    <section className="row" data-row-key={title} data-row-loading={showSkeleton || undefined}>
      <header className="row-header">
        {subtitle ? (
          <div className="row-titles">
            <h2>{title}</h2>
            <p className="row-sub">{subtitle}</p>
          </div>
        ) : (
          <h2>{title}</h2>
        )}
        {moreTo && (
          // Mientras la fila muestra el esqueleto no se puede enfocar (tv-13): ↓ desde la fila de arriba caía acá,
          // el único enfocable de la fila, y la pantalla se anclaba al título.
          <Link to={moreTo} className="row-more" tabIndex={showSkeleton ? -1 : undefined} data-nav-skip={showSkeleton || undefined}>
            Ver todo
          </Link>
        )}
      </header>
      <div className="row-body">
        <div ref={ref} className={stale ? 'row-scroller is-stale' : 'row-scroller'} aria-busy={stale || undefined}>
          {showSkeleton ? (skeleton ?? Array.from({ length: 8 }, (_, i) => <PosterSkeleton key={i} landscape={landscape} />)) : children}
        </div>
        {!showSkeleton && (
          <>
            <button
              type="button"
              className="row-page is-prev"
              tabIndex={-1}
              data-nav-skip
              aria-label={`${title}: anteriores`}
              hidden={edges.start}
              onMouseDown={noFocus}
              onClick={() => page(-1)}
            >
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <button
              type="button"
              className="row-page is-next"
              tabIndex={-1}
              data-nav-skip
              aria-label={`${title}: siguientes`}
              hidden={edges.end}
              onMouseDown={noFocus}
              onClick={() => page(1)}
            >
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}
      </div>
    </section>
  )
}
