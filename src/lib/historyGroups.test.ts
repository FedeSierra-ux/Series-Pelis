import { describe, expect, it } from 'vitest'
import { groupHistory } from './historyGroups'

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime()

describe('groupHistory', () => {
  it('agrupa por mes y por día, en el orden de la lista', () => {
    const list = [
      { id: 'a', type: 'series', updatedAt: at(2026, 9, 18, 22) },
      { id: 'b', type: 'movie', updatedAt: at(2026, 9, 18, 10) },
      { id: 'c', type: 'series', updatedAt: at(2026, 9, 2) },
      { id: 'd', type: 'movie', updatedAt: at(2026, 8, 30) },
    ]
    const months = groupHistory(list)
    expect(months.map((m) => m.key)).toEqual(['2026-9', '2026-8'])
    expect(months[0]).toMatchObject({ year: 2026, month: 9, movies: 1, episodes: 2 })
    expect(months[0].days.map((d) => d.items.map((i) => i.id))).toEqual([['a', 'b'], ['c']])
    expect(months[0].days[0].date).toBe(new Date(2026, 9, 18).getTime())
    expect(months[1]).toMatchObject({ movies: 1, episodes: 0 })
  })

  it('sin entradas no hay meses', () => {
    expect(groupHistory([])).toEqual([])
  })
})
