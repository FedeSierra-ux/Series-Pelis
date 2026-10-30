import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce, ECHO_MAX, echoQuery, MAX_RECENT, normalizeQuery, parseTogether, pushRecent, removeRecent } from './searchHistory'

describe('búsquedas recientes', () => {
  it('normaliza espacios', () => {
    expect(normalizeQuery('  breaking   bad ')).toBe('breaking bad')
  })

  it('agrega arriba y sin repetidos (sin importar mayúsculas ni tildes)', () => {
    let list = pushRecent([], 'Matrix')
    list = pushRecent(list, 'Darín')
    list = pushRecent(list, 'matrix')
    expect(list).toEqual(['matrix', 'Darín'])
    expect(pushRecent(list, 'darin')).toEqual(['darin', 'matrix'])
  })

  it('ignora búsquedas de menos de 2 letras', () => {
    expect(pushRecent(['a b'], ' x ')).toEqual(['a b'])
  })

  it(`guarda como máximo ${MAX_RECENT}`, () => {
    let list: string[] = []
    for (let i = 0; i < 15; i++) list = pushRecent(list, `búsqueda ${i}`)
    expect(list).toHaveLength(MAX_RECENT)
    expect(list[0]).toBe('búsqueda 14')
    expect(list.at(-1)).toBe('búsqueda 5')
  })

  it('borra una sola', () => {
    expect(removeRecent(['uno', 'Dos', 'tres'], 'dos')).toEqual(['uno', 'tres'])
  })
})

describe('parseTogether', () => {
  it('reconoce "X y Y" y variantes', () => {
    expect(parseTogether('Ricardo Darín y Guillermo Francella')).toEqual(['Ricardo Darín', 'Guillermo Francella'])
    expect(parseTogether('Pacino e De Niro')).toEqual(['Pacino', 'De Niro'])
    expect(parseTogether('Pitt & Clooney')).toEqual(['Pitt', 'Clooney'])
    expect(parseTogether('pitt+clooney')).toEqual(['pitt', 'clooney'])
    expect(parseTogether('Hanks and Ryan')).toEqual(['Hanks', 'Ryan'])
  })

  it('no inventa pares', () => {
    expect(parseTogether('Matrix')).toBeUndefined()
    expect(parseTogether('Tom y Jo')).toBeUndefined() // nombres demasiado cortos
    expect(parseTogether('uno y dos y tres')).toBeUndefined()
    expect(parseTogether('Darín y darin')).toBeUndefined()
  })
})

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('ejecuta solo la última llamada cuando dejan de escribir', () => {
    const fn = vi.fn()
    const d = debounce(fn, 300)
    d('m')
    d('ma')
    vi.advanceTimersByTime(299)
    d('mat')
    vi.advanceTimersByTime(299)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('mat')
  })

  it('flush ejecuta ya (Enter) y cancel descarta', () => {
    const fn = vi.fn()
    const d = debounce(fn, 300)
    d('matrix')
    d.flush()
    expect(fn).toHaveBeenCalledWith('matrix')
    d('otra')
    d.cancel()
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(1)
    d.flush() // sin nada pendiente no hace nada
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('echoQuery (uso-09)', () => {
  it('deja igual lo corto y corta con "…" lo larguísimo', () => {
    expect(echoQuery('breaking bad')).toBe('breaking bad')
    const out = echoQuery('a'.repeat(300))
    expect(out).toBe(`${'a'.repeat(ECHO_MAX)}…`)
    expect(echoQuery('palabra '.repeat(20))).toMatch(/palabra…$/)
  })
})
