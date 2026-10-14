import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { UserStars } from '../../components/StarRating'
import { dayLabel, episodeLabel, formatTime, smallPoster } from '../../lib/format'
import { typeLabel } from '../../lib/i18n'
import { progressStore, removeHistory, useStore, type WatchEntry } from '../../lib/store'
import { formatWatchTime, plural, watchStats } from '../../lib/watchStats'

// Lista del historial agrupada por día, con filtros y búsqueda. La usan la página Historial (completa) y la
// sección "Lo que viste" de Vos (con tope y un link al historial completo).

export type HistoryFilter = 'all' | 'movie' | 'series' | 'progress' | 'watched'

export const HISTORY_FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'movie', label: 'Películas' },
  { id: 'series', label: 'Series' },
  { id: 'progress', label: 'Sin terminar' },
  { id: 'watched', label: 'Vistas' },
]

export const parseHistoryFilter = (v: string | null | undefined): HistoryFilter =>
  HISTORY_FILTERS.some((f) => f.id === v) ? (v as HistoryFilter) : 'all'

/** Link al historial completo con el filtro y la búsqueda de ahora. */
export function historyLink(filter: HistoryFilter, query: string): string {
  const p = new URLSearchParams()
  if (filter !== 'all') p.set('f', filter)
  if (query.trim()) p.set('q', query.trim())
  const qs = p.toString()
  return `/history${qs ? `?${qs}` : ''}`
}

/** "2 películas · 1 episodio · 3 h 20 min" (antes decía "1 películas" y "0 h vistas" con 7 minutos). */
export function HistoryStats({ className = 'stats' }: { className?: string }) {
  const progress = useStore(progressStore)
  const s = useMemo(() => watchStats(Object.values(progress)), [progress])
  const [movies, moviesWord] = splitCount(plural(s.movies, 'película', 'películas'))
  const [episodes, episodesWord] = splitCount(plural(s.episodes, 'episodio', 'episodios'))
  return (
    <div className={className}>
      <span>
        <b>{movies}</b> {moviesWord}
      </span>
      <span>
        <b>{episodes}</b> {episodesWord}
      </span>
      <span title="Tiempo total visto">
        <b>{formatWatchTime(s.seconds)}</b> en total
      </span>
    </div>
  )
}

const splitCount = (text: string): [string, string] => {
  const i = text.indexOf(' ')
  return [text.slice(0, i), text.slice(i + 1)]
}

interface Props {
  initialFilter?: HistoryFilter
  initialQuery?: string
  /** Avisa los cambios (la página Historial los guarda en la URL). */
  onChange?: (filter: HistoryFilter, query: string) => void
  /** Cuántas entradas mostrar como mucho; con tope aparece "Ver todo el historial". */
  limit?: number
  /** Nivel de los títulos de cada día (en Vos van debajo de "Lo que viste"). */
  dayHeading?: 'h2' | 'h3'
}

export function HistoryFeed({ initialFilter = 'all', initialQuery = '', onChange, limit, dayHeading: DayHeading = 'h2' }: Props) {
  const progress = useStore(progressStore)
  const [filter, setFilter] = useState<HistoryFilter>(initialFilter)
  const [query, setQuery] = useState(initialQuery)
  const inputId = useId()

  const all = useMemo(() => Object.values(progress), [progress])
  const entries = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all
      .filter((e) => {
        if (filter === 'movie' || filter === 'series') return e.type === filter
        if (filter === 'progress') return !e.watched
        if (filter === 'watched') return e.watched
        return true
      })
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.episodeTitle?.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [all, filter, query])
  const shown = limit ? entries.slice(0, limit) : entries

  const byDay = useMemo(() => {
    const groups: { day: string; items: WatchEntry[] }[] = []
    for (const e of shown) {
      const day = dayLabel(e.updatedAt)
      const last = groups[groups.length - 1]
      if (last?.day === day) last.items.push(e)
      else groups.push({ day, items: [e] })
    }
    return groups
  }, [shown])

  const pick = (f: HistoryFilter) => {
    setFilter(f)
    onChange?.(f, query)
  }
  const type = (q: string) => {
    setQuery(q)
    onChange?.(filter, q)
  }

  return (
    <>
      <div className="filters history-filters">
        <div className="history-filter-tabs" role="group" aria-label="Qué mostrar">
          {HISTORY_FILTERS.map((f) => (
            <button key={f.id} type="button" className={`tab ${filter === f.id ? 'active' : ''}`} aria-pressed={filter === f.id} onClick={() => pick(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        {/* UX 5: el filtro tenía solo placeholder; ahora tiene etiqueta (oculta a la vista). */}
        <label className="sp-sr-only" htmlFor={inputId}>
          Buscar en el historial por nombre
        </label>
        <input
          id={inputId}
          className="filter-input"
          type="search"
          placeholder="Buscar en lo que viste…"
          value={query}
          onChange={(e) => type(e.target.value)}
        />
      </div>

      {entries.length === 0 &&
        (all.length === 0 ? (
          <EmptyState
            icon="history"
            title="Todavía no viste nada"
            text="Lo que reproduzcas aparece acá, con el punto en el que lo dejaste."
            action={{ label: 'Ir a Inicio', to: '/' }}
          />
        ) : (
          <EmptyState icon="history" title="No hay nada con ese filtro" text="Probá con otro filtro o borrá lo que escribiste." />
        ))}

      {byDay.map((g) => (
        <section key={g.day} className="history-day">
          <DayHeading>{g.day}</DayHeading>
          <ul className="history-list">
            {g.items.map((e) => (
              <HistoryItem key={e.videoId} e={e} />
            ))}
          </ul>
        </section>
      ))}

      {limit !== undefined && entries.length > shown.length && (
        <div className="history-more">
          <Link to={historyLink(filter, query)} className="btn">
            Ver todo el historial ({entries.length})
          </Link>
        </div>
      )}
    </>
  )
}

function HistoryItem({ e }: { e: WatchEntry }) {
  const pct = e.duration ? Math.min(100, (e.position / e.duration) * 100) : 0
  const link = `/detail/${e.type}/${encodeURIComponent(e.metaId)}${
    e.season !== undefined ? `?season=${e.season}&video=${encodeURIComponent(e.videoId)}` : ''
  }`
  return (
    <li className="history-item">
      <Link to={link} className="history-link">
        <img src={smallPoster(e.metaId, e.poster)} alt="" loading="lazy" decoding="async" />
        <div className="history-text">
          <strong>
            {e.name} <UserStars id={e.metaId} />
          </strong>
          <span className="muted small">
            {typeLabel(e.type, false)}
            {e.season !== undefined && ` · ${episodeLabel(e.season, e.episode)}`}
            {e.episodeTitle && ` · ${e.episodeTitle}`}
          </span>
          <span className="small">
            {e.watched ? '✓ Vista' : e.duration ? `${formatTime(e.position)} de ${formatTime(e.duration)}` : 'Empezada'}
            <span className="muted"> · {new Date(e.updatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
          </span>
          {!e.watched && pct > 0 && (
            <div className="progress-bar inline">
              <div style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </Link>
      <button
        className="btn btn-ghost"
        aria-label={`Quitar “${e.name}” del historial`}
        title="Quitar del historial"
        onClick={() => removeHistory([e.videoId])}
      >
        ✕
      </button>
    </li>
  )
}
