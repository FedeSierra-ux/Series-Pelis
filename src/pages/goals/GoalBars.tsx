import { useMemo } from 'react'
import { goalProgress, hasGoal, yearCounts, type GoalLine, type GoalMetric } from '../../lib/goals'
import { computeYearStats } from '../../lib/stats'
import { diaryStore, goalsStore, progressStore, useStore } from '../../lib/store'

export const METRIC_LABEL: Record<GoalMetric, { one: string; many: string }> = {
  movies: { one: 'película', many: 'películas' },
  episodes: { one: 'episodio', many: 'episodios' },
  hours: { one: 'hora', many: 'horas' },
}

/**
 * Progreso de la meta del año. `seconds` = horas vistas ya calculadas (Tu año las tiene con las fichas);
 * si no viene, se calculan con el historial.
 */
export function useYearGoal(year: number, seconds?: number): GoalLine[] {
  const diary = useStore(diaryStore)
  const progress = useStore(progressStore)
  const goal = useStore(goalsStore).byYear[String(year)]
  return useMemo(() => {
    if (!hasGoal(goal)) return []
    const secs = seconds ?? (goal.hours > 0 ? computeYearStats(progress, year, new Map()).seconds : 0)
    return goalProgress(goal, yearCounts(Object.values(diary.entries), year, secs), year)
  }, [goal, diary, progress, year, seconds])
}

function paceText(l: GoalLine, year: number): string {
  const unit = (n: number) => (n === 1 ? METRIC_LABEL[l.metric].one : METRIC_LABEL[l.metric].many)
  if (l.done) return '¡Meta cumplida!'
  if (year < new Date().getFullYear()) return `Faltaron ${l.target - l.current}`
  const diff = l.current - l.expected
  if (diff === 0) return 'Vas justo al día'
  if (diff > 0) return `Vas ${diff} ${unit(diff)} adelantado`
  return `Te faltan ${-diff} para ir al día`
}

export function GoalBars({ lines, year }: { lines: GoalLine[]; year: number }) {
  return (
    <div className="goal-bars">
      {lines.map((l) => {
        const label = METRIC_LABEL[l.metric].many
        const pace = paceText(l, year)
        return (
          <div key={l.metric} className={`goal-line${l.done ? ' done' : ''}`}>
            <div className="goal-line-head">
              <span>
                <strong>{l.current.toLocaleString('es-AR')}</strong>
                <span className="muted"> / {l.target.toLocaleString('es-AR')} {label}</span>
              </span>
              <span className="small goal-pace-text">{pace}</span>
            </div>
            <div
              className="goal-bar"
              role="progressbar"
              aria-label={`Meta de ${label} ${year}: ${l.current} de ${l.target}. ${pace}`}
              aria-valuemin={0}
              aria-valuemax={l.target}
              aria-valuenow={Math.min(l.current, l.target)}
            >
              <span style={{ width: `${Math.max(l.current > 0 ? 2 : 0, l.pct * 100)}%` }} />
              {!l.done && l.expected > 0 && l.expected < l.target && (
                <i className="goal-pace-mark" style={{ left: `${(l.expected / l.target) * 100}%` }} title={`Para ir al día: ${l.expected}`} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
