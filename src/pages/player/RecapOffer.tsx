import { progressStore } from '../../lib/store'

/** Después de tantos días sin ver la serie, en vez de saltar el resumen se ofrece verlo. */
export const RECAP_AFTER_DAYS = 7
const DAY = 24 * 60 * 60 * 1000

/** Días desde la última vez que se vio cualquier episodio de la serie (undefined si nunca). */
export function daysAway(metaId: string, now = Date.now()): number | undefined {
  let last = 0
  for (const e of Object.values(progressStore.get())) if (e.metaId === metaId && e.updatedAt > last) last = e.updatedAt
  return last ? Math.floor((now - last) / DAY) : undefined
}

export function RecapOffer({ days, onWatch, onSkip }: { days: number; onWatch: () => void; onSkip: () => void }) {
  return (
    <div className="next-card recap-offer" role="dialog" aria-labelledby="recap-offer-title">
      <strong id="recap-offer-title">Hace {days} días que no ves esta serie. ¿Ver el resumen?</strong>
      <div className="next-card-actions">
        <button className="btn btn-primary btn-small" onClick={onWatch} autoFocus>
          Ver resumen
        </button>
        <button className="btn btn-small" onClick={onSkip}>
          Saltar
        </button>
      </div>
    </div>
  )
}
