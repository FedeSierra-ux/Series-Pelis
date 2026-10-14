import { Link } from 'react-router-dom'
import { tmdbImg } from '../lib/tmdb'
import { Row } from './Row'

// Fila de personas (búsqueda): misma tarjeta redonda que el reparto de la ficha.

export interface PersonLike {
  id: number
  name: string
  profile_path?: string | null
  known_for_department?: string
}

const DEPARTMENTS: Record<string, string> = {
  Acting: 'Actuación',
  Directing: 'Dirección',
  Writing: 'Guion',
  Production: 'Producción',
  Sound: 'Música y sonido',
  Camera: 'Fotografía',
  Editing: 'Montaje',
  Creator: 'Creación',
  Art: 'Arte',
  'Costume & Make-Up': 'Vestuario y maquillaje',
  'Visual Effects': 'Efectos visuales',
  Lighting: 'Iluminación',
  Crew: 'Equipo técnico',
}

export const departmentLabel = (d?: string) => (d ? (DEPARTMENTS[d] ?? d) : undefined)

export function PersonAvatar({ person, size = 'w185' }: { person: PersonLike; size?: 'w185' | 'w92' }) {
  const photo = tmdbImg(person.profile_path, size)
  return photo ? (
    <img className="cast-photo" src={photo} alt="" loading="lazy" decoding="async" />
  ) : (
    <span className="cast-photo cast-initial" aria-hidden>
      {person.name.charAt(0)}
    </span>
  )
}

/** Esqueleto con la misma medida que `.cast-card`: al llegar las personas la fila no cambia de alto. */
function CastSkeleton() {
  return (
    <div className="cast-card cast-skeleton" aria-hidden>
      <span className="cast-photo skeleton" />
      <span className="skeleton skeleton-line" />
      <span className="skeleton skeleton-line" />
    </div>
  )
}

export function PeopleRow({ title, people, loading, stale }: { title: string; people: PersonLike[]; loading?: boolean; stale?: boolean }) {
  // Row pinta esqueletos de póster (más altos): se le pasan los nuestros como contenido.
  if (loading && people.length === 0) {
    return (
      <Row title={title}>
        {Array.from({ length: 8 }, (_, i) => (
          <CastSkeleton key={i} />
        ))}
      </Row>
    )
  }
  return (
    <Row title={title} empty={people.length === 0} stale={stale}>
      {people.map((p) => (
        <PersonCard key={p.id} person={p} />
      ))}
    </Row>
  )
}

function PersonCard({ person: p }: { person: PersonLike }) {
  return (
    <Link to={`/person/${p.id}`} className="cast-card" title={p.name}>
      <PersonAvatar person={p} />
      <span className="cast-name">{p.name}</span>
      {p.known_for_department && <span className="cast-character">{departmentLabel(p.known_for_department)}</span>}
    </Link>
  )
}

/** v0.14: pestaña "Personas" de Buscar: las mismas tarjetas, en grilla en vez de fila. */
export function PeopleGrid({ people, loading, stale, label }: { people: PersonLike[]; loading?: boolean; stale?: boolean; label: string }) {
  return (
    <div className={`people-grid${stale ? ' is-stale' : ''}`} role="list" aria-label={label} aria-busy={loading || undefined}>
      {loading && people.length === 0
        ? Array.from({ length: 12 }, (_, i) => (
            <div key={i} role="listitem">
              <CastSkeleton />
            </div>
          ))
        : people.map((p) => (
            <div key={p.id} role="listitem">
              <PersonCard person={p} />
            </div>
          ))}
    </div>
  )
}
