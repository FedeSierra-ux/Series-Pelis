import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ContinueCard } from '../components/ContinueCard'
import { PosterCard } from '../components/PosterCard'
import { Row } from '../components/Row'
import { Theme2Icon, type Theme2IconName } from '../components/Theme2Icons'
import { useTitle } from '../lib/hooks'
import { localTitle } from '../lib/localTitles'
import { formatStars, isHighStars } from '../lib/stars'
import { continueWatching, progressStore, ratingsStore, useStore } from '../lib/store'
import { useUndoHide } from '../lib/undoHide'
import { HistoryGoal } from './goals/GoalLink'
import { HistoryFeed, HistoryStats } from './history/HistoryFeed'
import { MyListSection } from './MyList'
import './me.css'

// v0.14 (U26): "Vos", estilo "Mi Netflix" pero con el historial adentro. Junta lo personal que antes estaba
// repartido: Seguir viendo, Mi lista, lo que te gustó (4-5 ★), lo que viste (por día) y los accesos.
// v0.23: Mi lista completa (en grilla) es lo principal, y los accesos son Historial, Calendario y Tu año.
// v0.24: los perfiles salieron de acá (el avatar de arriba del riel abre "¿Quién está mirando?").

/** Cuántas entradas del historial se ven acá; el resto, en "Ver todo el historial". */
const HISTORY_PREVIEW = 8
const ROW_MAX = 20

const detailLink = (e: { type: string; metaId: string; season?: number; videoId: string }) =>
  `/detail/${e.type}/${encodeURIComponent(e.metaId)}${e.season !== undefined ? `?season=${e.season}&video=${encodeURIComponent(e.videoId)}` : ''}`

export function Me() {
  useTitle('Vos')
  const progress = useStore(progressStore)
  const ratings = useStore(ratingsStore)
  const resume = useMemo(() => continueWatching(progress), [progress])
  const liked = useMemo(
    () =>
      Object.entries(ratings)
        .filter(([, r]) => isHighStars(r.stars))
        .sort(([, a], [, b]) => b.stars - a.stars || b.at - a.at)
        .slice(0, ROW_MAX),
    [ratings],
  )
  const watchedMovies = useMemo(
    () => new Set(Object.values(progress).filter((e) => e.type === 'movie' && e.watched).map((e) => e.metaId)),
    [progress],
  )
  const { undo, hide, restore } = useUndoHide()
  const hasHistory = Object.keys(progress).length > 0

  return (
    <div className="page me-page">
      <header className="page-header me-header">
        <div>
          <h1>Vos</h1>
          <p className="muted me-sub">Lo que estás viendo, lo que guardaste y todo lo que ya viste.</p>
        </div>
      </header>

      <MeShortcuts />
      <HistoryGoal />
      <MyListSection />

      {resume.length > 0 && (
        <Row title="Seguir viendo">
          {resume.map((e) => (
            <ContinueCard key={e.videoId} entry={e} to={detailLink(e)} onRemove={() => hide(e.metaId, localTitle(e.metaId, e.name))} />
          ))}
        </Row>
      )}

      {liked.length > 0 && (
        <Row title="Te gustaron">
          {liked.map(([id, r]) => (
            <PosterCard
              key={id}
              meta={{ id, type: r.type, name: r.name, poster: r.poster }}
              subtitle={`★ ${formatStars(r.stars)} · tu puntaje`}
              watched={watchedMovies.has(id)}
            />
          ))}
        </Row>
      )}

      <section className="me-history" aria-labelledby="me-history-title">
        <header className="me-history-head">
          <h2 id="me-history-title">Lo que viste</h2>
          {/* v0.26: sin historial no hay números en cero ni "Historial completo": solo el estado vacío. */}
          {hasHistory && (
            <>
              <HistoryStats className="stats me-stats" />
              <Link to="/history" className="row-more">
                Historial completo
              </Link>
            </>
          )}
        </header>
        <HistoryFeed limit={HISTORY_PREVIEW} monthHeading="h3" />
      </section>

      {undo && (
        <div className="undo-toast" role="status">
          <span>
            Eliminado de Seguir viendo<span className="muted"> · {undo.name}</span>
          </span>
          <button type="button" className="btn btn-small" onClick={restore}>
            Deshacer
          </button>
        </div>
      )}
    </div>
  )
}

interface Tile {
  to: string
  icon: Theme2IconName
  label: string
  hint: string
  primary?: boolean
}

/** Accesos (v0.23, en este orden): Historial, Calendario y Tu año. */
function MeShortcuts() {
  const year = new Date().getFullYear()
  const tiles: Tile[] = [
    { to: '/history', icon: 'history', label: 'Historial', hint: 'Todo lo que viste, por día' },
    { to: '/calendar', icon: 'calendar', label: 'Calendario', hint: 'Episodios que salen' },
    { to: '/history/year', icon: 'sparkles', label: `Tu año ${year}`, hint: 'Tu resumen del año', primary: true },
  ]
  return (
    <nav className="me-tiles" aria-label="Accesos de Vos">
      {tiles.map((t) => (
        <Link key={t.to} to={t.to} className={`me-tile${t.primary ? ' is-primary' : ''}`}>
          <span className="me-tile-icon" aria-hidden>
            <Theme2Icon name={t.icon} size={24} />
          </span>
          <span className="me-tile-text">
            <strong>{t.label}</strong>
            <span>{t.hint}</span>
          </span>
        </Link>
      ))}
    </nav>
  )
}

