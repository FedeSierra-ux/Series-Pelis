import { describe, expect, it } from 'vitest'
import { locateNextEpisode } from './nextEpisode'
import type { Video } from './types'

const videos: Video[] = [
  // Desordenados a propósito y con `number` en vez de `episode` (como algunos addons).
  { id: 'tt1:2:1', season: 2, number: 1, title: 'Segunda, uno' },
  { id: 'tt1:1:10', season: 1, number: 10, title: 'Décimo' },
  { id: 'tt1:1:9', season: 1, number: 9, title: 'Noveno' },
  { id: 'tt1:1:2', season: 1, episode: 2 },
  { id: 'tt1:2:2', season: 2, number: 2 },
]

describe('locateNextEpisode', () => {
  it('usa `number` cuando el addon no manda `episode`', () => {
    const next = locateNextEpisode(videos, 'tt1:1:9')
    expect(next?.video).toEqual({ id: 'tt1:1:9', season: 1, episode: 9, title: 'Noveno', name: undefined })
    expect(next?.afterNextId).toBe('tt1:1:10')
  })

  it('ordena por temporada y número aunque la lista venga desordenada', () => {
    expect(locateNextEpisode(videos, 'tt1:1:2')?.afterNextId).toBe('tt1:1:9')
  })

  it('al terminar la temporada el siguiente es de la que viene, con su temporada', () => {
    const next = locateNextEpisode(videos, 'tt1:2:1')
    expect(next?.video.season).toBe(2)
    expect(next?.video.episode).toBe(1)
    expect(next?.afterNextId).toBe('tt1:2:2')
    // Último de la serie: no hay nada después.
    expect(locateNextEpisode(videos, 'tt1:2:2')?.afterNextId).toBeUndefined()
  })

  it('sin el video en la lista no devuelve nada', () => {
    expect(locateNextEpisode(videos, 'tt1:9:9')).toBeUndefined()
    expect(locateNextEpisode(undefined, 'tt1:1:1')).toBeUndefined()
  })
})
