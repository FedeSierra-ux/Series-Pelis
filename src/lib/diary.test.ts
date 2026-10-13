import { describe, expect, it } from 'vitest'
import {
  crossedFinish,
  diaryEntryFrom,
  diaryYears,
  episodesLabel,
  groupDiary,
  isDuplicate,
  missingFromProgress,
  rebuildFromProgress,
  rewatchIds,
  withoutLatest,
  withoutVideos,
  type DiaryEntry,
} from './diary'
import type { WatchEntry } from './store'

const at = (y: number, m: number, d: number, h = 21) => new Date(y, m - 1, d, h).getTime()

const movie = (id: string, ts: number, name = id): DiaryEntry =>
  diaryEntryFrom({ videoId: id, metaId: id, type: 'movie', name }, ts, 'player')

const ep = (show: string, s: number, e: number, ts: number): DiaryEntry =>
  diaryEntryFrom({ videoId: `${show}:${s}:${e}`, metaId: show, type: 'series', name: show, season: s, episode: e }, ts, 'player')

const byId = (list: DiaryEntry[]) => Object.fromEntries(list.map((d) => [d.id, d]))

const watch = (p: Partial<WatchEntry> & { videoId: string }): WatchEntry => ({
  metaId: p.videoId.split(':')[0],
  type: 'movie',
  name: 'X',
  position: 0,
  duration: 0,
  watched: false,
  updatedAt: 0,
  firstWatchedAt: 0,
  ...p,
})

describe('crossedFinish', () => {
  it('anota al pasar el 90 %', () => {
    expect(crossedFinish({ position: 80, duration: 100 }, { position: 91, duration: 100 })).toBe(true)
    expect(crossedFinish(undefined, { position: 95, duration: 100 })).toBe(true)
  })
  it('no anota si ya estaba pasado (sigue guardando durante los créditos)', () => {
    expect(crossedFinish({ position: 92, duration: 100 }, { position: 97, duration: 100 })).toBe(false)
  })
  it('volver a verla desde el principio vuelve a anotar', () => {
    expect(crossedFinish({ position: 10, duration: 100 }, { position: 90, duration: 100 })).toBe(true)
  })
  it('sin duración no anota', () => {
    expect(crossedFinish(undefined, { position: 90, duration: 0 })).toBe(false)
  })
})

describe('isDuplicate', () => {
  it('ignora el mismo video dentro de 6 h', () => {
    const e = movie('tt1', at(2026, 3, 1, 20))
    expect(isDuplicate(byId([e]), 'tt1', at(2026, 3, 1, 23))).toBe(true)
    expect(isDuplicate(byId([e]), 'tt1', at(2026, 3, 2, 21))).toBe(false)
    expect(isDuplicate(byId([e]), 'tt2', at(2026, 3, 1, 21))).toBe(false)
  })
})

describe('rebuildFromProgress', () => {
  it('una entrada por cada cosa vista, con la fecha del historial', () => {
    const progress = {
      tt1: watch({ videoId: 'tt1', watched: true, updatedAt: 1000, duration: 6000 }),
      tt2: watch({ videoId: 'tt2', watched: false, updatedAt: 2000 }),
    }
    const out = Object.values(rebuildFromProgress(progress))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ videoId: 'tt1', watchedAt: 1000, duration: 6000, source: 'history' })
  })
  it('missingFromProgress solo agrega lo que no está', () => {
    const have = byId([movie('tt1', 5)])
    const progress = {
      tt1: watch({ videoId: 'tt1', watched: true, updatedAt: 1000 }),
      tt3: watch({ videoId: 'tt3', watched: true, updatedAt: 3000 }),
    }
    expect(Object.values(missingFromProgress(have, progress)).map((d) => d.videoId)).toEqual(['tt3'])
  })
})

describe('borrar', () => {
  it('withoutLatest saca solo la más nueva de ese video', () => {
    const a = movie('tt1', at(2026, 1, 1))
    const b = movie('tt1', at(2026, 5, 1))
    const c = movie('tt2', at(2026, 6, 1))
    expect(Object.keys(withoutLatest(byId([a, b, c]), 'tt1')).sort()).toEqual([a.id, c.id].sort())
  })
  it('withoutVideos saca todas', () => {
    const list = [movie('tt1', 1), movie('tt1', 2), movie('tt2', 3)]
    expect(Object.values(withoutVideos(byId(list), ['tt1'])).map((d) => d.videoId)).toEqual(['tt2'])
  })
})

describe('groupDiary', () => {
  const list = [
    movie('tt1', at(2026, 1, 10), 'Matrix'),
    ep('tt9', 1, 1, at(2026, 2, 3, 20)),
    ep('tt9', 1, 2, at(2026, 2, 3, 21)),
    ep('tt9', 1, 3, at(2026, 2, 3, 22)),
    movie('tt2', at(2026, 2, 3, 23)),
    movie('tt1', at(2026, 2, 20), 'Matrix'),
  ]

  it('agrupa por mes y día, lo más nuevo primero', () => {
    const months = groupDiary(list)
    expect(months.map((m) => m.key)).toEqual(['2026-02', '2026-01'])
    expect(months[0]).toMatchObject({ movies: 2, episodes: 3 })
    expect(months[0].days.map((d) => new Date(d.date).getDate())).toEqual([20, 3])
  })

  it('los episodios de la misma serie y el mismo día van en una fila', () => {
    const day3 = groupDiary(list)[0].days[1]
    expect(day3.items.map((i) => i.metaId)).toEqual(['tt2', 'tt9'])
    const show = day3.items[1]
    expect(show.entries.map((d) => d.episode)).toEqual([1, 2, 3])
    expect(episodesLabel(show.entries)).toBe('T1 · E1–E3')
  })

  it('marca "volviste a verla"', () => {
    const months = groupDiary(list)
    expect(months[0].days[0].items[0]).toMatchObject({ metaId: 'tt1', rewatch: true })
    expect(months[1].days[0].items[0]).toMatchObject({ metaId: 'tt1', rewatch: false })
    expect(rewatchIds(list).size).toBe(1)
  })

  it('filtra por tipo', () => {
    expect(groupDiary(list, 'series').flatMap((m) => m.days.flatMap((d) => d.items)).every((i) => i.type === 'series')).toBe(true)
    expect(groupDiary(list, 'movie')[0].episodes).toBe(0)
  })

  it('años con entradas', () => {
    expect(diaryYears([movie('a', at(2024, 5, 1))], at(2026, 1, 1))).toEqual([2026, 2024])
  })
})

describe('episodesLabel', () => {
  it('uno, varios y entre temporadas', () => {
    expect(episodesLabel([ep('s', 2, 4, 1)])).toBe('T2 · E4')
    expect(episodesLabel([ep('s', 2, 1, 2), ep('s', 1, 9, 1)])).toBe('T1 · E9 – T2 · E1')
    expect(episodesLabel([movie('m', 1)])).toBe('')
  })
})
