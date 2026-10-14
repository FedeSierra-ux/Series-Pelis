import { describe, expect, it } from 'vitest'
import type { AddonStreams, InstalledAddon, Meta } from '../../lib/types'
import { pendingNames, safeGroups, safeMeta } from './safeData'

const addon = (name: string) => ({ transportUrl: `https://${name}/manifest.json`, manifest: { id: name, name } }) as unknown as InstalledAddon

describe('datos de addons en la ficha (auditoría de código #14)', () => {
  it('streams que no son una lista cuentan como error de ese addon y no rompen el resto', () => {
    const groups = [
      { addon: addon('bien'), streams: [{ url: 'https://a/1.mp4' }], loading: false },
      { addon: addon('roto'), streams: { error: 'rate limited' } as unknown as [], loading: false },
      { addon: addon('basura'), streams: [null, 'x', { url: 'https://a/2.mp4' }] as unknown as [], loading: false },
    ] as AddonStreams[]
    const safe = safeGroups(groups)
    expect(safe[0]).toBe(groups[0])
    expect(safe[1].streams).toEqual([])
    expect(safe[1].error).toBeTruthy()
    expect(safe[2].streams).toEqual([{ url: 'https://a/2.mp4' }])
  })

  it('la ficha con campos raros (videos o géneros que no son listas) se arregla en el borde', () => {
    const meta = safeMeta({
      id: 'tt1',
      type: 'series',
      name: 'Serie',
      videos: { a: 1 },
      genre: 'Drama',
      cast: ['A', 3, 'B'],
      awards: 5,
    } as unknown as Meta)
    expect(meta.videos).toBeUndefined()
    expect(meta.genre).toBeUndefined()
    expect(meta.cast).toEqual(['A', 'B'])
    expect(meta.awards).toBeUndefined()
    const ok = safeMeta({ id: 'tt1', type: 'series', name: 'S', videos: [{ id: 'tt1:1:1' }, { season: 1 }, null] } as unknown as Meta)
    expect(ok.videos).toEqual([{ id: 'tt1:1:1' }])
  })

  it('dice qué addons faltan', () => {
    const g = (name: string, loading: boolean) => ({ addon: addon(name), streams: [], loading }) as AddonStreams
    expect(pendingNames([g('A', false)])).toBe('')
    expect(pendingNames([g('Lento', true), g('B', false)])).toBe('Lento')
    expect(pendingNames([g('A', true), g('B', true)])).toBe('A y B')
    expect(pendingNames([g('A', true), g('B', true), g('C', true), g('D', true)])).toBe('A, B y 2 más')
  })
})
