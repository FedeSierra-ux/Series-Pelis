import { describe, expect, it } from 'vitest'
import { buildHomeData, HOME_CONTINUE_MAX } from './nativeHome'
import { parseLaunchPath } from './nativeLaunch'
import type { WatchEntry } from './store'
import type { ContinueItem, EpisodeItem } from './upNext'

const entry = (over: Partial<WatchEntry> = {}): WatchEntry => ({
  videoId: 'tt0903747:1:2',
  metaId: 'tt0903747',
  type: 'series',
  name: 'Breaking Bad',
  poster: 'https://img/poster.jpg',
  season: 1,
  episode: 2,
  episodeTitle: 'Cat in the Bag',
  position: 600.4,
  duration: 2880,
  watched: false,
  updatedAt: 1000,
  firstWatchedAt: 900,
  ...over,
})

const episode = (over: Partial<EpisodeItem> = {}): EpisodeItem => ({
  metaId: 'tt1',
  seriesName: 'Serie',
  videoId: 'tt1:2:1',
  season: 2,
  episode: 1,
  title: 'Vuelta',
  thumbnail: 'http://inseguro/thumb.jpg',
  released: 5000,
  hasTime: false,
  watched: false,
  ...over,
})

describe('buildHomeData', () => {
  it('arma "A continuación" con lo empezado y el siguiente episodio', () => {
    const items: ContinueItem[] = [
      { kind: 'resume', key: 'tt0903747:1:2', at: 1000, entry: entry() },
      { kind: 'next', key: 'tt1:2:1', at: 5000, episode: episode(), label: 'Episodio nuevo' },
      { kind: 'next', key: 'tt2:1:3', at: 400, episode: episode({ metaId: 'tt2', videoId: 'tt2:1:3' }), label: 'Siguiente' },
    ]
    const data = buildHomeData('main', items)
    expect(data.profile).toBe('main')
    expect(data.continue[0]).toMatchObject({
      key: 'tt0903747:1:2',
      kind: 'continue',
      type: 'series',
      title: 'Breaking Bad',
      position: 600,
      duration: 2880,
      image: 'https://images.metahub.space/background/medium/tt0903747/img',
      poster: 'https://img/poster.jpg',
    })
    // La miniatura http no se manda: queda el fondo de metahub.
    expect(data.continue[1]).toMatchObject({ kind: 'new', image: 'https://images.metahub.space/background/medium/tt1/img', position: 0 })
    expect(data.continue[2].kind).toBe('next')
    // Cada enlace abre la ficha y reproduce ese mismo episodio.
    for (const it of data.continue) expect(parseLaunchPath(it.path)?.play?.videoId).toBe(it.key)
  })

  it('las pelis reproducen directo', () => {
    const movie = entry({ videoId: 'tt0133093', metaId: 'tt0133093', type: 'movie', season: undefined, episode: undefined })
    const data = buildHomeData('p2', [{ kind: 'resume', key: movie.videoId, at: 1, entry: movie }])
    expect(data).toEqual({ profile: 'p2', continue: [expect.objectContaining({ path: '/detail/movie/tt0133093?play=1' })] })
  })

  it('no pasa del tope', () => {
    const items: ContinueItem[] = Array.from({ length: 40 }, (_, i) => {
      const e = entry({ videoId: `tt${i}`, metaId: `tt${i}`, type: 'movie' })
      return { kind: 'resume', key: e.videoId, at: i, entry: e }
    })
    expect(buildHomeData('main', items).continue).toHaveLength(HOME_CONTINUE_MAX)
  })
})
