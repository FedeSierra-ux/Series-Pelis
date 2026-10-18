import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../../components/EmptyState'
import { UserStars } from '../../components/StarRating'
import { episodeLabel, formatTime, smallPoster } from '../../lib/format'
import { groupHistory } from '../../lib/historyGroups'
import { typeLabel } from '../../lib/i18n'
import { progressStore, removeHistory, restoreHistory, useStore, type RemovedHistory, type WatchEntry } from '../../lib/store'
import { formatWatchTime, plural, watchStats } from '../../lib/watchStats'

// Lista del historial con filtros y búsqueda. Desde la v0.23 tiene el formato del Diario (que se unificó acá):
// por mes y, adentro, por día con el número grande al costado. La usan la página Historial (completa) y la
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
  /** Nivel de los títulos de cada mes (en Vos van debajo de "Lo que viste"). */
  monthHeading?: 'h2' | 'h3'
}

export function HistoryFeed({ initialFilter = 'all', initialQuery = '', onChange, limit, monthHeading: MonthHeading = 'h2' }: Props) {
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
  const shownCount = limit ? Math.min(limit, entries.length) : entries.length

  // Los totales de cada mes van sobre toda la lista (aunque Vos muestre solo las primeras): así Vos e Historial
  // dicen lo mismo del mismo mes.
  const months = useMemo(() => groupHistory(entries, limit), [entries, limit])
  const { undo, remove, restore } = useUndoRemove()

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
      {/* v0.26: sin nada en el historial, los filtros y la búsqueda sobran (queda solo el estado vacío). */}
      {all.length > 0 && (
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
      )}

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

      {months.map((m) => {
        const label = new Date(m.year, m.month, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
        return (
          <section key={m.key} className="diary-month" aria-label={label}>
            <MonthHeading>
              <span className="diary-month-name">{label}</span>
              <span className="muted small">
                {[
                  m.movies && plural(m.movies, 'película', 'películas'),
                  m.episodes && plural(m.episodes, 'episodio', 'episodios'),
                  m.started && `${m.started} sin terminar`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </MonthHeading>
            <ol className="diary-days">
              {m.days.map((d) => {
                const date = new Date(d.date)
                return (
                  <li key={d.date} className="diary-day">
                    <div className="diary-date">
                      <span className="diary-dnum" aria-hidden>
                        {date.getDate()}
                      </span>
                      <span className="diary-wday" aria-hidden>
                        {date.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')}
                      </span>
                      <span className="sp-sr-only">{date.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                    </div>
                    <ul className="diary-items">
                      {d.items.map((e) => (
                        <HistoryItem key={e.videoId} e={e} onRemove={remove} />
                      ))}
                    </ul>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}

      {limit !== undefined && entries.length > shownCount && (
        <div className="history-more">
          <Link to={historyLink(filter, query)} className="btn">
            Ver todo el historial ({entries.length})
          </Link>
        </div>
      )}

      {undo && (
        <div className="undo-toast" role="status">
          <span>
            Eliminado del historial<span className="muted"> · {undo.name}</span>
          </span>
          <button type="button" className="btn btn-small" onClick={restore}>
            Deshacer
          </button>
        </div>
      )}
    </>
  )
}

const UNDO_MS = 6000

/** El ✕ borra al toque (así se pueden sacar varios seguidos) y deja 6 s un aviso con "Deshacer". */
function useUndoRemove() {
  const [undo, setUndo] = useState<{ name: string; removed: RemovedHistory }>()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(
    () => () => {
      clearTimeout(timer.current)
    },
    [],
  )

  const remove = useCallback((e: WatchEntry, button?: HTMLButtonElement) => {
    // Con el control remoto o el teclado, el foco pasa al ✕ del que sigue (si no, quedaba en <body>).
    const keepFocus = !!button && document.activeElement === button
    const index = keepFocus ? removeButtons().indexOf(button) : -1
    const removed = removeHistory([e.videoId])
    const name = e.season !== undefined ? `${e.name} ${episodeLabel(e.season, e.episode)}` : e.name
    setUndo({ name, removed })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setUndo(undefined), UNDO_MS)
    if (keepFocus) {
      requestAnimationFrame(() => {
        const list = removeButtons()
        ;(list[index] ?? list[index - 1])?.focus()
      })
    }
  }, [])

  const restore = useCallback(() => {
    if (!undo) return
    restoreHistory(undo.removed)
    clearTimeout(timer.current)
    setUndo(undefined)
    // El aviso desaparece: el foco vuelve al ✕ de lo que se recuperó.
    const id = undo.removed.progress[0]?.videoId
    if (id) requestAnimationFrame(() => removeButtons().find((b) => b.dataset.historyRemove === id)?.focus())
  }, [undo])

  return { undo, remove, restore }
}

const removeButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-history-remove]'))

function HistoryItem({ e, onRemove }: { e: WatchEntry; onRemove: (e: WatchEntry, button?: HTMLButtonElement) => void }) {
  const pct = e.duration ? Math.min(100, (e.position / e.duration) * 100) : 0
  const link = `/detail/${e.type}/${encodeURIComponent(e.metaId)}${
    e.season !== undefined ? `?season=${e.season}&video=${encodeURIComponent(e.videoId)}` : ''
  }`
  const isSeries = e.type !== 'movie'
  return (
    <li className="diary-item history-item">
      <Link to={link} className="diary-link">
        <img src={smallPoster(e.metaId, e.poster)} alt="" loading="lazy" decoding="async" />
        <div className="diary-text">
          <strong>{e.name}</strong>
          <span className="muted small">
            {isSeries && e.season !== undefined ? episodeLabel(e.season, e.episode) : typeLabel(e.type, false)}
            {e.episodeTitle && ` · ${e.episodeTitle}`}
          </span>
          <span className="small diary-meta">
            <span>{e.watched ? '✓ Visto' : e.duration ? `${formatTime(e.position)} de ${formatTime(e.duration)}` : 'Empezado'}</span>
            <span className="muted">{new Date(e.updatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
          </span>
          {!e.watched && pct > 0 && (
            <div className="progress-bar inline">
              <div style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </Link>
      <span className="diary-rating">
        <UserStars id={e.metaId} />
      </span>
      <button
        className="btn btn-ghost"
        aria-label={`Quitar “${e.name}” del historial`}
        title="Quitar del historial"
        data-history-remove={e.videoId}
        onClick={(ev) => onRemove(e, ev.currentTarget)}
      >
        ✕
      </button>
    </li>
  )
}
