import { Link, useSearchParams } from 'react-router-dom'
import { Theme2Icon } from '../components/Theme2Icons'
import { useTitle } from '../lib/hooks'
import { GoalLink, HistoryGoal } from './goals/GoalLink'
import { HistoryFeed, HistoryStats, parseHistoryFilter, type HistoryFilter } from './history/HistoryFeed'
import './me.css'

/** Historial completo. Desde la v0.14 se llega desde Vos; desde la v0.23 tiene el formato del Diario (que se unificó acá). */
export function History() {
  useTitle('Historial')
  const [params, setParams] = useSearchParams()

  // El filtro y la búsqueda quedan en la URL (?f=series&q=...): "Atrás" desde una ficha vuelve igual.
  const sync = (f: HistoryFilter, q: string) => {
    const next = new URLSearchParams()
    if (f !== 'all') next.set('f', f)
    if (q.trim()) next.set('q', q)
    setParams(next, { replace: true })
  }

  return (
    <div className="page history-page">
      <header className="page-header">
        <div>
          <Link to="/me" className="year-back">
            ← Vos
          </Link>
          <h1>Historial</h1>
        </div>
        <HistoryStats />
        <div className="history-actions">
          <Link to="/history/year" className="btn btn-primary">
            <Theme2Icon name="sparkles" size={20} />
            Tu año {new Date().getFullYear()}
          </Link>
          <Link to="/calendar" className="btn">
            <Theme2Icon name="calendar" size={20} />
            Calendario
          </Link>
          <GoalLink />
        </div>
      </header>
      <HistoryGoal />
      <HistoryFeed initialFilter={parseHistoryFilter(params.get('f'))} initialQuery={params.get('q') ?? ''} onChange={sync} />
    </div>
  )
}
