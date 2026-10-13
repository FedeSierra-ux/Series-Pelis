import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty } from '../components/Status'
import { dayLabel, episodeLabel, formatTime, smallPoster } from '../lib/format'
import { useTitle } from '../lib/hooks'
import { typeLabel } from '../lib/i18n'
import { progressStore, removeHistory, useStore, type WatchEntry } from '../lib/store'
import { GoalLink, HistoryGoal } from './goals/GoalLink'

type Filter = 'all' | 'movie' | 'series' | 'progress' | 'watched'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'movie', label: 'Películas' },
  { id: 'series', label: 'Series' },
  { id: 'progress', label: 'Sin terminar' },
  { id: 'watched', label: 'Vistas' },
]

export function History() {
  useTitle('Historial')
  const progress = useStore(progressStore)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase()
    return Object.values(progress)
      .filter((e) => {
        if (filter === 'movie' || filter === 'series') return e.type === filter
        if (filter === 'progress') return !e.watched
        if (filter === 'watched') return e.watched
        return true
      })
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.episodeTitle?.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [progress, filter, query])

  const byDay = useMemo(() => {
    const groups: { day: string; items: WatchEntry[] }[] = []
    for (const e of entries) {
      const day = dayLabel(e.updatedAt)
      const last = groups[groups.length - 1]
      if (last?.day === day) last.items.push(e)
      else groups.push({ day, items: [e] })
    }
    return groups
  }, [entries])

  const all = Object.values(progress)
  const stats = {
    movies: new Set(all.filter((e) => e.type === 'movie' && e.watched).map((e) => e.metaId)).size,
    episodes: all.filter((e) => e.type === 'series' && e.watched).length,
    hours: Math.round(all.reduce((n, e) => n + (e.watched ? e.duration : e.position), 0) / 3600),
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Historial</h1>
        <div className="stats">
          <span><b>{stats.movies}</b> películas</span>
          <span><b>{stats.episodes}</b> episodios</span>
          <span><b>{stats.hours}</b> h vistas</span>
        </div>
        <div className="history-actions">
          <Link to="/history/year" className="btn btn-primary">
            ✨ Tu año {new Date().getFullYear()}
          </Link>
          <Link to="/calendar" className="btn">
            📅 Calendario
          </Link>
          <Link to="/history/diary" className="btn">
            📔 Diario
          </Link>
          <GoalLink />
        </div>
      </header>
      <HistoryGoal />
      <div className="filters">
        {FILTERS.map((f) => (
          <button key={f.id} className={`tab ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
        <input className="filter-input" type="search" placeholder="Filtrar…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {entries.length === 0 && (
        <Empty>
          {all.length === 0 ? 'Todavía no viste nada. Lo que reproduzcas aparece acá.' : 'No hay nada con ese filtro.'}
        </Empty>
      )}

      {byDay.map((g) => (
        <section key={g.day} className="history-day">
          <h2>{g.day}</h2>
          <ul className="history-list">
            {g.items.map((e) => {
              const pct = e.duration ? Math.min(100, (e.position / e.duration) * 100) : 0
              const link = `/detail/${e.type}/${encodeURIComponent(e.metaId)}${
                e.season !== undefined ? `?season=${e.season}&video=${encodeURIComponent(e.videoId)}` : ''
              }`
              return (
                <li key={e.videoId} className="history-item">
                  <Link to={link} className="history-link">
                    <img src={smallPoster(e.metaId, e.poster)} alt="" loading="lazy" decoding="async" />
                    <div className="history-text">
                      <strong>{e.name}</strong>
                      <span className="muted small">
                        {typeLabel(e.type, false)}
                        {e.season !== undefined && ` · ${episodeLabel(e.season, e.episode)}`}
                        {e.episodeTitle && ` · ${e.episodeTitle}`}
                      </span>
                      <span className="small">
                        {e.watched
                          ? '✓ Vista'
                          : e.duration
                            ? `${formatTime(e.position)} de ${formatTime(e.duration)}`
                            : 'Empezada'}
                        <span className="muted"> · {new Date(e.updatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </span>
                      {!e.watched && pct > 0 && (
                        <div className="progress-bar inline"><div style={{ width: `${pct}%` }} /></div>
                      )}
                    </div>
                  </Link>
                  <button className="btn btn-ghost" aria-label="Quitar del historial" title="Quitar del historial" onClick={() => removeHistory([e.videoId])}>
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
