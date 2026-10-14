import { KeywordChips } from '../../components/DetailTags'
import { EmptyState } from '../../components/EmptyState'
import { WatchProviders } from '../../components/TmdbExtras'
import { WikiTrivia } from '../../components/WikiTrivia'
import type { TmdbDetails } from '../../lib/tmdb'
import type { ExtraVideo } from './trailers'

// Contenido de las pestañas "Extras" y "Detalles" de la ficha (v0.14).

/** Tráileres, avances y "detrás de escena" de TMDB. Cada uno se abre en el reproductor de la app. */
export function ExtrasPanel({ videos, onPlay }: { videos: ExtraVideo[]; onPlay: (v: ExtraVideo) => void }) {
  return (
    <section className="d-extras" aria-label="Extras">
      <ul className="d-extras-grid">
        {videos.map((v) => (
          <li key={v.key}>
            <button type="button" className="d-extra" onClick={() => onPlay(v)}>
              <span className="d-extra-thumb">
                <img src={v.thumb} alt="" loading="lazy" decoding="async" />
                <span className="d-extra-play" aria-hidden>
                  ▶
                </span>
              </span>
              <span className="d-extra-text">
                <span className="d-extra-name">{v.name}</span>
                <span className="d-extra-meta">
                  {v.kind}
                  {v.lang && ` · ${v.lang}`}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

interface DetailsProps {
  type: string
  imdbId?: string
  tmdb?: TmdbDetails
  awards?: string
  country?: string
  writers?: string[]
}

/** Dónde ver, premios, palabras clave y "¿Sabías que?" de Wikipedia. */
export function DetailsPanel({ type, imdbId, tmdb, awards, country, writers }: DetailsProps) {
  const facts = [
    awards ? { k: 'Premios', v: awards } : undefined,
    writers?.length ? { k: 'Guion', v: writers.slice(0, 4).join(', ') } : undefined,
    country ? { k: 'País', v: country } : undefined,
  ].filter((f): f is { k: string; v: string } => !!f)
  const nothing = facts.length === 0 && !tmdb && !imdbId

  return (
    <div className="d-details">
      {facts.length > 0 && (
        <section className="d-facts" aria-label="Datos">
          <dl className="credits">
            {facts.map((f) => (
              <div key={f.k} className="d-fact">
                <dt>{f.k}</dt>
                <dd>{f.v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {tmdb && <WatchProviders details={tmdb} />}
      {tmdb && (
        <section className="d-keywords">
          <KeywordChips type={type} tmdbId={tmdb.id} />
        </section>
      )}
      {imdbId && <WikiTrivia imdbId={imdbId} />}
      {nothing && <EmptyState icon="book" title="No hay más datos de este título" />}
    </div>
  )
}
