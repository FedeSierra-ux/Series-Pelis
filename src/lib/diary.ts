import type { WatchEntry } from './store'

// Diario (estilo Letterboxd): una entrada cada vez que se termina de ver algo, con la fecha.
// A diferencia del progreso (una fila por video), acá cada vez que lo volvés a ver suma otra.
// Lógica pura: el store vive en `store.ts` (diaryStore) y la vista en `pages/Diary.tsx`.

export interface DiaryEntry {
  /** `${videoId}@${watchedAt}` */
  id: string
  videoId: string
  metaId: string
  type: string
  name: string
  poster?: string
  season?: number
  episode?: number
  episodeTitle?: string
  /** Cuándo lo terminó (ms). */
  watchedAt: number
  /** Duración en segundos (0 si no se sabe: marcado como visto sin reproducir). */
  duration: number
  /** player: lo terminó en el reproductor. manual: "Marcar como vista". history: armado con el historial viejo (fecha aprox.). */
  source: 'player' | 'manual' | 'history'
}

export interface DiaryState {
  /** 0 = todavía no se armó con el historial existente. */
  v: number
  entries: Record<string, DiaryEntry>
}

/** Mismo umbral que usa el historial para "visto". */
export const FINISH_RATIO = 0.9
/** Si se vuelve a cruzar el 90 % del mismo video dentro de este lapso (adelantar y volver), no se anota de nuevo. */
export const DEDUPE_MS = 6 * 60 * 60 * 1000

type Base = Pick<WatchEntry, 'videoId' | 'metaId' | 'type' | 'name' | 'poster' | 'season' | 'episode' | 'episodeTitle'>

export const diaryId = (videoId: string, at: number) => `${videoId}@${at}`

export function diaryEntryFrom(e: Base & { duration?: number }, at: number, source: DiaryEntry['source']): DiaryEntry {
  return {
    id: diaryId(e.videoId, at),
    videoId: e.videoId,
    metaId: e.metaId,
    type: e.type,
    name: e.name,
    poster: e.poster,
    season: e.season,
    episode: e.episode,
    episodeTitle: e.episodeTitle,
    watchedAt: at,
    duration: e.duration && e.duration > 0 ? Math.round(e.duration) : 0,
    source,
  }
}

const ratio = (p?: { position: number; duration: number }) => (p && p.duration > 0 ? p.position / p.duration : 0)

/** ¿Con este guardado de progreso se cruzó el 90 %? (también al volver a verlo desde el principio). */
export function crossedFinish(prev: { position: number; duration: number } | undefined, next: { position: number; duration: number }): boolean {
  return ratio(next) >= FINISH_RATIO && ratio(prev) < FINISH_RATIO
}

/** No anotar dos veces el mismo video si ya hay una entrada hace menos de 6 h. */
export function isDuplicate(entries: Record<string, DiaryEntry>, videoId: string, at: number): boolean {
  return Object.values(entries).some((d) => d.videoId === videoId && Math.abs(at - d.watchedAt) < DEDUPE_MS)
}

/** La primera vez: una entrada por cada cosa marcada como vista en el historial (con la última fecha que se vio). */
export function rebuildFromProgress(progress: Record<string, WatchEntry>): Record<string, DiaryEntry> {
  const out: Record<string, DiaryEntry> = {}
  for (const e of Object.values(progress)) {
    if (!e.watched) continue
    const d = diaryEntryFrom(e, e.updatedAt, 'history')
    out[d.id] = d
  }
  return out
}

/** Lo que falta en el diario de un historial importado (copias viejas sin diario). */
export function missingFromProgress(entries: Record<string, DiaryEntry>, progress: Record<string, WatchEntry>): Record<string, DiaryEntry> {
  const have = new Set(Object.values(entries).map((d) => d.videoId))
  const rebuilt = rebuildFromProgress(progress)
  return Object.fromEntries(Object.entries(rebuilt).filter(([, d]) => !have.has(d.videoId)))
}

export function withoutVideos(entries: Record<string, DiaryEntry>, videoIds: string[]): Record<string, DiaryEntry> {
  const ids = new Set(videoIds)
  return Object.fromEntries(Object.entries(entries).filter(([, d]) => !ids.has(d.videoId)))
}

/** Saca solo la entrada más reciente de ese video (para "desmarcar como vista"). */
export function withoutLatest(entries: Record<string, DiaryEntry>, videoId: string): Record<string, DiaryEntry> {
  let latest: DiaryEntry | undefined
  for (const d of Object.values(entries)) if (d.videoId === videoId && (!latest || d.watchedAt > latest.watchedAt)) latest = d
  if (!latest) return entries
  const { [latest.id]: _removed, ...rest } = entries
  return rest
}

// ---------- Vista agrupada ----------

export type DiaryFilter = 'all' | 'movie' | 'series'

/** Una fila del diario: una peli, o varios episodios de la misma serie vistos el mismo día. */
export interface DiaryItem {
  key: string
  metaId: string
  type: string
  name: string
  poster?: string
  /** Del más viejo al más nuevo. */
  entries: DiaryEntry[]
  /** La última vez del grupo. */
  watchedAt: number
  /** Ya lo habías visto antes (todas las entradas del grupo son repeticiones). */
  rewatch: boolean
  /** Fecha aproximada (armada con el historial viejo). */
  approx: boolean
}

export interface DiaryDay {
  /** Medianoche local (ms). */
  date: number
  items: DiaryItem[]
}

export interface DiaryMonth {
  /** `2026-10` */
  key: string
  year: number
  /** 0-11 */
  month: number
  days: DiaryDay[]
  movies: number
  episodes: number
}

export const dayStart = (ts: number) => {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** ¿Cuáles entradas son "volviste a verla"? (peli: misma peli antes; episodio: mismo episodio antes). */
export function rewatchIds(entries: DiaryEntry[]): Set<string> {
  const seen = new Set<string>()
  const out = new Set<string>()
  for (const d of [...entries].sort((a, b) => a.watchedAt - b.watchedAt)) {
    const k = d.type === 'movie' ? d.metaId : d.videoId
    if (seen.has(k)) out.add(d.id)
    seen.add(k)
  }
  return out
}

/** Agrupa por mes y día (lo más nuevo primero); los episodios de una serie del mismo día van juntos. */
export function groupDiary(all: DiaryEntry[], filter: DiaryFilter = 'all'): DiaryMonth[] {
  const rewatched = rewatchIds(all)
  const list = all
    .filter((d) => filter === 'all' || (filter === 'movie' ? d.type === 'movie' : d.type !== 'movie'))
    .sort((a, b) => b.watchedAt - a.watchedAt)

  const months: DiaryMonth[] = []
  for (const d of list) {
    const date = new Date(d.watchedAt)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    let month = months[months.length - 1]
    if (month?.key !== key) {
      month = { key, year: date.getFullYear(), month: date.getMonth(), days: [], movies: 0, episodes: 0 }
      months.push(month)
    }
    if (d.type === 'movie') month.movies++
    else month.episodes++

    const start = dayStart(d.watchedAt)
    let day = month.days[month.days.length - 1]
    if (day?.date !== start) {
      day = { date: start, items: [] }
      month.days.push(day)
    }
    const group = d.type !== 'movie' ? day.items.find((i) => i.metaId === d.metaId) : undefined
    if (group) {
      group.entries.unshift(d)
      group.rewatch &&= rewatched.has(d.id)
      group.approx ||= d.source === 'history'
    } else {
      day.items.push({
        key: d.id,
        metaId: d.metaId,
        type: d.type,
        name: d.name,
        poster: d.poster,
        entries: [d],
        watchedAt: d.watchedAt,
        rewatch: rewatched.has(d.id),
        approx: d.source === 'history',
      })
    }
  }
  return months
}

/** "T1 · E1–E5", "T1 · E3", "T1 · E9 – T2 · E2". */
export function episodesLabel(entries: DiaryEntry[]): string {
  const eps = entries
    .filter((d) => d.season !== undefined && d.episode !== undefined)
    .sort((a, b) => a.season! - b.season! || a.episode! - b.episode!)
  if (!eps.length) return ''
  const first = eps[0]
  const last = eps[eps.length - 1]
  if (eps.length === 1) return `T${first.season} · E${first.episode}`
  if (first.season === last.season) return `T${first.season} · E${first.episode}–E${last.episode}`
  return `T${first.season} · E${first.episode} – T${last.season} · E${last.episode}`
}

/** Años con algo en el diario, del más nuevo al más viejo (siempre incluye el actual). */
export function diaryYears(entries: DiaryEntry[], now = Date.now()): number[] {
  const years = new Set<number>([new Date(now).getFullYear()])
  for (const d of entries) years.add(new Date(d.watchedAt).getFullYear())
  return [...years].sort((a, b) => b - a)
}
