import { describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async () => undefined,
  set: async () => undefined,
  update: async () => undefined,
  del: async () => undefined,
  delMany: async () => undefined,
  keys: async () => [],
  clear: async () => undefined,
}))

import { rememberTitle, resetLocalTitles } from './localTitlesStore'
import type { WatchEntry } from './store'
import type { Meta } from './types'
import { computeUpNext, continueRowItems, type EpisodeItem } from './upNext'

const DAY = 24 * 60 * 60 * 1000

const entry = (videoId: string, metaId: string, over: Partial<WatchEntry> = {}): WatchEntry => ({
  videoId,
  metaId,
  type: 'series',
  name: metaId,
  position: 600,
  duration: 1200,
  watched: false,
  updatedAt: 1,
  firstWatchedAt: 1,
  ...over,
})

const episode = (metaId: string, over: Partial<EpisodeItem> = {}): EpisodeItem => ({
  metaId,
  seriesName: metaId,
  videoId: `${metaId}:1:2`,
  season: 1,
  episode: 2,
  released: 0,
  hasTime: false,
  watched: false,
  ...over,
})

describe('continueRowItems (Seguir viendo + siguiente episodio en una fila)', () => {
  it('ordena todo por fecha, lo más reciente primero', () => {
    const resume = [entry('ttA:1:1', 'ttA', { updatedAt: 300 }), entry('ttM', 'ttM', { type: 'movie', updatedAt: 100 })]
    const next = [episode('ttB', { lastActivity: 200, released: 50 })]
    expect(continueRowItems(resume, next).map((i) => i.key)).toEqual(['ttA:1:1', 'ttB:1:2', 'ttM'])
  })

  it('"Episodio nuevo" si salió después de lo último que viste; si no, "Siguiente"', () => {
    const items = continueRowItems([], [episode('ttB', { lastActivity: 100, released: 500 }), episode('ttC', { lastActivity: 400, released: 50 })])
    expect(items.map((i) => (i.kind === 'next' ? [i.episode.metaId, i.label] : []))).toEqual([
      ['ttB', 'Episodio nuevo'],
      ['ttC', 'Siguiente'],
    ])
    // El estreno cuenta como fecha del episodio nuevo.
    expect(items[0].at).toBe(500)
  })

  it('una serie aparece una sola vez (lo empezado gana)', () => {
    const items = continueRowItems([entry('ttA:1:3', 'ttA', { updatedAt: 10 })], [episode('ttA', { videoId: 'ttA:1:4', lastActivity: 10 })])
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('resume')
  })
})

describe('computeUpNext', () => {
  const now = new Date(2026, 9, 14, 12).getTime()
  const meta: Meta = {
    id: 'ttS',
    type: 'series',
    name: 'Serie',
    videos: [
      { id: 'ttS:1:1', season: 1, episode: 1, released: '2026-09-01T00:00:00.000Z' },
      { id: 'ttS:1:2', season: 1, episode: 2, released: '2026-10-10T00:00:00.000Z' },
      { id: 'ttS:1:3', season: 1, episode: 3, released: '2026-10-30T00:00:00.000Z' },
    ],
  }
  const followed = [{ id: 'ttS', name: 'Serie', lastActivity: 5 }]

  it('el siguiente sin ver lleva cuándo viste la serie por última vez', () => {
    const progress = { 'ttS:1:1': entry('ttS:1:1', 'ttS', { watched: true, updatedAt: now - 10 * DAY }) }
    const { next } = computeUpNext(followed, new Map([['ttS', meta]]), progress, now)
    expect(next.map((n) => n.videoId)).toEqual(['ttS:1:2'])
    expect(next[0].lastActivity).toBe(now - 10 * DAY)
    // Salió después de lo último visto: en la fila de Inicio es "Episodio nuevo".
    expect(continueRowItems([], next)[0]).toMatchObject({ kind: 'next', label: 'Episodio nuevo' })
  })

  it('no sugiere un episodio que todavía no salió', () => {
    const progress = {
      'ttS:1:1': entry('ttS:1:1', 'ttS', { watched: true }),
      'ttS:1:2': entry('ttS:1:2', 'ttS', { watched: true, updatedAt: 9 }),
    }
    expect(computeUpNext(followed, new Map([['ttS', meta]]), progress, now).next).toEqual([])
  })

  it('el nombre de la serie va en español si ya se sabe (v0.28)', () => {
    rememberTitle('tt77', { id: 77, name: 'La serie', original_name: 'The Show' }, 'tv')
    const show: Meta = { ...meta, id: 'tt77', name: 'The Show', videos: meta.videos!.map((v) => ({ ...v, id: v.id.replace('ttS', 'tt77') })) }
    const progress = { 'tt77:1:1': entry('tt77:1:1', 'tt77', { watched: true }) }
    const { next, calendar } = computeUpNext([{ id: 'tt77', name: 'The Show', lastActivity: 5 }], new Map([['tt77', show]]), progress, now)
    expect(next[0].seriesName).toBe('La serie')
    expect(calendar.every((c) => c.seriesName === 'La serie')).toBe(true)
    resetLocalTitles()
  })
})
