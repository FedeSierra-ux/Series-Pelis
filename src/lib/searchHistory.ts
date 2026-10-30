// Lógica pura de la búsqueda (v0.5): historial de búsquedas recientes y "X y Y" para
// buscar títulos donde aparezcan dos personas juntas. Sin dependencias del navegador
// para poder probarla con vitest.

export const MAX_RECENT = 10
export const MIN_QUERY = 2

/** Saca espacios de más: "  breaking   bad " → "breaking bad". */
export function normalizeQuery(q: string): string {
  return q.replace(/\s+/g, ' ').trim()
}

/** Cuánto del texto buscado se repite en los carteles ("No encontramos nada para …"): uno larguísimo los desbordaba. */
export const ECHO_MAX = 40

/** El texto buscado para mostrarlo en un cartel: si es muy largo, se corta con "…". */
export function echoQuery(q: string): string {
  const chars = [...q]
  return chars.length > ECHO_MAX ? `${chars.slice(0, ECHO_MAX).join('').trimEnd()}…` : q
}

const same = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' }) === 0

/** Agrega la búsqueda arriba de todo, sin repetidos (sin importar mayúsculas ni tildes) y con tope. */
export function pushRecent(list: readonly string[], query: string, max = MAX_RECENT): string[] {
  const q = normalizeQuery(query)
  if (q.length < MIN_QUERY) return [...list]
  return [q, ...list.filter((x) => !same(x, q))].slice(0, max)
}

export function removeRecent(list: readonly string[], query: string): string[] {
  return list.filter((x) => !same(x, query))
}

// "Ricardo Darín y Guillermo Francella", "Pacino e De Niro", "Pitt & Clooney", "Pitt + Clooney", "Pitt and Clooney".
const JOINER = /\s+(?:y|e|and|&|\+|con)\s+|\s*[&+]\s*/i

/**
 * Si el texto parece "persona y persona", devuelve los dos nombres. No sabe si son personas:
 * eso lo confirma la búsqueda de TMDB (por eso "Romeo y Julieta" no molesta).
 */
export function parseTogether(text: string): [string, string] | undefined {
  const q = normalizeQuery(text)
  const parts = q.split(JOINER).map((p) => p.trim())
  if (parts.length !== 2) return undefined
  const [a, b] = parts
  if (a.length < 3 || b.length < 3 || same(a, b)) return undefined
  return [a, b]
}

/**
 * Ejecuta una función recién cuando dejan de llamarla por `ms` (el "debounce" de la búsqueda).
 * `cancel` descarta lo pendiente; `flush` lo ejecuta ya (por ejemplo al apretar Enter).
 */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: A | undefined
  const run = () => {
    timer = undefined
    const args = pending
    pending = undefined
    if (args) fn(...args)
  }
  const debounced = (...args: A) => {
    pending = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(run, ms)
  }
  debounced.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    pending = undefined
  }
  debounced.flush = () => {
    if (timer) clearTimeout(timer)
    run()
  }
  return debounced
}
