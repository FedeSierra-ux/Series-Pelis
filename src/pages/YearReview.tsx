import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty } from '../components/Status'
import { episodeLabel, smallPoster } from '../lib/format'
import { useAddons, useTitle } from '../lib/hooks'
import { availableYears, computeYearStats, entriesOfYear, formatDuration, loadYearMetas, type DayCell, type TitleStat } from '../lib/stats'
import { progressStore, useStore, type WatchEntry } from '../lib/store'
import type { Meta } from '../lib/types'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const CELL = 12
const GAP = 3
const STEP = CELL + GAP
const LEFT = 30
const TOP = 18

const shortDate = (ts: number) => new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })

function Heatmap({ days, offset, year }: { days: DayCell[]; offset: number; year: number }) {
  const scroller = useRef<HTMLDivElement>(null)
  const cols = Math.ceil((offset + days.length) / 7)
  const width = LEFT + cols * STEP
  const height = TOP + 7 * STEP
  const now = Date.now()

  // En el celular no entra todo el año: arrancamos mostrando lo más reciente.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && year === new Date().getFullYear()) el.scrollLeft = el.scrollWidth
  }, [year])

  const months = MONTHS.map((label, m) => {
    const idx = Math.round((new Date(year, m, 1).getTime() - new Date(year, 0, 1).getTime()) / 86400000)
    return { label, col: Math.floor((offset + idx) / 7) }
  })

  return (
    <div className="heatmap-scroll" ref={scroller}>
      <svg
        className="heatmap"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`Actividad de ${year}: ${days.filter((d) => d.level > 0).length} días con algo visto`}
      >
        {months.map((m) => (
          <text key={m.label} x={LEFT + m.col * STEP} y={11} className="hm-label">
            {m.label}
          </text>
        ))}
        {[
          ['lun', 0],
          ['mié', 2],
          ['vie', 4],
        ].map(([label, row]) => (
          <text key={label} x={0} y={TOP + (row as number) * STEP + CELL - 2} className="hm-label">
            {label}
          </text>
        ))}
        {days.map((d, i) => {
          const idx = offset + i
          const future = d.date > now
          const date = new Date(d.date).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
          const detail = d.titles.length
            ? `${formatDuration(d.seconds)} · ${d.titles.slice(0, 3).join(', ')}${d.titles.length > 3 ? ` y ${d.titles.length - 3} más` : ''}`
            : 'Nada'
          return (
            <rect
              key={d.date}
              x={LEFT + Math.floor(idx / 7) * STEP}
              y={TOP + (idx % 7) * STEP}
              width={CELL}
              height={CELL}
              rx={3}
              className={`hm-l${d.level}${future ? ' hm-future' : ''}`}
            >
              <title>{`${date}: ${detail}`}</title>
            </rect>
          )
        })}
      </svg>
    </div>
  )
}

function TitleRow({ t, extra }: { t: TitleStat; extra?: string }) {
  return (
    <Link to={`/detail/${t.type}/${encodeURIComponent(t.metaId)}`} className="year-title">
      <img src={smallPoster(t.metaId, t.poster)} alt="" loading="lazy" decoding="async" />
      <span className="year-title-text">
        <strong>{t.name}</strong>
        <span className="muted small">
          {formatDuration(t.seconds)}
          {t.type === 'series' && t.episodes > 0 && ` · ${t.episodes} episodio${t.episodes === 1 ? '' : 's'}`}
          {extra && ` · ${extra}`}
        </span>
      </span>
    </Link>
  )
}

function EntryRow({ label, e, at }: { label: string; e: WatchEntry; at: number }) {
  return (
    <Link to={`/detail/${e.type}/${encodeURIComponent(e.metaId)}`} className="year-title">
      <img src={smallPoster(e.metaId, e.poster)} alt="" loading="lazy" decoding="async" />
      <span className="year-title-text">
        <span className="year-kicker">{label}</span>
        <strong>{e.name}</strong>
        <span className="muted small">
          {e.season !== undefined && `${episodeLabel(e.season, e.episode)} · `}
          {shortDate(at)}
        </span>
      </span>
    </Link>
  )
}

export function YearReview() {
  useTitle('Tu año')
  const addons = useAddons()
  const progress = useStore(progressStore)
  const years = useMemo(() => availableYears(progress), [progress])
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [metas, setMetas] = useState<Map<string, Meta>>(() => new Map())
  const [loadingMetas, setLoadingMetas] = useState(false)

  useEffect(() => {
    let alive = true
    setLoadingMetas(true)
    loadYearMetas(addons, entriesOfYear(progress, year))
      .then((m) => alive && setMetas(m))
      .finally(() => alive && setLoadingMetas(false))
    return () => {
      alive = false
    }
  }, [addons, progress, year])

  const s = useMemo(() => computeYearStats(progress, year, metas), [progress, year, metas])
  const hours = s.seconds / 3600
  const empty = s.seconds === 0 && s.activeDays === 0
  const maxGenre = s.genres[0]?.seconds ?? 1

  return (
    <div className="page year-page">
      <header className="page-header">
        <div>
          <Link to="/history" className="year-back">
            ← Historial
          </Link>
          <h1>Tu año</h1>
        </div>
        <div className="filters" role="tablist" aria-label="Año">
          {years.map((y) => (
            <button key={y} role="tab" aria-selected={y === year} className={`tab ${y === year ? 'active' : ''}`} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
        </div>
      </header>

      {empty ? (
        <Empty>
          No hay nada visto en {year}. Lo que reproduzcas va a aparecer acá. <Link to="/history">Volver al historial</Link>
        </Empty>
      ) : (
        <>
          <section className="year-hero">
            <div className="year-hero-main">
              <span className="year-big">{hours >= 1 ? Math.round(hours).toLocaleString('es-AR') : Math.round(s.seconds / 60)}</span>
              <span className="year-big-label">
                {hours >= 1 ? 'horas' : 'minutos'} de pelis y series en {year}
                {s.approx && <span className="muted small"> (aprox.)</span>}
              </span>
            </div>
            <dl className="year-kpis">
              <div>
                <dt>Películas</dt>
                <dd>{s.movies}</dd>
              </div>
              <div>
                <dt>Episodios</dt>
                <dd>{s.episodes}</dd>
              </div>
              <div>
                <dt>Series</dt>
                <dd>{s.series}</dd>
              </div>
              <div>
                <dt>Días con algo visto</dt>
                <dd>{s.activeDays}</dd>
              </div>
            </dl>
          </section>

          <section className="year-card">
            <h2>Tu actividad</h2>
            <Heatmap days={s.days} offset={s.offset} year={year} />
            <div className="hm-legend" aria-hidden>
              <span className="muted small">Menos</span>
              {[0, 1, 2, 3, 4].map((l) => (
                <svg key={l} width={CELL} height={CELL}>
                  <rect width={CELL} height={CELL} rx={3} className={`hm-l${l}`} />
                </svg>
              ))}
              <span className="muted small">Más</span>
            </div>
          </section>

          <div className="year-grid">
            <section className="year-card">
              <h2>Géneros favoritos</h2>
              {s.genres.length === 0 ? (
                <p className="muted small">{loadingMetas ? 'Cargando géneros…' : 'Sin datos de géneros todavía.'}</p>
              ) : (
                <ol className="year-bars">
                  {s.genres.map((g) => (
                    <li key={g.genre}>
                      <span className="year-bar-label">
                        {g.label}
                        <span className="muted small">{formatDuration(g.seconds)}</span>
                      </span>
                      <span className="year-bar">
                        <span style={{ width: `${Math.max(4, (g.seconds / maxGenre) * 100)}%` }} />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {s.topSeries.length > 0 && (
              <section className="year-card">
                <h2>Las series que más viste</h2>
                <ol className="year-titles">
                  {s.topSeries.map((t) => (
                    <li key={t.metaId}>
                      <TitleRow t={t} />
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {s.topMovies.length > 0 && (
              <section className="year-card">
                <h2>Películas</h2>
                <ol className="year-titles">
                  {s.topMovies.map((t) => (
                    <li key={t.metaId}>
                      <TitleRow t={t} />
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section className="year-card year-card-stat">
              <h2>Racha más larga</h2>
              <span className="year-num">
                {s.streak.days} <small>{s.streak.days === 1 ? 'día' : 'días'} seguidos</small>
              </span>
              {s.streak.from !== undefined && s.streak.to !== undefined && s.streak.days > 1 && (
                <span className="muted small">
                  del {shortDate(s.streak.from)} al {shortDate(s.streak.to)}
                </span>
              )}
            </section>

            {s.busiestWeekday && (
              <section className="year-card year-card-stat">
                <h2>Tu día favorito</h2>
                <span className="year-num year-num-text">{s.busiestWeekday.label}</span>
                <span className="muted small">es cuando más mirás: {formatDuration(s.busiestWeekday.seconds)} en el año</span>
              </section>
            )}

            <section className="year-card">
              <h2>La que más volviste a ver</h2>
              {s.rewatched ? (
                <TitleRow t={s.rewatched.title} extra={s.rewatched.detail} />
              ) : (
                <p className="muted small">Este año no repetiste nada.</p>
              )}
            </section>

            {s.first && s.last && (
              <section className="year-card">
                <h2>De punta a punta</h2>
                <div className="year-titles">
                  <EntryRow
                    label="La primera del año"
                    e={s.first}
                    at={s.first.firstWatchedAt && new Date(s.first.firstWatchedAt).getFullYear() === year ? s.first.firstWatchedAt : s.first.updatedAt}
                  />
                  {s.last.videoId !== s.first.videoId && <EntryRow label="La última" e={s.last} at={s.last.updatedAt} />}
                </div>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  )
}
