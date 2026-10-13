import type { PlayState } from '../pages/Detail'
import { getMeta, getStreams } from './addons'
import { addonsStore } from './store'
import type { Meta } from './types'

/** Busca en el siguiente episodio un stream del mismo addon y "bingeGroup" (misma calidad/fuente). */
export async function findNextStream(state: PlayState): Promise<PlayState | undefined> {
  if (!state.nextVideoId || !state.video) return undefined
  const group = state.stream.behaviorHints?.bingeGroup
  if (!group) return undefined
  const addons = addonsStore.get()
  const meta: Meta = await getMeta(addons, state.meta.type, state.meta.id)
  const nextVideo = meta.videos?.find((v) => v.id === state.nextVideoId)
  if (!nextVideo) return undefined
  const sorted = [...(meta.videos ?? [])].sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0))
  const afterNext = sorted[sorted.findIndex((v) => v.id === nextVideo.id) + 1]

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cancel()
      resolve(undefined)
    }, 15000)
    const cancel = getStreams(addons, state.meta.type, nextVideo.id, (groups) => {
      for (const g of groups) {
        const s = g.streams.find((x) => x.behaviorHints?.bingeGroup === group && x.url)
        if (s?.url) {
          clearTimeout(timer)
          cancel()
          resolve({
            ...state,
            stream: s,
            playUrl: s.url,
            video: { id: nextVideo.id, season: nextVideo.season, episode: nextVideo.episode, title: nextVideo.title, name: nextVideo.name },
            nextVideoId: afterNext?.id,
          })
          return
        }
      }
      if (groups.every((g) => !g.loading)) {
        clearTimeout(timer)
        resolve(undefined)
      }
    })
  })
}
