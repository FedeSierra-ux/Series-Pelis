import { describe, expect, it } from 'vitest'
import { streamOrder } from './streamOrder'

const groups = [
  { addonUrl: 'a', count: 3 },
  { addonUrl: 'b', count: 4 },
  { addonUrl: 'c', count: 2 },
]

describe('streamOrder', () => {
  it('sin recomendación: el orden de los addons y de cada uno', () => {
    expect(streamOrder(groups)).toEqual([
      { addonIndex: 0, bestIndex: -1, order: [0, 1, 2] },
      { addonIndex: 1, bestIndex: -1, order: [0, 1, 2, 3] },
      { addonIndex: 2, bestIndex: -1, order: [0, 1] },
    ])
  })

  it('la recomendada va primera: su addon arriba y ella primera; lo demás no se mueve', () => {
    expect(streamOrder(groups, { addonUrl: 'b', streamIndex: 2 })).toEqual([
      { addonIndex: 1, bestIndex: 2, order: [2, 0, 1, 3] },
      { addonIndex: 0, bestIndex: -1, order: [0, 1, 2] },
      { addonIndex: 2, bestIndex: -1, order: [0, 1] },
    ])
    const last = streamOrder(groups, { addonUrl: 'c', streamIndex: 1 })
    expect(last.map((p) => p.addonIndex)).toEqual([2, 0, 1])
    expect(last[0].order).toEqual([1, 0])
  })

  it('ya primera: queda igual', () => {
    expect(streamOrder(groups, { addonUrl: 'a', streamIndex: 0 }).map((p) => [p.addonIndex, p.order])).toEqual([
      [0, [0, 1, 2]],
      [1, [0, 1, 2, 3]],
      [2, [0, 1]],
    ])
  })

  it('una recomendada que no está (otro addon o índice viejo) no cambia nada', () => {
    expect(streamOrder(groups, { addonUrl: 'z', streamIndex: 0 })).toEqual(streamOrder(groups))
    expect(streamOrder(groups, { addonUrl: 'a', streamIndex: 7 })).toEqual(streamOrder(groups))
  })
})
