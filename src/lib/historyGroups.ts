// Historial con el formato del Diario (v0.23): por mes y, adentro, por día. Lógica pura (la vista está en
// `pages/history/HistoryFeed.tsx`).

export interface HistoryLike {
  type: string
  updatedAt: number
  /** Terminado. Solo lo terminado suma en "N películas · N episodios" (igual que `watchStats`). */
  watched?: boolean
}

export interface HistoryDay<T> {
  /** Inicio del día (ms, hora local). */
  date: number
  items: T[]
}

export interface HistoryMonth<T> {
  /** `2026-9` (mes de 0 a 11, como `Date`). */
  key: string
  year: number
  month: number
  /** Películas terminadas en el mes (sobre toda la lista, aunque se muestren menos). */
  movies: number
  /** Episodios terminados en el mes. */
  episodes: number
  /** Lo empezado y sin terminar en el mes. */
  started: number
  days: HistoryDay<T>[]
}

/**
 * Agrupa por mes y día respetando el orden que trae la lista (el historial va del más nuevo al más viejo).
 * Con `limit` solo se muestran las primeras `limit` entradas, pero los totales de cada mes se cuentan sobre toda
 * la lista: así Vos (con tope) e Historial (completo) dicen lo mismo del mismo mes.
 */
export function groupHistory<T extends HistoryLike>(entries: T[], limit = Infinity): HistoryMonth<T>[] {
  const months: HistoryMonth<T>[] = []
  entries.forEach((e, i) => {
    const d = new Date(e.updatedAt)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    let month = months[months.length - 1]
    if (month?.key !== key) {
      month = { key, year: d.getFullYear(), month: d.getMonth(), movies: 0, episodes: 0, started: 0, days: [] }
      months.push(month)
    }
    if (!e.watched) month.started++
    else if (e.type === 'movie') month.movies++
    else month.episodes++
    if (i >= limit) return
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const day = month.days[month.days.length - 1]
    if (day?.date === date) day.items.push(e)
    else month.days.push({ date, items: [e] })
  })
  return months.filter((m) => m.days.length > 0)
}
