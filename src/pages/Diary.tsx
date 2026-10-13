import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { UserStars } from '../components/StarRating'
import { Empty } from '../components/Status'
import { smallPoster } from '../lib/format'
import { episodesLabel, groupDiary, type DiaryFilter, type DiaryItem } from '../lib/diary'
import { yearCounts } from '../lib/goals'
import { useTitle } from '../lib/hooks'
import { diaryStore, removeDiaryEntry, useStore } from '../lib/store'

// Diario estilo Letterboxd: cada vez que terminaste algo, con la fecha, agrupado por mes.

const FILTERS: { id: DiaryFilter; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'movie', label: 'Películas' },
  { id: 'series', label: 'Series' },
]

/** Meses que se muestran de entrada (el resto con "Ver meses anteriores"). */
const PAGE = 6

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function itemLink(i: DiaryItem) {
  const base = `/detail/${i.type}/${encodeURIComponent(i.metaId)}`
  const e = i.entries[i.entries.length - 1]
  return e.season !== undefined ? `${base}?season=${e.season}&video=${encodeURIComponent(e.videoId)}` : base
}

export interface DiaryProps {
  /** Lugar para las estrellas de la calificación (lo conecta el store de calificaciones). */
  renderRating?: (item: DiaryItem) => ReactNode
}

function DiaryRow({ item, renderRating }: { item: DiaryItem } & DiaryProps) {
  const isSeries = item.type !== 'movie'
  const eps = isSeries ? episodesLabel(item.entries) : ''
  const single = item.entries.length === 1 ? item.entries[0] : undefined
  const date = new Date(item.watchedAt)
  const when = date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const time = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const rewatchLabel = isSeries ? 'Ya lo habías visto' : 'La volviste a ver'

  return (
    <li className="diary-item">
      <Link
        to={itemLink(item)}
        className="diary-link"
        aria-label={`${item.name}${eps ? `, ${eps}` : ''}. ${when}${item.rewatch ? `. ${rewatchLabel}` : ''}`}
      >
        <img src={smallPoster(item.metaId, item.poster)} alt="" loading="lazy" decoding="async" />
        <span className="diary-text">
          <strong>{item.name}</strong>
          {isSeries && (
            <span className="muted small">
              {eps}
              {item.entries.length > 1 ? ` · ${plural(item.entries.length, 'episodio', 'episodios')}` : single?.episodeTitle ? ` · ${single.episodeTitle}` : ''}
            </span>
          )}
          <span className="small diary-meta">
            <span className="muted" title={item.approx ? 'Fecha aproximada (tomada del historial)' : undefined}>
              {item.approx ? '≈ ' : ''}
              {time}
            </span>
            {item.rewatch && <span className="diary-badge">↻ {rewatchLabel}</span>}
          </span>
        </span>
      </Link>
      {renderRating && <span className="diary-rating">{renderRating(item)}</span>}
      <button
        className="btn btn-ghost"
        aria-label={`Quitar ${item.name} del diario`}
        title="Quitar del diario"
        onClick={() => item.entries.forEach((e) => removeDiaryEntry(e.id))}
      >
        ✕
      </button>
    </li>
  )
}

export function Diary({ renderRating = (i) => <UserStars id={i.metaId} /> }: DiaryProps = {}) {
  useTitle('Diario')
  const diary = useStore(diaryStore)
  const [filter, setFilter] = useState<DiaryFilter>('all')
  const [shown, setShown] = useState(PAGE)
  const all = useMemo(() => Object.values(diary.entries), [diary])
  const months = useMemo(() => groupDiary(all, filter), [all, filter])

  const thisYear = new Date().getFullYear()
  const { movies: yearMovies, episodes: yearEpisodes } = yearCounts(all, thisYear, 0)

  return (
    <div className="page diary-page">
      <header className="page-header">
        <div>
          <Link to="/history" className="year-back">
            ← Historial
          </Link>
          <h1>Diario</h1>
        </div>
        <div className="stats">
          <span>
            <b>{yearMovies}</b> {yearMovies === 1 ? 'película' : 'películas'} en {thisYear}
          </span>
          <span>
            <b>{yearEpisodes}</b> {yearEpisodes === 1 ? 'episodio' : 'episodios'}
          </span>
        </div>
      </header>
      <div className="filters" role="tablist" aria-label="Qué mostrar">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            className={`tab ${filter === f.id ? 'active' : ''}`}
            onClick={() => {
              setFilter(f.id)
              setShown(PAGE)
            }}
          >
            {f.label}
          </button>
        ))}
        <Link to="/history/goals" className="btn btn-small">
          🏆 Metas y logros
        </Link>
      </div>

      {months.length === 0 && (
        <Empty>
          {all.length === 0
            ? 'Tu diario está vacío. Cada vez que termines una peli o un episodio se anota acá, con la fecha.'
            : 'No hay nada con ese filtro.'}
        </Empty>
      )}

      {months.slice(0, shown).map((m) => {
        const label = new Date(m.year, m.month, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
        return (
          <section key={m.key} className="diary-month" aria-label={label}>
            <h2>
              <span className="diary-month-name">{label}</span>
              <span className="muted small">
                {[m.movies && plural(m.movies, 'película', 'películas'), m.episodes && plural(m.episodes, 'episodio', 'episodios')].filter(Boolean).join(' · ')}
              </span>
            </h2>
            <ol className="diary-days">
              {m.days.map((d) => {
                const date = new Date(d.date)
                return (
                  <li key={d.date} className="diary-day">
                    <div className="diary-date" aria-hidden>
                      <span className="diary-dnum">{date.getDate()}</span>
                      <span className="diary-wday">{date.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')}</span>
                    </div>
                    <ul className="diary-items">
                      {d.items.map((i) => (
                        <DiaryRow key={i.key} item={i} renderRating={renderRating} />
                      ))}
                    </ul>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}

      {months.length > shown && (
        <div className="diary-more">
          <button className="btn" onClick={() => setShown((n) => n + PAGE)}>
            Ver meses anteriores
          </button>
        </div>
      )}
    </div>
  )
}
