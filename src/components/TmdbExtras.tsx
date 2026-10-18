import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { progressStore, useStore } from '../lib/store'
import {
  getCollection,
  imdbFromTmdb,
  itemTitle,
  providersFor,
  tmdbImg,
  tmdbToPreview,
  type TmdbDetails,
  type TmdbListItem,
  type TmdbProvider,
  type TmdbType,
} from '../lib/tmdb'
import { localToday } from '../pages/detail/episodes'
import { mergeCast } from '../pages/detail/castPeople'
import { PosterCard } from './PosterCard'
import { Row } from './Row'

// Secciones de la ficha que salen de TMDB (reparto, saga, recomendaciones y dónde ver).
// Solo se muestran si hay key de TMDB; sin datos no pintan nada.

const MAX_CAST = 15
const MAX_RECS = 20

export function CastRow({ details, type }: { details: TmdbDetails; type: TmdbType }) {
  // En series el reparto "agregado" junta todas las temporadas. Una tarjeta por persona aunque haga
  // varios papeles ("Rol 1 / Rol 2"), así no se repiten (ni chocan las keys).
  const people = useMemo(() => {
    const cast = type === 'tv' ? details.aggregate_credits?.cast : details.credits?.cast
    return mergeCast(cast ?? [], MAX_CAST).map((c) => ({ ...c, photo: tmdbImg(c.profile_path, 'w185') }))
  }, [details, type])

  return (
    <Row title="Reparto" empty={people.length === 0}>
      {people.map((p) => (
        <Link key={p.id} to={`/person/${p.id}`} className="cast-card" title={p.name}>
          {p.photo ? (
            <img className="cast-photo" src={p.photo} alt="" loading="lazy" decoding="async" />
          ) : (
            <span className="cast-photo cast-initial" aria-hidden>
              {p.name.charAt(0)}
            </span>
          )}
          <span className="cast-name">{p.name}</span>
          {p.character && <span className="cast-character">{p.character}</span>}
        </Link>
      ))}
    </Row>
  )
}

function recommendations(details: TmdbDetails): TmdbListItem[] {
  const recs = details.recommendations?.results ?? []
  const list = recs.length > 0 ? recs : (details.similar?.results ?? [])
  return list.filter((i) => i.media_type !== 'person')
}

/** ¿Hay algo para la pestaña "Más como esto" de la ficha (recomendaciones o una saga)? */
export function hasMoreLikeThis(details: TmdbDetails | undefined, type: TmdbType): boolean {
  return !!details && (recommendations(details).length > 0 || (type === 'movie' && !!details.belongs_to_collection))
}

export function MoreLikeThis({ details, type }: { details: TmdbDetails; type: TmdbType }) {
  const items = useMemo(() => recommendations(details).slice(0, MAX_RECS).map((i) => tmdbToPreview(i, type)), [details, type])

  return (
    <Row title="Más como esto" empty={items.length === 0}>
      {items.map((m) => (
        <PosterCard key={m.id} meta={m} />
      ))}
    </Row>
  )
}

// Fecha local: con `toISOString` en Argentina el día cambiaba a las 21:00.
const today = () => localToday()

/** Saga de una peli: partes en orden de estreno y cuántas viste. */
export function SagaBlock({ details }: { details: TmdbDetails }) {
  const collection = details.belongs_to_collection
  const progress = useStore(progressStore)
  const [parts, setParts] = useState<TmdbListItem[]>()
  const [imdbIds, setImdbIds] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!collection) return
    let alive = true
    setParts(undefined)
    getCollection(collection.id)
      .then((c) => {
        if (!alive) return
        const sorted = [...c.parts].sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999'))
        setParts(sorted)
        // El id de IMDb de cada parte (cacheado 30 días) es lo que cruza con el historial.
        return Promise.allSettled(sorted.map((p) => imdbFromTmdb(p.id, 'movie').then((tt) => [p.id, tt] as const))).then(
          (results) => {
            if (!alive) return
            const map: Record<number, string> = {}
            for (const r of results) if (r.status === 'fulfilled' && r.value[1]) map[r.value[0]] = r.value[1]
            setImdbIds(map)
          },
        )
      })
      .catch(() => alive && setParts([]))
    return () => {
      alive = false
    }
  }, [collection?.id])

  const watchedIds = useMemo(
    () => new Set(Object.values(progress).filter((e) => e.type === 'movie' && e.watched).map((e) => e.metaId)),
    [progress],
  )

  if (!collection || !parts || parts.length < 2) return null

  const now = today()
  const isReleased = (p: TmdbListItem) => !!p.release_date && p.release_date <= now
  const isWatched = (p: TmdbListItem) => !!imdbIds[p.id] && watchedIds.has(imdbIds[p.id])
  const released = parts.filter(isReleased)
  const seen = released.filter(isWatched).length
  // La siguiente sin ver (que no sea la que ya estás mirando).
  const next = released.find((p) => p.id !== details.id && !isWatched(p))
  const linkFor = (p: TmdbListItem) => (imdbIds[p.id] ? `/detail/movie/${imdbIds[p.id]}` : undefined)

  return (
    <section className="row saga">
      <header className="row-header saga-header">
        <div>
          <h2>Saga: {collection.name}</h2>
          <p className="muted small">
            Viste {seen} de {released.length}
          </p>
        </div>
        {next && (
          <Link className="btn btn-small btn-primary" to={linkFor(next) ?? `/detail/movie/tmdb:movie:${next.id}`}>
            Seguir con: {itemTitle(next)}
          </Link>
        )}
      </header>
      <div className="row-scroller">
        {parts.map((p) => {
          const here = p.id === details.id
          return (
            <PosterCard
              key={p.id}
              meta={tmdbToPreview(p, 'movie')}
              to={linkFor(p)}
              current={here}
              watched={isWatched(p)}
              subtitle={here ? 'Estás acá' : isReleased(p) ? undefined : 'Próximamente'}
            />
          )
        })}
      </div>
    </section>
  )
}

function uniqueProviders(...lists: (TmdbProvider[] | undefined)[]): TmdbProvider[] {
  const seen = new Set<number>()
  return lists
    .flatMap((l) => l ?? [])
    .sort((a, b) => a.display_priority - b.display_priority)
    .filter((p) => !seen.has(p.provider_id) && !!seen.add(p.provider_id))
}

/** Dónde ver en Argentina (datos de JustWatch vía TMDB). */
export function WatchProviders({ details }: { details: TmdbDetails }) {
  const p = providersFor(details)
  if (!p) return null
  const groups = [
    { label: 'Incluido en suscripción', list: uniqueProviders(p.flatrate) },
    { label: 'Gratis', list: uniqueProviders(p.free, p.ads) },
    { label: 'Alquiler', list: uniqueProviders(p.rent) },
    { label: 'Compra', list: uniqueProviders(p.buy) },
  ].filter((g) => g.list.length > 0)
  if (groups.length === 0) return null

  return (
    <section className="providers">
      <h2>Dónde ver en Argentina</h2>
      <div className="providers-groups">
        {groups.map((g) => (
          <div key={g.label} className="providers-group">
            <h3>{g.label}</h3>
            <div className="providers-logos">
              {g.list.map((prov) => (
                <img
                  key={prov.provider_id}
                  src={tmdbImg(prov.logo_path, 'w92')}
                  alt={prov.provider_name}
                  title={prov.provider_name}
                  loading="lazy"
                  decoding="async"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="providers-foot">
        {p.link && (
          <a className="btn btn-small" href={p.link} target="_blank" rel="noreferrer">
            Ver opciones
          </a>
        )}
        <span className="muted small">Datos de JustWatch</span>
      </div>
    </section>
  )
}

/** Todo lo de TMDB que va debajo de los streams. */
export function TmdbSections({ details, type }: { details: TmdbDetails; type: TmdbType }) {
  return (
    <>
      {type === 'movie' && details.belongs_to_collection && <SagaBlock details={details} />}
      <CastRow details={details} type={type} />
      <MoreLikeThis details={details} type={type} />
      <WatchProviders details={details} />
    </>
  )
}
