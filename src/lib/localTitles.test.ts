import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  baseImdbId,
  cleanEntries,
  isFresh,
  localTitle,
  MISSING_TTL_MS,
  NAME_TTL_MS,
  peekTitleEntry,
  pruneEntries,
  rememberTitle,
  resetLocalTitles,
  spanishName,
  subscribeTitle,
} from './localTitlesStore'

describe('reglas del nombre', () => {
  it('usa la traducción de TMDB', () => {
    expect(spanishName({ title: 'Ella y yo', original_title: 'His & Hers' })).toBe('Ella y yo')
    expect(spanishName({ name: 'El juego del calamar', original_name: '오징어 게임' })).toBe('El juego del calamar')
  })

  it('sin traducción en alfabeto latino sirve el original (una peli argentina o francesa)', () => {
    expect(spanishName({ title: 'El secreto de sus ojos', original_title: 'El secreto de sus ojos' })).toBe('El secreto de sus ojos')
    expect(spanishName({ title: 'Amélie', original_title: 'Amélie' })).toBe('Amélie')
  })

  it('en otro alfabeto no: queda el de Cinemeta', () => {
    expect(spanishName({ title: '千と千尋の神隠し', original_title: '千と千尋の神隠し' })).toBeUndefined()
    expect(spanishName(undefined)).toBeUndefined()
    expect(spanishName({ title: '  ' })).toBeUndefined()
  })

  it('el id base de un episodio', () => {
    expect(baseImdbId('tt0903747:2:3')).toBe('tt0903747')
    expect(baseImdbId('tmdb:movie:603')).toBeUndefined()
    expect(baseImdbId(undefined)).toBeUndefined()
  })
})

describe('vencimiento y tope', () => {
  const now = 1_000_000_000_000
  it('30 días con nombre, 7 sin traducción', () => {
    expect(isFresh({ n: 'Matrix', at: now - NAME_TTL_MS + 1 }, now)).toBe(true)
    expect(isFresh({ n: 'Matrix', at: now - NAME_TTL_MS }, now)).toBe(false)
    expect(isFresh({ at: now - MISSING_TTL_MS + 1 }, now)).toBe(true)
    expect(isFresh({ at: now - MISSING_TTL_MS }, now)).toBe(false)
    expect(isFresh(undefined, now)).toBe(false)
  })

  it('deja los más nuevos', () => {
    const all = { tt1: { at: 1 }, tt2: { at: 3 }, tt3: { at: 2 } }
    expect(Object.keys(pruneEntries(all, 2)).sort()).toEqual(['tt2', 'tt3'])
    expect(pruneEntries(all, 5)).toBe(all)
  })

  it('limpia lo guardado', () => {
    expect(cleanEntries({ tt1: { at: 5, n: 'A', t: 3, k: 'movie' }, x: { at: 1 }, tt2: { n: 'sin fecha' }, tt3: 'roto', tt4: { at: 1, n: 7, k: 'otro' } })).toEqual({
      tt1: { at: 5, n: 'A', o: undefined, t: 3, k: 'movie' },
      tt4: { at: 1, n: undefined, o: undefined, t: undefined, k: undefined },
    })
    expect(cleanEntries(null)).toEqual({})
  })
})

describe('mapa', () => {
  beforeEach(() => resetLocalTitles())
  afterEach(() => resetLocalTitles())

  it('anota, traduce al mostrar y avisa solo a ese título', () => {
    const matrix = vi.fn()
    const other = vi.fn()
    subscribeTitle('tt0133093', matrix)
    subscribeTitle('tt0000001', other)
    expect(localTitle('tt0133093', 'The Matrix')).toBe('The Matrix')
    rememberTitle('tt0133093', { id: 603, title: 'Matrix', original_title: 'The Matrix' }, 'movie')
    expect(localTitle('tt0133093', 'The Matrix')).toBe('Matrix')
    expect(localTitle('tt0133093:1:1', 'x')).toBe('Matrix')
    expect(peekTitleEntry('tt0133093')).toMatchObject({ n: 'Matrix', o: 'The Matrix', t: 603, k: 'movie' })
    expect(matrix).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()
    // Mismo nombre otra vez: no redibuja.
    rememberTitle('tt0133093', { id: 603, title: 'Matrix', original_title: 'The Matrix' }, 'movie')
    expect(matrix).toHaveBeenCalledTimes(1)
  })

  it('sin resultado guarda la marca (para no volver a preguntar) y conserva lo que se sabía', () => {
    rememberTitle('tt1', { id: 9, title: 'Uno' }, 'tv', 10)
    rememberTitle('tt1', undefined, undefined, 20)
    expect(peekTitleEntry('tt1')).toEqual({ n: 'Uno', o: undefined, t: 9, k: 'tv', at: 20 })
    rememberTitle('tt2', undefined, undefined, 20)
    expect(peekTitleEntry('tt2')).toMatchObject({ n: undefined, t: undefined, at: 20 })
    expect(localTitle('tt2', 'Original')).toBe('Original')
  })
})
