export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const s = Math.floor(totalSeconds % 60)
  const m = Math.floor((totalSeconds / 60) % 60)
  const h = Math.floor(totalSeconds / 3600)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`
}

export const episodeLabel = (season?: number, episode?: number) =>
  season !== undefined && episode !== undefined ? `T${season} · E${episode}` : ''

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })

export function relativeDate(ts: number): string {
  const diff = (ts - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return 'recién'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
  return new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function dayLabel(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Hoy'
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

/** Pósters chicos de Metahub para las grillas: pesan bastante menos que el original. */
export function smallPoster(id: string, poster?: string): string | undefined {
  if (id.startsWith('tt') && (!poster || poster.includes('metahub.space'))) {
    return `https://images.metahub.space/poster/small/${id}/img`
  }
  return poster
}

export function isHls(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url) || /\/hls\//i.test(url)
}

/** Temporadas de una serie según sus episodios (sin contar los especiales, temporada 0). */
export function seasonCount(videos: { season?: number }[] | undefined): number | undefined {
  const seasons = new Set((videos ?? []).map((v) => v.season ?? 0).filter((s) => s > 0))
  return seasons.size || undefined
}

/**
 * Año de una serie: "2026–" con una sola temporada (por ahora) queda "2026", y "2019–2019" siempre queda "2019".
 * Sin saber las temporadas (pósters, Buscar), se adivina: si arrancó este año, casi seguro va por la primera.
 */
export function seriesYear(releaseInfo: string | undefined, seasons?: number, thisYear = new Date().getFullYear()): string | undefined {
  const m = /^(\d{4})\s*[–-]\s*(\d{4})?$/.exec(releaseInfo?.trim() ?? '')
  if (!m) return releaseInfo
  if (m[2] === m[1]) return m[1]
  if (!m[2] && (seasons === 1 || (seasons === undefined && Number(m[1]) === thisYear))) return m[1]
  return releaseInfo
}
