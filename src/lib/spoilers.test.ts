import { describe, expect, it } from 'vitest'
import { episodeSeen, furthestWatched, hideEpisode, hideTitleSynopsis } from './spoilers'
import type { WatchEntry } from './store'

const entry = (videoId: string, season: number | undefined, episode: number | undefined, watched: boolean, metaId = 'tt1'): WatchEntry => ({
  videoId,
  metaId,
  type: season === undefined ? 'movie' : 'series',
  name: 'X',
  season,
  episode,
  position: watched ? 100 : 10,
  duration: 100,
  watched,
  updatedAt: 1,
  firstWatchedAt: 1,
})

const progress: Record<string, WatchEntry> = {
  'tt1:2:3': entry('tt1:2:3', 2, 3, true),
  'tt1:2:5': entry('tt1:2:5', 2, 5, false),
  'tt1:0:1': entry('tt1:0:1', 0, 1, true),
  tt9: entry('tt9', undefined, undefined, false, 'tt9'),
}

describe('modo sin spoilers', () => {
  const furthest = furthestWatched(progress).get('tt1')

  it('el más lejano visto no cuenta especiales ni empezados', () => {
    expect(furthest).toEqual({ season: 2, episode: 3 })
  })

  it('lo anterior al último visto se da por visto', () => {
    expect(episodeSeen({ videoId: 'tt1:1:8', season: 1, episode: 8 }, progress, furthest)).toBe(true)
    expect(episodeSeen({ videoId: 'tt1:2:2', season: 2, episode: 2 }, progress, furthest)).toBe(true)
    expect(episodeSeen({ videoId: 'tt1:2:4', season: 2, episode: 4 }, progress, furthest)).toBe(false)
    // Empezado pero no terminado: sigue oculto.
    expect(episodeSeen({ videoId: 'tt1:2:5', season: 2, episode: 5 }, progress, furthest)).toBe(false)
    // Especial marcado como visto.
    expect(episodeSeen({ videoId: 'tt1:0:1', season: 0, episode: 1 }, progress, furthest)).toBe(true)
    expect(episodeSeen({ videoId: 'tt1:0:2', season: 0, episode: 2 }, progress, furthest)).toBe(false)
  })

  it('solo esconde con el modo activado', () => {
    const ep = { videoId: 'tt1:3:1', season: 3, episode: 1 }
    expect(hideEpisode({ spoilerFree: false }, ep, progress, furthest)).toBe(false)
    expect(hideEpisode({ spoilerFree: true }, ep, progress, furthest)).toBe(true)
    expect(hideEpisode({ spoilerFree: true }, { videoId: 'tt1:1:1', season: 1, episode: 1 }, progress, furthest)).toBe(false)
  })

  it('la sinopsis del título solo se esconde si no la empezaste ni la puntuaste', () => {
    const on = { spoilerFree: true, spoilerUnstarted: true }
    expect(hideTitleSynopsis(on, 'tt5', progress, false)).toBe(true)
    expect(hideTitleSynopsis(on, 'tt5', progress, true)).toBe(false)
    expect(hideTitleSynopsis(on, 'tt9', progress, false)).toBe(false)
    expect(hideTitleSynopsis({ spoilerFree: true, spoilerUnstarted: false }, 'tt5', progress, false)).toBe(false)
    expect(hideTitleSynopsis({ spoilerFree: false, spoilerUnstarted: true }, 'tt5', progress, false)).toBe(false)
  })
})
