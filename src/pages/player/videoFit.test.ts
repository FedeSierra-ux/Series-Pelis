import { describe, expect, it } from 'vitest'
import { FIT_KEY, FIT_LABELS, nextFit, readFit, storeFit } from './videoFit'

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data }
}

describe('ajustar / llenar / estirar', () => {
  it('da la vuelta en orden', () => {
    expect(nextFit('contain')).toBe('cover')
    expect(nextFit('cover')).toBe('fill')
    expect(nextFit('fill')).toBe('contain')
    expect(FIT_LABELS).toEqual({ contain: 'Ajustar', cover: 'Llenar', fill: 'Estirar' })
  })

  it('se recuerda por dispositivo', () => {
    const s = memory()
    expect(readFit(s)).toBe('contain')
    storeFit('cover', s)
    expect(s.data.get(FIT_KEY)).toBe('cover')
    expect(readFit(s)).toBe('cover')
  })

  it('un valor raro o el almacenamiento bloqueado vuelven a "ajustar"', () => {
    const s = memory()
    s.setItem(FIT_KEY, 'zoom')
    expect(readFit(s)).toBe('contain')
    const blocked = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
    }
    expect(readFit(blocked)).toBe('contain')
    expect(() => storeFit('fill', blocked)).not.toThrow()
  })
})
