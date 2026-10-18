// Historial con el formato del Diario (v0.23): por mes y, adentro, por día. Lógica pura (la vista está en
// `pages/history/HistoryFeed.tsx`).

export interface HistoryLike {
  type: string
  updatedAt: number
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
  movies: number
  episodes: number
  days: HistoryDay<T>[]
}

/** Agrupa por mes y día respetando el orden que trae la lista (el historial va del más nuevo al más viejo). */
export function groupHistory<T extends HistoryLike>(entries: T[]): HistoryMonth<T>[] {
  const months: HistoryMonth<T>[] = []
  for (const e of entries) {
    const d = new Date(e.updatedAt)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    let month = months[months.length - 1]
    if (month?.key !== key) {
      month = { key, year: d.getFullYear(), month: d.getMonth(), movies: 0, episodes: 0, days: [] }
      months.push(month)
    }
    if (e.type === 'movie') month.movies++
    else month.episodes++
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const day = month.days[month.days.length - 1]
    if (day?.date === date) day.items.push(e)
    else month.days.push({ date, items: [e] })
  }
  return months
}
