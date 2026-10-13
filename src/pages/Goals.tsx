import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { diaryYears } from '../lib/diary'
import { completedSeries, computeAchievements, EMPTY_GOAL, unseenAchievements, type GoalMetric, type YearGoal } from '../lib/goals'
import { useAddons, useTitle } from '../lib/hooks'
import { loadYearMetas } from '../lib/stats'
import { diaryStore, goalsStore, progressStore, useStore } from '../lib/store'
import type { Meta } from '../lib/types'
import { GoalBars, METRIC_LABEL, useYearGoal } from './goals/GoalBars'

// Metas anuales ("52 pelis en 2026") y logros que se desbloquean con el diario.

const EDITOR: { metric: GoalMetric; step: number; presets: number[] }[] = [
  { metric: 'movies', step: 1, presets: [12, 24, 52, 100] },
  { metric: 'episodes', step: 10, presets: [100, 250, 500] },
  { metric: 'hours', step: 10, presets: [100, 250, 500] },
]

const fullDate = (ts: number) => new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })

function setGoal(year: number, patch: Partial<YearGoal>) {
  goalsStore.set((g) => {
    const cur = g.byYear[String(year)] ?? EMPTY_GOAL
    return { ...g, byYear: { ...g.byYear, [String(year)]: { ...cur, ...patch } } }
  })
}

function GoalEditor({ year }: { year: number }) {
  const goal = useStore(goalsStore).byYear[String(year)] ?? EMPTY_GOAL
  return (
    <div className="goal-editor">
      {EDITOR.map(({ metric, step, presets }) => {
        const value = goal[metric]
        const label = METRIC_LABEL[metric].many
        const put = (n: number) => setGoal(year, { [metric]: Math.max(0, Math.min(9999, Math.round(n) || 0)) })
        return (
          <div key={metric} className="goal-edit-row">
            <span className="goal-edit-label">{label[0].toUpperCase() + label.slice(1)}</span>
            <div className="goal-stepper">
              <button className="btn btn-small" aria-label={`Bajar meta de ${label}`} onClick={() => put(value - step)} disabled={value <= 0}>
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={9999}
                value={value || ''}
                placeholder="Sin meta"
                aria-label={`Meta de ${label} en ${year}`}
                onChange={(e) => put(Number(e.target.value))}
              />
              <button className="btn btn-small" aria-label={`Subir meta de ${label}`} onClick={() => put(value + step)}>
                +
              </button>
            </div>
            <div className="goal-presets">
              {presets.map((p) => (
                <button key={p} className={`tab${value === p ? ' active' : ''}`} aria-pressed={value === p} onClick={() => put(p)}>
                  {p}
                </button>
              ))}
              {value > 0 && (
                <button className="tab" onClick={() => put(0)}>
                  Sin meta
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Goals() {
  useTitle('Metas y logros')
  const addons = useAddons()
  const diary = useStore(diaryStore)
  const progress = useStore(progressStore)
  const { byYear, seen } = useStore(goalsStore)
  const entries = useMemo(() => Object.values(diary.entries), [diary])
  const years = useMemo(() => [...new Set([...diaryYears(entries), ...Object.keys(byYear).map(Number)])].sort((a, b) => b - a), [entries, byYear])
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [metas, setMetas] = useState<Map<string, Meta>>(() => new Map())
  const lines = useYearGoal(year)

  // Fichas de las series (de caché primero) para saber si terminaste alguna completa.
  const seriesKey = useMemo(() => [...new Set(entries.filter((d) => d.type !== 'movie').map((d) => d.metaId))].sort().join(','), [entries])
  useEffect(() => {
    let alive = true
    const series = Object.values(progress).filter((e) => e.type !== 'movie')
    if (series.length) loadYearMetas(addons, series).then((m) => alive && setMetas(m))
    return () => {
      alive = false
    }
    // Solo cuando cambian las series vistas, no con cada guardado de progreso.
  }, [addons, seriesKey])

  const achievements = useMemo(() => computeAchievements(entries, year, completedSeries(entries, metas)), [entries, year, metas])
  const unlocked = achievements.filter((a) => a.unlockedAt !== undefined)

  // Los "nuevos" se marcan al entrar y quedan resaltados mientras dure la visita.
  const [fresh, setFresh] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    const news = unseenAchievements(achievements, year, seen)
    if (!news.length) return
    setFresh((f) => new Set([...f, ...news.map((a) => `${year}:${a.id}`)]))
    goalsStore.set((g) => ({ ...g, seen: [...new Set([...g.seen, ...news.map((a) => `${year}:${a.id}`)])] }))
  }, [achievements, year, seen])

  return (
    <div className="page goals-page">
      <header className="page-header">
        <div>
          <Link to="/history" className="year-back">
            ← Historial
          </Link>
          <h1>Metas y logros</h1>
        </div>
        <div className="filters" role="tablist" aria-label="Año">
          {years.map((y) => (
            <button key={y} role="tab" aria-selected={y === year} className={`tab ${y === year ? 'active' : ''}`} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
        </div>
      </header>

      <section className="year-card goal-card">
        <h2>Tu meta para {year}</h2>
        <GoalEditor year={year} />
        {lines.length > 0 ? (
          <GoalBars lines={lines} year={year} />
        ) : (
          <p className="muted small">Elegí cuántas pelis, episodios u horas querés ver en {year}. Se cuentan con tu diario.</p>
        )}
      </section>

      <section className="goals-achievements">
        <h2>
          Logros de {year} <span className="muted small">{unlocked.length} de {achievements.length}</span>
        </h2>
        <ul className="achievements">
          {achievements.map((a) => {
            const on = a.unlockedAt !== undefined
            const isNew = on && fresh.has(`${year}:${a.id}`)
            const status = on ? `Desbloqueado el ${fullDate(a.unlockedAt!)}` : `Bloqueado: ${a.current} de ${a.target}`
            return (
              <li
                key={a.id}
                className={`achievement${on ? ' on' : ''}${isNew ? ' new' : ''}`}
                tabIndex={0}
                aria-label={`${a.title}. ${a.description} ${status}${a.detail ? `. ${a.detail}` : ''}`}
              >
                <span className="achievement-icon" aria-hidden>
                  {a.icon}
                </span>
                <span className="achievement-text">
                  <strong>
                    {a.title}
                    {isNew && <span className="achievement-new">¡Nuevo!</span>}
                  </strong>
                  <span className="muted small">{a.description}</span>
                  {on ? (
                    <span className="small achievement-date">
                      ✓ {fullDate(a.unlockedAt!)}
                      {a.detail && ` · ${a.detail}`}
                    </span>
                  ) : (
                    a.target > 1 && (
                      <span className="achievement-progress">
                        <span className="goal-bar">
                          <span style={{ width: `${(a.current / a.target) * 100}%` }} />
                        </span>
                        <span className="muted small">
                          {a.current}/{a.target}
                        </span>
                      </span>
                    )
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
