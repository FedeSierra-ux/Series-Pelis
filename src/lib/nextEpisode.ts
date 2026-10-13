import type { PlayState } from '../pages/Detail'
import { getMeta, getStreams, prefetchMeta } from './addons'
import { addonsStore, lastSourceStore, settingsStore, type LastSource } from './store'
import { rankStreams, type RankedStream } from './streamPicker'
import type { AddonStreams, InstalledAddon, Meta, Video } from './types'
import { episodeNumber } from './upNext'

/** Cuánto esperar a los addons lentos una vez que ya hay algo reproducible. */
const GRACE_MS = 4000
const TIMEOUT_MS = 15000

/** La fuente de referencia es la que se está viendo ahora; si no se reconoce, la última guardada. */
function referenceSource(state: PlayState, addons: InstalledAddon[]): LastSource | undefined {
  const addonUrl = state.addonUrl ?? addons.find((a) => a.manifest.name === state.addonName)?.transportUrl
  if (addonUrl) return { addonUrl, bingeGroup: state.stream.behaviorHints?.bingeGroup, streamName: state.stream.name, at: Date.now() }
  return lastSourceStore.get()[state.meta.id]
}

export interface NextEpisode {
  /** El siguiente episodio, con `episode` ya resuelto (algunos addons solo mandan `number`). */
  video: NonNullable<PlayState['video']>
  /** El que viene después de ese, para que el reproductor siga ofreciendo "Siguiente". */
  afterNextId?: string
}

/**
 * Ubica el siguiente episodio en la lista de videos de la ficha, en orden de temporada y número
 * (`episode` o `number`, según lo que mande el addon), y el que le sigue a ese.
 */
export function locateNextEpisode(videos: Video[] | undefined, nextVideoId: string): NextEpisode | undefined {
  const nextVideo = videos?.find((v) => v.id === nextVideoId)
  if (!nextVideo) return undefined
  const sorted = [...(videos ?? [])].sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (episodeNumber(a) ?? 0) - (episodeNumber(b) ?? 0))
  const afterNext = sorted[sorted.findIndex((v) => v.id === nextVideo.id) + 1]
  return {
    video: { id: nextVideo.id, season: nextVideo.season, episode: episodeNumber(nextVideo), title: nextVideo.title, name: nextVideo.name },
    afterNextId: afterNext?.id,
  }
}

/** Temporada del siguiente episodio (puede ser otra que la actual), para volver a la ficha en la temporada correcta. */
export async function nextEpisodeSeason(state: PlayState): Promise<number | undefined> {
  if (!state.nextVideoId) return undefined
  const meta: Meta = await getMeta(addonsStore.get(), state.meta.type, state.meta.id)
  return locateNextEpisode(meta.videos, state.nextVideoId)?.video.season
}

/**
 * Busca en el siguiente episodio la misma fuente (mismo bingeGroup, o mismo addon y nombre si el
 * addon no da bingeGroup). En modo manual solo acepta streams del mismo addon; en automático, el mejor.
 */
export async function findNextStream(state: PlayState): Promise<PlayState | undefined> {
  if (!state.nextVideoId || !state.video) return undefined
  const addons = addonsStore.get()
  const { sourceRules: rules, streamingServerUrl: server } = settingsStore.get()
  const meta: Meta = await getMeta(addons, state.meta.type, state.meta.id)
  const next = locateNextEpisode(meta.videos, state.nextVideoId)
  if (!next) return undefined
  const nextVideo = next.video
  const ref = referenceSource(state, addons)

  const best = await new Promise<RankedStream | undefined>((resolve) => {
    let latest: AddonStreams[] = []
    let done = false
    let grace: ReturnType<typeof setTimeout> | undefined
    let cancel: (() => void) | undefined
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      clearTimeout(grace)
      cancel?.()
      resolve(rankStreams(latest, rules, ref, server)[0])
    }
    const timer = setTimeout(finish, TIMEOUT_MS)
    cancel = getStreams(addons, state.meta.type, nextVideo.id, (groups) => {
      latest = groups
      const top = rankStreams(groups, rules, ref, server)[0]
      // Mismo bingeGroup: no hay nada mejor que esperar (su addon ya respondió).
      if (top?.match === 'binge' || groups.every((g) => !g.loading)) finish()
      else if (top && !grace) grace = setTimeout(finish, GRACE_MS)
    })
    if (done) cancel()
  })

  if (!best || (best.match === 'none' && rules.mode !== 'auto')) return undefined
  if (rules.rememberLast) {
    lastSourceStore.set((all) => ({
      ...all,
      [state.meta.id]: { addonUrl: best.addon.transportUrl, bingeGroup: best.stream.behaviorHints?.bingeGroup, streamName: best.stream.name, at: Date.now() },
    }))
  }
  return {
    ...state,
    stream: best.stream,
    playUrl: best.url,
    addonName: best.addon.manifest.name,
    addonUrl: best.addon.transportUrl,
    video: nextVideo,
    nextVideoId: next.afterNextId,
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
