// Recargar el reproductor (F5, o el navegador de la TV / Android que restaura la pestaña) o abrir su URL
// directo: no hay `location.state` con el stream. En vez de mandar a Inicio, se vuelve a la ficha del
// título con el episodio elegido, que ofrece "Continuar" desde donde quedó.

/** Lo mínimo del progreso guardado que sirve para ubicar el título de un episodio. */
interface SavedEntry {
  metaId: string
  season?: number
}

export function safeDecode(id: string): string {
  if (!id.includes('%')) return id
  try {
    return decodeURIComponent(id)
  } catch {
    return id
  }
}

/**
 * Ruta de la ficha para `/watch/:type/:id`. En las series el id es el del episodio ("tt0903747:1:2"):
 * el título sale del progreso guardado o, si no, de la forma `título:temporada:episodio`.
 */
export function detailPathFor(type: string, rawId: string, progress: Record<string, SavedEntry | undefined> = {}): string {
  const videoId = safeDecode(rawId)
  if (!videoId) return '/'
  const saved = progress[videoId]
  let metaId = saved?.metaId
  let season = saved?.season
  if (!metaId) {
    const m = /^(.+):(\d+):(\d+)$/.exec(videoId)
    metaId = type !== 'movie' && m ? m[1] : videoId
    if (m && type !== 'movie') season ??= Number(m[2])
  }
  const base = `/detail/${encodeURIComponent(type)}/${encodeURIComponent(metaId)}`
  if (metaId === videoId) return base
  const params = new URLSearchParams()
  if (season !== undefined) params.set('season', String(season))
  params.set('video', videoId)
  return `${base}?${params.toString()}`
}
