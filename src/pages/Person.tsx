import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PosterCard } from '../components/PosterCard'
import { Empty, ErrorBox } from '../components/Status'
import { useTitle } from '../lib/hooks'
import { settingsStore, useStore } from '../lib/store'
import { getPerson, itemYear, tmdbImg, tmdbToPreview, type TmdbListItem, type TmdbPerson } from '../lib/tmdb'

const MAX_KNOWN_FOR = 40
const LONG_BIO = 700

const DEPARTMENTS: Record<string, string> = {
  Acting: 'Actuación',
  Directing: 'Dirección',
  Writing: 'Guion',
  Production: 'Producción',
  Sound: 'Sonido',
  Camera: 'Fotografía',
  Editing: 'Montaje',
  Art: 'Arte',
  'Costume & Make-Up': 'Vestuario y maquillaje',
  'Visual Effects': 'Efectos visuales',
  Lighting: 'Iluminación',
  Crew: 'Equipo técnico',
}

/** "1964-09-02" → "2 de septiembre de 1964" (sin pasar por UTC, que corre el día). */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function ageAt(birth: string, until?: string | null): number | undefined {
  const [by, bm, bd] = birth.split('-').map(Number)
  const end = until ? until.split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()]
  if (!by || !end[0]) return undefined
  const [ey, em, ed] = end
  return ey - by - (em < bm || (em === bm && ed < bd) ? 1 : 0)
}

/** Créditos como intérprete, sin repetidos (una serie aparece una vez por personaje) y por popularidad. */
function knownFor(cast: TmdbListItem[] | undefined): TmdbListItem[] {
  const seen = new Set<string>()
  return (cast ?? [])
    .filter((c) => c.media_type !== 'person')
    .filter((c) => {
      const k = `${c.media_type}:${c.id}`
      return !seen.has(k) && !!seen.add(k)
    })
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .slice(0, MAX_KNOWN_FOR)
}

export function Person() {
  const { id = '' } = useParams()
  const key = useStore(settingsStore).tmdbKey.trim()
  const [state, setState] = useState<{ id: string; person?: TmdbPerson; error?: string }>()
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!key || !/^\d+$/.test(id)) return
    let alive = true
    setExpanded(false)
    getPerson(Number(id))
      .then((person) => alive && setState({ id, person }))
      .catch((err: unknown) => alive && setState({ id, error: err instanceof Error ? err.message : String(err) }))
    return () => {
      alive = false
    }
  }, [id, key])

  const current = state?.id === id ? state : undefined
  const person = current?.person
  useTitle(person?.name)

  // Si no actuó en nada (directores, guionistas), mostramos sus trabajos detrás de cámara.
  const credits = useMemo(() => {
    const cast = knownFor(person?.combined_credits?.cast)
    return cast.length > 0 ? cast : knownFor(person?.combined_credits?.crew)
  }, [person])

  if (!key)
    return (
      <div className="page">
        <Empty>
          Para ver las fichas de actores y actrices cargá una key de TMDB en <Link to="/settings">Ajustes</Link>.
        </Empty>
      </div>
    )
  if (!/^\d+$/.test(id)) return <div className="page"><Empty>No encontramos a esta persona.</Empty></div>
  if (current?.error) return <div className="page"><ErrorBox message={`No se pudo cargar: ${current.error}`} /></div>
  if (!person)
    return (
      <div className="page person">
        <div className="person-head">
          <div className="person-photo skeleton" />
          <div className="person-info">
            <span className="skeleton skeleton-line" />
          </div>
        </div>
      </div>
    )

  const photo = tmdbImg(person.profile_path, 'w342')
  const bio = person.biography?.trim()
  const long = !!bio && bio.length > LONG_BIO
  const age = person.birthday ? ageAt(person.birthday, person.deathday) : undefined
  const department = person.known_for_department && (DEPARTMENTS[person.known_for_department] ?? person.known_for_department)

  return (
    <div className="page person">
      <div className="person-head">
        {photo ? (
          <img className="person-photo" src={photo} alt="" />
        ) : (
          <div className="person-photo cast-initial" aria-hidden>
            {person.name.charAt(0)}
          </div>
        )}
        <div className="person-info">
          <h1>{person.name}</h1>
          {department && <span className="chip">{department}</span>}
          <dl className="credits">
            {person.birthday && (
              <>
                <dt>Nació</dt>
                <dd>
                  {formatDate(person.birthday)}
                  {!person.deathday && age !== undefined && ` (${age} años)`}
                </dd>
              </>
            )}
            {person.place_of_birth && (
              <>
                <dt>Lugar</dt>
                <dd>{person.place_of_birth}</dd>
              </>
            )}
            {person.deathday && (
              <>
                <dt>Murió</dt>
                <dd>
                  {formatDate(person.deathday)}
                  {age !== undefined && ` (a los ${age} años)`}
                </dd>
              </>
            )}
          </dl>
          {bio ? (
            <div className={`person-bio ${long && !expanded ? 'clamped' : ''}`}>
              {bio.split(/\n+/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : (
            <p className="muted">Sin biografía en español.</p>
          )}
          {long && (
            <button className="btn btn-small btn-ghost person-more" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Leer menos' : 'Leer más'}
            </button>
          )}
        </div>
      </div>

      {credits.length > 0 && (
        <section className="person-known">
          <h2>Conocido por</h2>
          <div className="grid">
            {credits.map((c) => {
              const meta = tmdbToPreview(c)
              const sub = [itemYear(c), c.character || c.job].filter(Boolean).join(' · ')
              return <PosterCard key={meta.id} meta={meta} subtitle={sub || undefined} />
            })}
          </div>
        </section>
      )}
    </div>
  )
}
