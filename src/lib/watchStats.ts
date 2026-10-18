// Números del historial ("2 películas · 5 episodios · 3 h 20 min"). Lógica pura, sin navegador.

export interface WatchStatsEntry {
  type: string
  metaId: string
  watched: boolean
  position: number
  duration: number
}

/** "1 película" / "2 películas" (también 0 va en plural, como se dice). */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Horas enteras vistas, siempre redondeando para abajo (63 h 50 min = 63 h). Es el único criterio para mostrar
 * horas sueltas: Tu año, la meta de horas y el total del historial usan este mismo número (antes Tu año
 * redondeaba y daba 64 h mientras la meta decía 63 h).
 */
export function wholeHours(seconds: number): number {
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds / 3600) : 0
}

/**
 * Tiempo visto, legible: "7 min", "1 h", "3 h 20 min" y, desde las 10 h, solo las horas ("42 h").
 * Antes se redondeaba a horas para abajo y 7 minutos daban "0 h".
 */
export function formatWatchTime(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  // Desde las 10 h solo van las horas, con el mismo criterio que la meta y Tu año.
  if (wholeHours(s) >= 10) return `${wholeHours(s)} h`
  const totalMin = Math.round(s / 60)
  if (totalMin < 60) return s > 0 && totalMin === 0 ? 'menos de 1 min' : `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

export interface WatchStats {
  movies: number
  episodes: number
  seconds: number
}

/** Películas distintas vistas, episodios vistos y tiempo total (lo visto completo + lo empezado). */
export function watchStats(entries: readonly WatchStatsEntry[]): WatchStats {
  const movies = new Set<string>()
  let episodes = 0
  let seconds = 0
  for (const e of entries) {
    if (e.watched && e.type === 'movie') movies.add(e.metaId)
    if (e.watched && e.type === 'series') episodes++
    const t = e.watched ? e.duration : e.position
    if (Number.isFinite(t) && t > 0) seconds += t
  }
  return { movies: movies.size, episodes, seconds }
}
