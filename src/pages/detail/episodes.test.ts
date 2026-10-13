import { describe, expect, it } from 'vitest'
import type { WatchEntry } from '../../lib/store'
import type { Video } from '../../lib/types'
import { episodeToContinue, firstEpisode, formatReleaseDate, isReleased, localToday, nextReleased, seasonStatus, sortVideos } from './episodes'

const NOW = new Date(2026, 9, 13, 15).getTime() // 13 oct 2026, 15:00 local

const v = (season: number, episode: number, released?: string): Video => ({ id: `tt1:${season}:${episode}`, season, episode, released })

const watched = (video: Video, done = true, updatedAt = 1): WatchEntry => ({
  videoId: video.id,
  metaId: 'tt1',
  type: 'series',
  name: 'Serie',
  season: video.season,
  episode: video.episode,
  position: done ? 2400 : 600,
  duration: 2400,
  watched: done,
  updatedAt,
  firstWatchedAt: updatedAt,
})

const season1 = [v(1, 1, '2026-10-01T00:00:00.000Z'), v(1, 2, '2026-10-08T00:00:00.000Z'), v(1, 3, '2026-10-13T00:00:00.000Z'), v(1, 4, '2026-10-20T00:00:00.000Z')]

describe('episodios de la ficha', () => {
  it('ordena por temporada y número (y acepta `number` en vez de `episode`)', () => {
    const list: Video[] = [{ id: 'c', season: 2, number: 1 }, { id: 'b', season: 1, episode: 2 }, { id: 'a', season: 1, episode: 1 }]
    expect(sortVideos(list).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('un episodio con fecha de hoy (medianoche UTC) ya cuenta como estrenado; sin fecha también', () => {
    expect(isReleased(v(1, 3, '2026-10-13T00:00:00.000Z'), NOW)).toBe(true)
    expect(isReleased(v(1, 4, '2026-10-20T00:00:00.000Z'), NOW)).toBe(false)
    expect(isReleased(v(1, 5), NOW)).toBe(true)
  })

  it('"siguiente episodio" saltea los que todavía no se estrenaron', () => {
    expect(nextReleased(season1, season1[1], NOW)?.id).toBe('tt1:1:3')
    expect(nextReleased(season1, season1[2], NOW)).toBeUndefined()
    expect(nextReleased(season1, v(9, 9), NOW)).toBeUndefined()
  })

  it('el primer episodio es el de la temporada 1, no un especial', () => {
    const list = [v(0, 1, '2020-01-01'), ...season1]
    expect(firstEpisode(list, NOW)?.id).toBe('tt1:1:1')
    expect(firstEpisode([v(1, 1, '2027-01-01')], NOW)).toBeUndefined()
  })

  it('"Continuar": el que quedó a medias, o el siguiente estrenado al último terminado', () => {
    const halfway = { [season1[1].id]: watched(season1[1], false, 10) }
    expect(episodeToContinue(season1, halfway, NOW)?.id).toBe('tt1:1:2')
    const finished = { [season1[0].id]: watched(season1[0], true, 5), [season1[1].id]: watched(season1[1], true, 10) }
    expect(episodeToContinue(season1, finished, NOW)?.id).toBe('tt1:1:3')
    expect(episodeToContinue(season1, {}, NOW)?.id).toBe('tt1:1:1')
    // Terminó el último estrenado: no hay nada para continuar todavía.
    const upToDate = { [season1[2].id]: watched(season1[2], true, 10) }
    expect(episodeToContinue(season1, upToDate, NOW)).toBeUndefined()
  })

  it('la fecha se muestra el día que dice Cinemeta, no el anterior', () => {
    expect(formatReleaseDate(v(1, 1, '2026-10-13T00:00:00.000Z'))).toMatch(/^13 (de )?oct/)
    expect(formatReleaseDate(v(1, 1))).toBeUndefined()
  })

  it('"hoy" es la fecha local', () => {
    expect(localToday(new Date(2026, 9, 13, 23, 30))).toBe('2026-10-13')
    expect(localToday(new Date(2026, 0, 5, 0, 10))).toBe('2026-01-05')
  })

  it('la temporada está completa cuando todos los estrenados están vistos', () => {
    const progress = Object.fromEntries(season1.slice(0, 3).map((e) => [e.id, watched(e)]))
    const s = seasonStatus(season1, progress, NOW)
    expect(s.released.map((e) => e.id)).toEqual(['tt1:1:1', 'tt1:1:2', 'tt1:1:3'])
    expect(s.complete).toBe(true)
    expect(seasonStatus(season1, {}, NOW).complete).toBe(false)
    expect(seasonStatus([v(2, 1, '2027-01-01')], {}, NOW)).toEqual({ released: [], complete: false })
  })
})
