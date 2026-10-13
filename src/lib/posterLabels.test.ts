import { describe, expect, it } from 'vitest'
import { followedSeriesIds, isRecentRelease, pickPosterLabel, seriesLabel } from './posterLabels'
import type { ListItem, WatchEntry } from './store'
import type { Video } from './types'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date(2026, 9, 13, 12).getTime()
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString()

const ep = (season: number, episode: number, released: string): Video => ({ id: `tt1:${season}:${episode}`, season, episode, released })

function watched(season: number, episode: number, at: number, extra: Partial<WatchEntry> = {}): Record<string, WatchEntry> {
  const id = `tt1:${season}:${episode}`
  return {
    [id]: {
      videoId: id,
      metaId: 'tt1',
      type: 'series',
      name: 'Serie',
      season,
      episode,
      position: 2400,
      duration: 2500,
      watched: true,
      updatedAt: at,
      firstWatchedAt: at,
      ...extra,
    },
  }
}

describe('pickPosterLabel', () => {
  it('una sola etiqueta, con prioridad: episodio > temporada > Top 10 > estreno', () => {
    expect(pickPosterLabel({ premiere: true, top10: true, 'new-episode': true })).toBe('new-episode')
    expect(pickPosterLabel({ premiere: true, 'new-season': true, top10: true })).toBe('new-season')
    expect(pickPosterLabel({ premiere: true, top10: true })).toBe('top10')
    expect(pickPosterLabel({ premiere: true })).toBe('premiere')
    expect(pickPosterLabel({})).toBeUndefined()
  })
})

describe('isRecentRelease', () => {
  it('estrenada en el último mes', () => {
    expect(isRecentRelease(daysAgo(5), NOW)).toBe(true)
    expect(isRecentRelease(daysAgo(29), NOW)).toBe(true)
    expect(isRecentRelease(daysAgo(40), NOW)).toBe(false)
  })

  it('no cuenta lo que todavía no salió ni las fechas que faltan o están mal', () => {
    expect(isRecentRelease(new Date(NOW + 10 * DAY).toISOString(), NOW)).toBe(false)
    expect(isRecentRelease(undefined, NOW)).toBe(false)
    expect(isRecentRelease('cualquier cosa', NOW)).toBe(false)
  })

  it('las fechas de medianoche UTC de Cinemeta valen como día local', () => {
    expect(isRecentRelease('2026-10-13T00:00:00.000Z', NOW)).toBe(true)
  })
})

describe('seriesLabel', () => {
  const videos = [ep(1, 1, daysAgo(400)), ep(1, 2, daysAgo(393)), ep(2, 1, daysAgo(20)), ep(2, 2, daysAgo(13)), ep(2, 3, daysAgo(6))]

  it('episodio nuevo: salió después de lo último que viste', () => {
    const progress = { ...watched(2, 1, NOW - 15 * DAY), ...watched(2, 2, NOW - 10 * DAY) }
    expect(seriesLabel(videos, progress, 'tt1', NOW)).toBe('new-episode')
  })

  it('sin etiqueta si estás al día', () => {
    const progress = { ...watched(2, 2, NOW - 10 * DAY), ...watched(2, 3, NOW - 2 * DAY) }
    expect(seriesLabel(videos, progress, 'tt1', NOW)).toBeUndefined()
  })

  it('sin etiqueta si lo que falta ya había salido cuando viste lo último (te estás poniendo al día)', () => {
    const progress = watched(2, 1, NOW - 1 * DAY)
    expect(seriesLabel(videos, progress, 'tt1', NOW)).toBeUndefined()
  })

  it('temporada nueva: viste la anterior y arrancó otra', () => {
    const progress = watched(1, 2, NOW - 300 * DAY)
    expect(seriesLabel(videos, progress, 'tt1', NOW)).toBe('new-season')
  })

  it('temporada nueva también para series en Mi lista que no empezaste (temporada 2 o más)', () => {
    expect(seriesLabel(videos, {}, 'tt1', NOW)).toBe('new-season')
    const onlySeason1 = [ep(1, 1, daysAgo(10)), ep(1, 2, daysAgo(3))]
    expect(seriesLabel(onlySeason1, {}, 'tt1', NOW)).toBeUndefined()
  })

  it('los episodios viejos no son "nuevos"', () => {
    const old = [ep(1, 1, daysAgo(400)), ep(1, 2, daysAgo(200)), ep(1, 3, daysAgo(100))]
    expect(seriesLabel(old, watched(1, 1, NOW - 300 * DAY), 'tt1', NOW)).toBeUndefined()
  })

  it('ignora los especiales, los que no salieron y las series que sacaste de "Seguir viendo"', () => {
    const withExtras = [...videos.slice(0, 2), ep(0, 1, daysAgo(2)), ep(2, 1, new Date(NOW + 5 * DAY).toISOString())]
    expect(seriesLabel(withExtras, watched(1, 2, NOW - 300 * DAY), 'tt1', NOW)).toBeUndefined()
    const hidden = { ...watched(2, 1, NOW - 15 * DAY), ...watched(2, 2, NOW - 10 * DAY, { hidden: true }) }
    expect(seriesLabel(videos, hidden, 'tt1', NOW)).toBeUndefined()
  })
})

describe('followedSeriesIds', () => {
  it('series del progreso y de Mi lista, la actividad más reciente primero y sin pelis', () => {
    const progress: Record<string, WatchEntry> = {
      ...watched(1, 1, 100),
      m: { videoId: 'm', metaId: 'tt9', type: 'movie', name: 'Peli', position: 1, duration: 2, watched: false, updatedAt: 999, firstWatchedAt: 999 },
    }
    const list: Record<string, ListItem> = {
      tt2: { id: 'tt2', type: 'series', name: 'Otra', addedAt: 500 },
      tt1: { id: 'tt1', type: 'series', name: 'Serie', addedAt: 50 },
    }
    expect(followedSeriesIds(progress, list)).toEqual(['tt2', 'tt1'])
  })
})
