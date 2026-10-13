import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PosterSkeleton } from './PosterCard'

interface Props {
  title: string
  moreTo?: string
  loading?: boolean
  error?: string
  empty?: boolean
  children: ReactNode
}

export function Row({ title, moreTo, loading, error, empty, children }: Props) {
  if (!loading && (error || empty)) return null
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
