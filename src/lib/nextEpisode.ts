import type { PlayState } from '../pages/Detail'
import { getMeta, getStreams, prefetchMeta } from './addons'
import { isDebridDownload, requestDebridDownload, torrentStateFor } from './debrid'
import { addonsStore, lastSourceStore, progressStore, settingsStore, type LastSource, type SourceRules, type WatchEntry } from './store'
import { lastSourceOf, rankStreams, type RankedStream, type TorrentServerArg } from './streamPicker'
import { torrentServerReady } from './torrentServer'
import type { AddonStreams, InstalledAddon, Meta, Video } from './types'
import { episodeNumber, releaseDate } from './upNext'

/** Cuánto esperar a los addons lentos una vez que ya hay algo reproducible. */
const GRACE_MS = 4000
const TIMEOUT_MS = 15000

/** La fuente de referencia es la que se está viendo ahora; si no se reconoce, la última guardada. */
function referenceSource(state: PlayState, addons: InstalledAddon[]): LastSource | undefined {
  const addonUrl = state.addonUrl ?? addons.find((a) => a.manifest.name === state.addonName)?.transportUrl
  // Con el título del stream: así el siguiente episodio sigue en el mismo idioma (auditoría #7).
  if (addonUrl) return lastSourceOf(addonUrl, state.stream)
  return lastSourceStore.get()[state.meta.id]
}

export interface NextEpisode {
  /** El siguiente episodio, con `episode` ya resuelto (algunos addons solo mandan `number`). */
  video: NonNullable<PlayState['video']>
  /** El que viene después de ese (ya estrenado), para que el reproductor siga ofreciendo "Siguiente". */
  afterNextId?: string
}

/** Ya se estrenó (o no tiene fecha: se da por estrenado, así no se esconde nada por un dato que falta). */
function isOut(v: Video, now: number): boolean {
  const d = releaseDate(v)
  return !d || d.at <= now
}

const byEpisode = (a: Video, b: Video) => (a.season ?? 0) - (b.season ?? 0) || (episodeNumber(a) ?? 0) - (episodeNumber(b) ?? 0)

const toPlayVideo = (v: Video): NonNullable<PlayState['video']> => ({ id: v.id, season: v.season, episode: episodeNumber(v), title: v.title, name: v.name })

/**
 * Ubica el siguiente episodio en la lista de videos de la ficha, en orden de temporada y número
 * (`episode` o `number`, según lo que mande el addon), y el que le sigue a ese. El que le sigue
 * tiene que haber salido: si no, al final del episodio se ofrecería uno que se estrena la semana que viene.
 */
export function locateNextEpisode(videos: Video[] | undefined, nextVideoId: string, now = Date.now()): NextEpisode | undefined {
  const nextVideo = videos?.find((v) => v.id === nextVideoId)
  if (!nextVideo) return undefined
  const sorted = [...(videos ?? [])].sort(byEpisode)
  const at = sorted.findIndex((v) => v.id === nextVideo.id)
  const afterNext = sorted.slice(at + 1).find((v) => isOut(v, now))
  return { video: toPlayVideo(nextVideo), afterNextId: afterNext?.id }
}

/** Temporada del siguiente episodio (puede ser otra que la actual), para volver a la ficha en la temporada correcta. */
export async function nextEpisodeSeason(state: PlayState): Promise<number | undefined> {
  if (!state.nextVideoId) return undefined
  const meta: Meta = await getMeta(addonsStore.get(), state.meta.type, state.meta.id)
  return locateNextEpisode(meta.videos, state.nextVideoId)?.video.season
}

/**
 * Qué episodio corresponde a "Continuar" de una serie: el último que se tocó si quedó a medias; si ya se
 * terminó, el siguiente estrenado; sin progreso, el primero de la temporada 1 (los especiales no cuentan).
 */
export function episodeToResume(videos: Video[], progress: Record<string, WatchEntry>, now = Date.now()): Video | undefined {
  const sorted = [...videos].sort(byEpisode)
  const last = sorted
    .map((v) => progress[v.id])
    .filter((e): e is WatchEntry => !!e)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const lastIndex = last ? sorted.findIndex((v) => v.id === last.videoId) : -1
  if (lastIndex >= 0) {
    if (!last.watched) return sorted[lastIndex]
    return sorted.slice(lastIndex + 1).find((v) => isOut(v, now) && !progress[v.id]?.watched && (v.season ?? 0) > 0)
  }
  const regular = sorted.filter((v) => (v.season ?? 0) > 0)
  return (regular.length > 0 ? regular : sorted).find((v) => isOut(v, now))
}

/**
 * Pide los streams de un video y devuelve el mejor según las reglas: termina cuando aparece la misma
 * fuente que antes (mismo bingeGroup), cuando respondieron todos o, si ya hay algo, tras una espera
 * corta por los addons lentos. Con `signal` se puede cancelar (devuelve `undefined`).
 */
function pickStream(
  addons: InstalledAddon[],
  type: string,
  videoId: string,
  rules: SourceRules,
  ref: LastSource | undefined,
  server: TorrentServerArg,
  signal?: AbortSignal,
): Promise<RankedStream | undefined> {
  return new Promise<RankedStream | undefined>((resolve) => {
    let latest: AddonStreams[] = []
    let done = false
    let grace: ReturnType<typeof setTimeout> | undefined
    let cancel: (() => void) | undefined
    const end = (value: RankedStream | undefined) => {
      if (done) return
      done = true
      clearTimeout(timer)
      clearTimeout(grace)
      cancel?.()
      signal?.removeEventListener('abort', onAbort)
      resolve(value)
    }
    const finish = () => end(rankStreams(latest, rules, ref, server)[0])
    const onAbort = () => end(undefined)
    const timer = setTimeout(finish, TIMEOUT_MS)
    if (signal?.aborted) return onAbort()
    signal?.addEventListener('abort', onAbort)
    cancel = getStreams(addons, type, videoId, (groups) => {
      latest = groups
      const top = rankStreams(groups, rules, ref, server)[0]
      // Mismo bingeGroup con enlace directo: no hay nada mejor que esperar (su addon ya respondió). Si es un
      // torrent, un addon con debrid que todavía no respondió le ganaría: se espera como con el resto.
      // v0.27: lo que TorBox todavía no tiene ("[TB download]") va por torrent: también se espera.
      if ((top?.match === 'binge' && !!top.stream.url && !isDebridDownload(top.stream)) || groups.every((g) => !g.loading)) finish()
      else if (top && !grace) grace = setTimeout(finish, GRACE_MS)
    })
    if (done) cancel()
  })
}

/** En modo manual solo vale la misma fuente de antes (mismo addon); en automático, la mejor. */
export function acceptsPick(best: RankedStream | undefined, rules: Pick<SourceRules, 'mode'>): best is RankedStream {
  return !!best && (best.match !== 'none' || rules.mode === 'auto')
}

function rememberSource(metaId: string, best: RankedStream, rules: SourceRules) {
  if (!rules.rememberLast) return
  lastSourceStore.set((all) => ({
    ...all,
    [metaId]: lastSourceOf(best.addon.transportUrl, best.stream),
  }))
}

/**
 * Busca en el siguiente episodio la misma fuente (mismo bingeGroup, o mismo addon y nombre si el
 * addon no da bingeGroup). En modo manual solo acepta streams del mismo addon; en automático, el mejor.
 */
export async function findNextStream(state: PlayState): Promise<PlayState | undefined> {
  if (!state.nextVideoId || !state.video) return undefined
  const addons = addonsStore.get()
  const { sourceRules: rules } = settingsStore.get()
  const server = await torrentServerReady()
  const meta: Meta = await getMeta(addons, state.meta.type, state.meta.id)
  const next = locateNextEpisode(meta.videos, state.nextVideoId)
  if (!next) return undefined
  const best = await pickStream(addons, state.meta.type, next.video.id, rules, referenceSource(state, addons), server)
  if (!acceptsPick(best, rules)) return undefined
  rememberSource(state.meta.id, best, rules)
  const found: PlayState = {
    ...state,
    stream: best.stream,
    playUrl: best.url,
    addonName: best.addon.manifest.name,
    addonUrl: best.addon.transportUrl,
    video: next.video,
    nextVideoId: next.afterNextId,
  }
  // v0.27: si TorBox todavía no lo tiene, el torrent se resuelve acá (y se le pide a TorBox que lo baje), así el
  // reproductor de Android pasa al episodio siguiente sin cerrarse.
  if (isDebridDownload(best.stream) && server.url) {
    requestDebridDownload(best.url)
    return (await torrentStateFor(found, server, addons)) ?? found
  }
  return found
}

export interface ResumeTarget {
  type: string
  metaId: string
  /** Episodio puntual (el de "Seguir viendo" o el siguiente). Sin esto, en una serie se elige con el progreso. */
  videoId?: string
}

/**
 * "Reproducir" / "Continuar" sin pasar por la ficha (Seguir viendo y portada): busca la misma fuente que
 * la última vez (`lastSourceStore`, mismo addon y bingeGroup) con las mismas reglas que el siguiente
 * episodio. En modo manual solo reproduce si encuentra la fuente de antes; en automático, la mejor.
 * Devuelve `undefined` si no hay nada reproducible (la tarjeta abre la ficha como siempre).
 * El reproductor retoma solo desde el progreso guardado.
 */
export async function findResumeStream(target: ResumeTarget, signal?: AbortSignal): Promise<PlayState | undefined> {
  const addons = addonsStore.get()
  const { sourceRules: rules } = settingsStore.get()
  const server = await torrentServerReady()
  const meta: Meta = await getMeta(addons, target.type, target.metaId)
  if (signal?.aborted) return undefined
  const videos = meta.videos ?? []
  const isSeries = target.type === 'series' || videos.length > 0
  let video: Video | undefined
  let nextVideoId: string | undefined
  if (isSeries && videos.length > 0) {
    video = target.videoId ? videos.find((v) => v.id === target.videoId) : episodeToResume(videos, progressStore.get())
    if (!video) return undefined
    nextVideoId = locateNextEpisode(videos, video.id)?.afterNextId
  }
  // Serie sin lista de episodios: no sabemos qué reproducir.
  if (target.type === 'series' && !video) return undefined
  const videoId = video?.id ?? meta.id
  const last = rules.rememberLast ? lastSourceStore.get()[meta.id] : undefined
  const best = await pickStream(addons, meta.type ?? target.type, videoId, rules, last, server, signal)
  if (signal?.aborted || !acceptsPick(best, rules)) return undefined
  rememberSource(meta.id, best, rules)
  return {
    stream: best.stream,
    playUrl: best.url,
    meta: { id: meta.id, type: meta.type ?? target.type, name: meta.name, poster: meta.poster, background: meta.background, logo: meta.logo },
    video: video && toPlayVideo(video),
    nextVideoId,
    addonName: best.addon.manifest.name,
    addonUrl: best.addon.transportUrl,
  }
}

/**
 * Pide de antemano los streams del siguiente episodio (quedan en la caché 10 min), así el
 * paso al siguiente es instantáneo. El reproductor la llama cerca del 70 % del episodio.
 */
export function prefetchNextStreams(state: PlayState): void {
  if (!state.nextVideoId) return
  const addons = addonsStore.get()
  prefetchMeta(addons, state.meta.type, state.meta.id)
  getStreams(addons, state.meta.type, state.nextVideoId, () => {})
}
