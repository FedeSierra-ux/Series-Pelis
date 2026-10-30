import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { SafeImg } from '../components/SafeImg'
import { smallPoster } from '../lib/format'
import { useAddons, useTitle } from '../lib/hooks'
import { useLocalTitle } from '../lib/localTitles'
import { availableYears, computeYearStats, entriesOfYear, formatDuration, loadYearMetas, type TitleStat } from '../lib/stats'
import { progressStore, useStore } from '../lib/store'
import type { Meta } from '../lib/types'
import { yearTotal } from '../lib/yearTotal'
import { GoalBars, useYearGoal } from './goals/GoalBars'

function TitleRow({ t, extra }: { t: TitleStat; extra?: string }) {
  const name = useLocalTitle(t.metaId, t.name, { type: t.type })
  return (
    <Link to={`/detail/${t.type}/${encodeURIComponent(t.metaId)}`} className="year-title">
      <SafeImg src={smallPoster(t.metaId, t.poster)} label={name} alt="" loading="lazy" decoding="async" />
      <span className="year-title-text">
        <strong>{name}</strong>
        <span className="muted small">
          {formatDuration(t.seconds)}
          {t.type === 'series' && t.episodes > 0 && ` · ${t.episodes} episodio${t.episodes === 1 ? '' : 's'}`}
          {extra && ` · ${extra}`}
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
  // Mismo redondeo que el Historial y plural bien (pc-07 / visual-04).
  const total = yearTotal(s.seconds)
  const empty = s.seconds === 0 && s.activeDays === 0
  const maxGenre = s.genres[0]?.seconds ?? 1
  const goalLines = useYearGoal(year, s.seconds)

  return (
    <div className="page year-page">
      <header className="page-header">
        <div>
          <Link to="/me" className="year-back">
            ← Vos
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
        <EmptyState
          icon="sparkles"
          title={`No hay nada visto en ${year}`}
          text="Lo que reproduzcas va a aparecer acá, con tus horas, géneros y series."
          action={{ label: 'Ver el historial', to: '/history' }}
        />
      ) : (
        <>
          <section className="year-hero">
            <div className="year-hero-main">
              <span className="year-big">{total.big}</span>
              <span className="year-big-label">
                {total.unit} de pelis y series en {year}
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

          <div className="year-grid">
            {goalLines.length > 0 && (
              <section className="year-card">
                <h2>
                  Tu meta <Link to="/history/goals" className="year-goal-link">Editar</Link>
                </h2>
                <GoalBars lines={goalLines} year={year} />
              </section>
            )}

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
          </div>
        </>
      )}
    </div>
  )
}
