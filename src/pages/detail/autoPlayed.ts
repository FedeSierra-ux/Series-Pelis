/**
 * Conjunto con tope: recuerda las últimas `max` claves y olvida las más viejas. Sirve para anotar qué
 * entradas del historial ya se reprodujeron solas sin que la lista crezca sin fin durante la sesión.
 */
export function createRecentSet(max: number) {
  const keys = new Set<string>()
  return {
    has: (key: string) => keys.has(key),
    add(key: string) {
      if (keys.has(key)) keys.delete(key)
      keys.add(key)
      while (keys.size > max) {
        const oldest = keys.values().next().value
        if (oldest === undefined) break
        keys.delete(oldest)
      }
    },
    get size() {
      return keys.size
    },
  }
}
