import { describe, expect, it } from 'vitest'
import { groupHistory } from './historyGroups'

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime()

describe('groupHistory', () => {
  it('agrupa por mes y por día, en el orden de la lista', () => {
    const list = [
      { id: 'a', type: 'series', watched: true, updatedAt: at(2026, 9, 18, 22) },
      { id: 'b', type: 'movie', watched: true, updatedAt: at(2026, 9, 18, 10) },
      { id: 'c', type: 'series', watched: true, updatedAt: at(2026, 9, 2) },
      { id: 'd', type: 'movie', watched: true, updatedAt: at(2026, 8, 30) },
    ]
    const months = groupHistory(list)
    expect(months.map((m) => m.key)).toEqual(['2026-9', '2026-8'])
    expect(months[0]).toMatchObject({ year: 2026, month: 9, movies: 1, episodes: 2, started: 0 })
    expect(months[0].days.map((d) => d.items.map((i) => i.id))).toEqual([['a', 'b'], ['c']])
    expect(months[0].days[0].date).toBe(new Date(2026, 9, 18).getTime())
    expect(months[1]).toMatchObject({ movies: 1, episodes: 0 })
  })

  it('lo empezado y sin terminar no suma como película o episodio', () => {
    const months = groupHistory([
      { type: 'movie', watched: true, updatedAt: at(2026, 9, 18) },
      { type: 'movie', watched: false, updatedAt: at(2026, 9, 17) },
      { type: 'series', updatedAt: at(2026, 9, 16) },
    ])
    expect(months[0]).toMatchObject({ movies: 1, episodes: 0, started: 2 })
  })

  it('con tope, los totales del mes se cuentan sobre toda la lista (Vos e Historial dicen lo mismo)', () => {
    const list = [
      { id: 'a', type: 'series', watched: true, updatedAt: at(2026, 9, 18) },
      { id: 'b', type: 'movie', watched: true, updatedAt: at(2026, 9, 17) },
      { id: 'c', type: 'movie', watched: true, updatedAt: at(2026, 9, 3) },
      { id: 'd', type: 'series', watched: false, updatedAt: at(2026, 9, 2) },
      { id: 'e', type: 'movie', watched: true, updatedAt: at(2026, 8, 30) },
    ]
    const full = groupHistory(list)
    const cut = groupHistory(list, 2)
    // El mes que no entra en el tope no aparece.
    expect(cut.map((m) => m.key)).toEqual(['2026-9'])
    expect(cut[0].days.flatMap((d) => d.items.map((i) => i.id))).toEqual(['a', 'b'])
    const { days: _a, ...cutTotals } = cut[0]
    const { days: _b, ...fullTotals } = full[0]
    expect(cutTotals).toEqual(fullTotals)
    expect(cutTotals).toMatchObject({ movies: 2, episodes: 1, started: 1 })
  })

  it('sin entradas no hay meses', () => {
    expect(groupHistory([])).toEqual([])
  })
})
