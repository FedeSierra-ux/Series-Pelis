import type { PlayState } from '../pages/Detail'
import { getMeta, getStreams, prefetchMeta } from './addons'
import { addonsStore, lastSourceStore, settingsStore, type LastSource } from './store'
import { rankStreams, type RankedStream } from './streamPicker'
import type { AddonStreams, InstalledAddon, Meta } from './types'

/** Cuánto esperar a los addons lentos una vez que ya hay algo reproducible. */
const GRACE_MS = 4000
const TIMEOUT_MS = 15000

/** La fuente de referencia es la que se está viendo ahora; si no se reconoce, la última guardada. */
function referenceSource(state: PlayState, addons: InstalledAddon[]): LastSource | undefined {
  const addonUrl = state.addonUrl ?? addons.find((a) => a.manifest.name === state.addonName)?.transportUrl
  if (addonUrl) return { addonUrl, bingeGroup: state.stream.behaviorHints?.bingeGroup, streamName: state.stream.name, at: Date.now() }
  return lastSourceStore.get()[state.meta.id]
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
  const nextVideo = meta.videos?.find((v) => v.id === state.nextVideoId)
  if (!nextVideo) return undefined
  const sorted = [...(meta.videos ?? [])].sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0))
  const afterNext = sorted[sorted.findIndex((v) => v.id === nextVideo.id) + 1]
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
    video: { id: nextVideo.id, season: nextVideo.season, episode: nextVideo.episode, title: nextVideo.title, name: nextVideo.name },
    nextVideoId: afterNext?.id,
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
