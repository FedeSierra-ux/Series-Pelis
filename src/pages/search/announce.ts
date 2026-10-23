// Lo que Buscar anuncia a los lectores de pantalla al terminar (a11y-05). Lógica pura.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Lo que se anuncia cuando termina una búsqueda (a11y-05): "3 películas y 2 series para “matrix”" o
 * "Sin resultados para “…”". Puro.
 */
export function resultsAnnouncement(o: { query: string; movies: number; series: number; people: number; total: number }): string {
  const q = `para “${o.query}”`
  if (o.total === 0) return `Sin resultados ${q}`
  const parts: string[] = []
  if (o.movies > 0) parts.push(plural(o.movies, 'película', 'películas'))
  if (o.series > 0) parts.push(plural(o.series, 'serie', 'series'))
  if (o.people > 0) parts.push(plural(o.people, 'persona', 'personas'))
  if (parts.length === 0) return `${plural(o.total, 'resultado', 'resultados')} ${q}`
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : parts[0]
  return `${list} ${q}`
}
