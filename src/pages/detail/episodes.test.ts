import { describe, expect, it } from 'vitest'
import type { WatchEntry } from '../../lib/store'
import type { Video } from '../../lib/types'
import {
  episodeBadge,
  episodeHeading,
  episodeToContinue,
  firstEpisode,
  formatReleaseDate,
  isReleased,
  localToday,
  nextReleased,
  overviewsByEpisode,
  seasonLabel,
  seasonsAsDropdown,
  seasonStatus,
  sortVideos,
  suggestedForPanel,
} from './episodes'

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

  it('"Ver ahora" en una serie sin ver es T1 E1, no un especial de la temporada 0 (auditoría #1)', () => {
    const list = sortVideos([v(0, 1, '2009-02-17'), v(0, 2, '2009-02-24'), ...season1])
    expect(list[0].season).toBe(0)
    expect(episodeToContinue(list, {}, NOW)?.id).toBe('tt1:1:1')
    // Vistos todos los de la temporada 1 ya estrenados: no vuelve a los especiales.
    const seen = Object.fromEntries(season1.slice(0, 3).map((e, i) => [e.id, watched(e, true, i + 1)]))
    expect(episodeToContinue(list, seen, NOW)).toBeUndefined()
    // Una serie que solo tiene especiales sigue andando.
    expect(episodeToContinue([v(0, 1, '2020-01-01')], {}, NOW)?.id).toBe('tt1:0:1')
    // Si lo último que tocaste fue un especial a medias, se sigue con ese.
    const special = { 'tt1:0:2': watched(v(0, 2), false, 50) }
    expect(episodeToContinue(list, special, NOW)?.id).toBe('tt1:0:2')
  })

  it('selector de temporadas: pestañas hasta 6, desplegable desde 7 (los especiales no cuentan)', () => {
    expect(seasonsAsDropdown([1, 2, 3, 4, 5, 6])).toBe(false)
    expect(seasonsAsDropdown([1, 2, 3, 4, 5, 6, 0])).toBe(false)
    expect(seasonsAsDropdown([1, 2, 3, 4, 5, 6, 7])).toBe(true)
    expect(seasonsAsDropdown([])).toBe(false)
    expect(seasonLabel(0)).toBe('Especiales')
    expect(seasonLabel(3)).toBe('Temporada 3')
  })

  it('marca "Siguiente" o "Continuar" solo en el episodio sugerido y si ya empezaste la serie', () => {
    const [e1, e2] = season1
    expect(episodeBadge(e1, e1, {}, false)).toBeUndefined()
    expect(episodeBadge(e2, e2, { [e1.id]: watched(e1) }, true)).toBe('Siguiente')
    expect(episodeBadge(e1, e2, { [e1.id]: watched(e1) }, true)).toBeUndefined()
    expect(episodeBadge(e2, e2, { [e2.id]: watched(e2, false) }, true)).toBe('Continuar')
    expect(episodeBadge(e2, undefined, {}, true)).toBeUndefined()
  })
})

describe('suggestedForPanel (ficha-04)', () => {
  const e1 = v(1, 1)
  const e2 = v(1, 2)
  it('sin nada visto: el primero, "Para empezar"', () => {
    expect(suggestedForPanel(e1, e1, {}, false)).toEqual({ video: e1, kicker: 'Para empezar' })
  })
  it('viendo la serie: "Siguiente" o "Continuar" si quedó a medias', () => {
    expect(suggestedForPanel(e2, e1, { [e1.id]: watched(e1) }, true)).toEqual({ video: e2, kicker: 'Siguiente' })
    expect(suggestedForPanel(e2, e1, { [e2.id]: watched(e2, false) }, true)).toEqual({ video: e2, kicker: 'Continuar' })
  })
  it('terminada: el primero para volver a ver; sin episodios, nada', () => {
    expect(suggestedForPanel(undefined, e1, { [e1.id]: watched(e1) }, true)).toEqual({ video: e1, kicker: 'Volver a ver' })
    expect(suggestedForPanel(undefined, undefined, {}, false)).toBeUndefined()
  })
  it('título "T1 · E1 · Pilot"', () => {
    expect(episodeHeading({ ...e1, title: 'Pilot' })).toBe('T1 · E1 · Pilot')
    expect(episodeHeading(e2)).toBe('T1 · E2')
  })
})

describe('overviewsByEpisode (ficha-11)', () => {
  const eps = [v(1, 1, '2008-01-20T00:00:00.000Z'), v(1, 2, '2008-01-27T00:00:00.000Z'), v(1, 3)]
  it('usa la sinopsis de TMDB del mismo número de episodio, si tiene texto', () => {
    const m = overviewsByEpisode(eps, [
      { episode_number: 1, overview: 'Walter White, profesor de química…', air_date: '2008-01-20' },
      { episode_number: 2, overview: '  ', air_date: '2008-01-27' },
      { episode_number: 3, overview: 'Tercero', air_date: '2008-02-10' },
    ])
    expect([...m]).toEqual([
      [eps[0].id, 'Walter White, profesor de química…'],
      [eps[2].id, 'Tercero'],
    ])
  })
  it('si la fecha de estreno no coincide, es otro episodio: queda la de Cinemeta', () => {
    expect(overviewsByEpisode(eps, [{ episode_number: 1, overview: 'Otro', air_date: '2009-05-01' }]).size).toBe(0)
    expect(overviewsByEpisode(eps, [{ episode_number: 1, overview: 'Un día después', air_date: '2008-01-21' }]).get(eps[0].id)).toBe('Un día después')
  })
  it('sin datos de TMDB, nada', () => {
    expect(overviewsByEpisode(eps, undefined).size).toBe(0)
  })
})
