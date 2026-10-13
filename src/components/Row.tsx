import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PosterSkeleton } from './PosterCard'
import { ReportButton } from './ReportButton'

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
  children: ReactNode
}

export function Row({ title, moreTo, loading, error, empty, errorNotice, reportContext, children }: Props) {
  if (!loading && error && empty && errorNotice) {
    return (
      <section className="row">
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
    <section className="row">
      <header className="row-header">
        <h2>{title}</h2>
        {moreTo && (
          <Link to={moreTo} className="row-more">
            Ver todo
          </Link>
        )}
      </header>
      <div className="row-scroller">
        {loading && empty ? Array.from({ length: 8 }, (_, i) => <PosterSkeleton key={i} />) : children}
      </div>
    </section>
  )
}
