import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { PeopleLinks } from '../../components/DetailTags'
import { CastRow } from '../../components/TmdbExtras'
import type { SeriesFacts } from '../../lib/seriesDetails'
import type { TmdbDetails } from '../../lib/tmdb'
import './series-details.css'

// Pestaña "Detalles" de una serie (v0.25): el reparto (la misma fila de siempre) y debajo, en texto,
// quién la creó o la dirigió, el país y dónde se ve en Argentina. Las pelis no tienen esta pestaña:
// su reparto sigue arriba de las fuentes. Los nombres son links (a la persona o a Buscar), así con el
// control remoto ↓ desde el reparto se llega a los datos y la página baja hasta ellos.

interface Props {
  tmdb?: TmdbDetails
  facts: SeriesFacts
  /** Nombres → id de TMDB, para los creadores que vienen de Cinemeta. */
  peopleIndex?: Map<string, number>
}

function People({ people, index }: { people: NonNullable<SeriesFacts['people']>['people']; index?: Map<string, number> }) {
  // Sin ids (vienen de Cinemeta) se resuelven igual que en la portada: por nombre, o a Buscar.
  if (people.some((p) => p.id === undefined)) return <PeopleLinks names={people.map((p) => p.name)} index={index} />
  return (
    <>
      {people.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && ', '}
          <Link className="person-link" to={`/person/${p.id}`}>
            {p.name}
          </Link>
        </Fragment>
      ))}
    </>
  )
}

export function SeriesDetailsPanel({ tmdb, facts, peopleIndex }: Props) {
  const { people, countries, providers } = facts
  const hasFacts = !!people || countries.length > 0 || providers.length > 0

  return (
    <div className="sd">
      {tmdb && <CastRow details={tmdb} type="tv" />}
      {hasFacts && (
        <section className="sd-facts" aria-labelledby="sd-facts-title">
          <h2 id="sd-facts-title" className="d-sr-only">
            Datos de la serie
          </h2>
          <dl className="sd-list">
            {people && (
              <div className="sd-item">
                <dt>{people.label}</dt>
                <dd>
                  <People people={people.people} index={peopleIndex} />
                </dd>
              </div>
            )}
            {countries.length > 0 && (
              <div className="sd-item">
                <dt>{countries.length > 1 ? 'Países' : 'País'}</dt>
                <dd>{countries.join(', ')}</dd>
              </div>
            )}
            {providers.length > 0 && (
              <div className="sd-item">
                <dt>Dónde ver en Argentina</dt>
                <dd>
                  <ul className="sd-providers">
                    {providers.map((g) => (
                      <li key={g.label}>
                        <span className="sd-kind">{g.label}:</span> {g.names.join(', ')}
                      </li>
                    ))}
                  </ul>
                  <span className="sd-source">Datos de JustWatch</span>
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}
    </div>
  )
}
