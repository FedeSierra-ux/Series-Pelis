import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Theme2Icon } from '../../components/Theme2Icons'
import { computeAchievements, unseenAchievements } from '../../lib/goals'
import { diaryStore, goalsStore, useStore } from '../../lib/store'
import { GoalBars, useYearGoal } from './GoalBars'

/** Botón "Metas y logros" del Historial, con la cantidad de logros nuevos sin ver. */
export function GoalLink() {
  const diary = useStore(diaryStore)
  const { seen } = useStore(goalsStore)
  const year = new Date().getFullYear()
  const fresh = useMemo(() => unseenAchievements(computeAchievements(Object.values(diary.entries), year), year, seen).length, [diary, seen, year])
  return (
    <Link to="/history/goals" className="btn" aria-label={`Metas y logros${fresh ? `: ${fresh} logro${fresh === 1 ? '' : 's'} nuevo${fresh === 1 ? '' : 's'}` : ''}`}>
      <Theme2Icon name="trophy" size={20} />
      Metas y logros
      {fresh > 0 && (
        <span className="goal-dot" aria-hidden>
          {fresh}
        </span>
      )}
    </Link>
  )
}

/** Progreso de la meta del año actual arriba del Historial (solo si hay una meta puesta). */
export function HistoryGoal() {
  const year = new Date().getFullYear()
  const lines = useYearGoal(year)
  if (!lines.length) return null
  return (
    <section className="history-goal" aria-label={`Meta de ${year}`}>
      <div className="history-goal-head">
        <strong>Meta {year}</strong>
        <Link to="/history/goals" className="small year-goal-link">
          Editar
        </Link>
      </div>
      <GoalBars lines={lines} year={year} />
    </section>
  )
}
