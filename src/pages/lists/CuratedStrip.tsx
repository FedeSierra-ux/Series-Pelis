import { Link } from 'react-router-dom'
import { CURATED, curatedPath } from '../../lib/curated'

// Accesos a las listas curadas arriba de la grilla de Descubrir.

export function CuratedStrip({ type, tmdbOn }: { type: string; tmdbOn: boolean }) {
  const lists = CURATED.filter((l) => l.type === type && (tmdbOn || !l.needsTmdb)).slice(0, 8)
  if (lists.length === 0) return null
  return (
    <nav className="curated-strip" aria-label="Listas">
      <span className="curated-strip-label muted small">Listas:</span>
      {lists.map((l) => (
        <Link key={l.id} to={curatedPath(l)} className="chip curated-chip">
          {l.title}
        </Link>
      ))}
      <Link to="/lists" className="chip curated-chip curated-more">
        Todas las listas ›
      </Link>
    </nav>
  )
}
