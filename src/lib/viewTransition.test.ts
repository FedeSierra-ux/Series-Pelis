import { describe, expect, it } from 'vitest'
import { detailIdOf, sharedKind, shouldAnimate } from './viewTransition'

const on = { supported: true, reducedMotion: false }
const p = (pathname: string) => ({ pathname })

describe('shouldAnimate', () => {
  it('anima al cambiar de pantalla', () => {
    expect(shouldAnimate(p('/'), p('/discover/movie'), on)).toBe(true)
    expect(shouldAnimate(p('/search'), p('/detail/movie/tt1'), on)).toBe(true)
  })
  it('sin soporte o con "reducir movimiento", como siempre', () => {
    expect(shouldAnimate(p('/'), p('/me'), { supported: false, reducedMotion: false })).toBe(false)
    expect(shouldAnimate(p('/'), p('/me'), { supported: true, reducedMotion: true })).toBe(false)
  })
  it('no anima cambios de la misma ruta (?q=, ?season=) ni el reproductor', () => {
    expect(shouldAnimate(p('/search'), p('/search'), on)).toBe(false)
    expect(shouldAnimate(p('/detail/series/tt1'), p('/watch/series/tt1:1:1'), on)).toBe(false)
    expect(shouldAnimate(p('/watch/movie/tt1'), p('/detail/movie/tt1'), on)).toBe(false)
  })
})

describe('sharedKind', () => {
  it('ida solo si se tocó un póster', () => {
    expect(sharedKind(p('/'), p('/detail/movie/tt1'), true)).toBe('enter')
    expect(sharedKind(p('/'), p('/detail/movie/tt1'), false)).toBeUndefined()
    expect(sharedKind(p('/detail/movie/tt1'), p('/detail/movie/tt2'), true)).toBe('enter')
  })
  it('vuelta de la ficha a otra pantalla', () => {
    expect(sharedKind(p('/detail/movie/tt1'), p('/discover/movie'), false)).toBe('back')
    expect(sharedKind(p('/me'), p('/list'), false)).toBeUndefined()
  })
})

describe('detailIdOf', () => {
  it('decodifica el id', () => {
    expect(detailIdOf('/detail/movie/tt0012349')).toBe('tt0012349')
    expect(detailIdOf('/detail/movie/tmdb%3Amovie%3A603')).toBe('tmdb:movie:603')
    expect(detailIdOf('/detail/movie/100%')).toBe('100%')
    expect(detailIdOf('/search')).toBeUndefined()
  })
})
