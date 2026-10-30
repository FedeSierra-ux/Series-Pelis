import { useState } from 'react'
import { Link } from 'react-router-dom'
import { smallPoster } from '../../lib/format'
import { useLocalTitle } from '../../lib/localTitles'
import { clearRating, notInterestedStore, ratingsStore, unmarkNotInterested } from '../../lib/ratings'
import { formatStars } from '../../lib/stars'
import { settingsStore, useStore, type Settings } from '../../lib/store'
import { useNearOnce } from '../../lib/titleArt'

const PREVIEW = 8

function TitleRow({ id, type, name: savedName, poster, extra, action, onAction }: {
  id: string
  type: string
  name: string
  poster?: string
  extra?: string
  action: string
  onAction: () => void
}) {
  const img = smallPoster(id, poster)
  // Nombre en español (v0.28), pedido cuando la fila se acerca a la pantalla.
  const [ref, near] = useNearOnce<HTMLLIElement>(true)
  const name = useLocalTitle(id, savedName, { type, enabled: near })
  return (
    <li ref={ref} className="taste-item">
      <Link to={`/detail/${type}/${encodeURIComponent(id)}`} className="taste-link">
        {img ? <img src={img} alt="" loading="lazy" decoding="async" /> : <span className="taste-ph" />}
        <span className="taste-name">{name}</span>
        {extra && <span className="user-stars">{extra}</span>}
      </Link>
      <button type="button" className="btn btn-ghost btn-small" onClick={onAction}>
        {action}
      </button>
    </li>
  )
}

/** Ajustes → Gustos y spoilers: modo sin spoilers, tu puntaje y la lista de "No me interesa". */
export function TasteSettings() {
  const settings = useStore(settingsStore)
  const ratings = useStore(ratingsStore)
  const notInterested = useStore(notInterestedStore)
  const [allRatings, setAllRatings] = useState(false)
  const update = (patch: Partial<Settings>) => settingsStore.set((s) => ({ ...s, ...patch }))

  const rated = Object.entries(ratings).sort((a, b) => b[1].at - a[1].at)
  const hidden = Object.values(notInterested).sort((a, b) => b.at - a.at)
  const avg = rated.length ? rated.reduce((n, [, r]) => n + r.stars, 0) / rated.length : 0

  return (
    <section className="settings-section taste-settings">
      <h2>Gustos y spoilers</h2>
      <label className="check">
        <input type="checkbox" checked={settings.spoilerFree} onChange={(e) => update({ spoilerFree: e.target.checked })} />
        Modo sin spoilers: difuminar las miniaturas y ocultar las sinopsis de los episodios que no viste
      </label>
      <label className={`check${settings.spoilerFree ? '' : ' muted'}`}>
        <input
          type="checkbox"
          checked={settings.spoilerUnstarted}
          disabled={!settings.spoilerFree}
          onChange={(e) => update({ spoilerUnstarted: e.target.checked })}
        />
        Ocultar también la sinopsis de las pelis y series que no empezaste
      </label>
      <p className="muted small">
        Se ve en la ficha, el calendario y la pausa del reproductor. Tocá la sinopsis (o elegí el episodio) para verla igual.
      </p>
      <label className="check">
        <input type="checkbox" checked={settings.askRatingAtEnd} onChange={(e) => update({ askRatingAtEnd: e.target.checked })} />
        Preguntar tu puntaje al terminar una peli o el último episodio de una serie
      </label>

      <h3>Tus puntajes</h3>
      {rated.length === 0 ? (
        <p className="muted">Todavía no puntuaste nada. Usá las estrellas de cada ficha: lo que te gusta pesa en “Para vos”.</p>
      ) : (
        <>
          <p className="muted small">
            {rated.length} {rated.length === 1 ? 'título' : 'títulos'} · promedio ★ {formatStars(Math.round(avg * 10) / 10)}
          </p>
          <ul className="taste-list">
            {(allRatings ? rated : rated.slice(0, PREVIEW)).map(([id, r]) => (
              <TitleRow
                key={id}
                id={id}
                type={r.type}
                name={r.name}
                poster={r.poster}
                extra={`★ ${formatStars(r.stars)}`}
                action="Quitar"
                onAction={() => clearRating(id)}
              />
            ))}
          </ul>
          {rated.length > PREVIEW && (
            <button type="button" className="btn btn-small" onClick={() => setAllRatings((v) => !v)}>
              {allRatings ? 'Mostrar menos' : `Mostrar todos (${rated.length})`}
            </button>
          )}
        </>
      )}

      <h3>No me interesa</h3>
      {hidden.length === 0 ? (
        <p className="muted">Nada por ahora. Con “No me interesa” en una ficha, ese título deja de aparecer en Inicio y en “Para vos”.</p>
      ) : (
        <ul className="taste-list">
          {hidden.map((e) => (
            <TitleRow
              key={e.id}
              id={e.id}
              type={e.type}
              name={e.name}
              poster={e.poster}
              action="Volver a recomendar"
              onAction={() => unmarkNotInterested(e.id)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
