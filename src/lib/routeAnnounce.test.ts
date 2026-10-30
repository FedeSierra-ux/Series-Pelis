import { describe, expect, it } from 'vitest'
import { ANNOUNCE_MAX_MS, ANNOUNCE_SETTLE_MS, announcementText, settleWait, shouldAnnounce, shouldMoveFocus } from './routeAnnounce'

describe('announcementText (a11y-04)', () => {
  it('saca el " · Flix" del título', () => {
    expect(announcementText('Series · Flix', '/discover/series')).toBe('Series')
    expect(announcementText('Breaking Bad · Flix', '/detail/series/tt0903747')).toBe('Breaking Bad')
  })
  it('el título pelado de Inicio se dice "Inicio"', () => {
    expect(announcementText('Flix', '/')).toBe('Inicio')
    expect(announcementText('', '/')).toBe('Inicio')
  })
  it('una pantalla sin título propio no inventa uno', () => {
    expect(announcementText('Flix', '/lo-que-sea')).toBe('Flix')
  })
})

describe('shouldAnnounce', () => {
  it('solo si cambió la ruta', () => {
    expect(shouldAnnounce('/', '/discover/movie')).toBe(true)
    expect(shouldAnnounce('/search', '/search')).toBe(false)
  })
  it('no en el reproductor, que tiene sus propios avisos', () => {
    expect(shouldAnnounce('/detail/movie/tt1', '/watch/movie/tt1')).toBe(false)
    expect(shouldAnnounce('/watch/movie/tt1', '/detail/movie/tt1')).toBe(true)
  })
})

describe('settleWait', () => {
  it('espera a que el título lleve quieto ANNOUNCE_SETTLE_MS', () => {
    expect(settleWait({ now: 100, lastChange: 100, start: 100 })).toBe(ANNOUNCE_SETTLE_MS)
    expect(settleWait({ now: 100 + ANNOUNCE_SETTLE_MS, lastChange: 100, start: 100 })).toBe(0)
    // Cambió de nuevo a los 300 ms: espera otro tramo desde ahí.
    expect(settleWait({ now: 500, lastChange: 300, start: 0 })).toBe(ANNOUNCE_SETTLE_MS - 200)
  })
  it('con el tope no espera más aunque siga cambiando', () => {
    expect(settleWait({ now: ANNOUNCE_MAX_MS, lastChange: ANNOUNCE_MAX_MS - 1, start: 0 })).toBe(0)
  })
})

describe('shouldMoveFocus', () => {
  it('al entrar (PUSH) con el foco en el riel o en el vacío, en PC y celular', () => {
    expect(shouldMoveFocus({ tv: false, navType: 'PUSH', spot: 'nav' })).toBe(true)
    expect(shouldMoveFocus({ tv: false, navType: 'PUSH', spot: 'body' })).toBe(true)
  })
  it('nunca en la TV (el foco ya se maneja solo) ni al volver (POP) ni con el foco en otro lado', () => {
    expect(shouldMoveFocus({ tv: true, navType: 'PUSH', spot: 'nav' })).toBe(false)
    expect(shouldMoveFocus({ tv: false, navType: 'POP', spot: 'nav' })).toBe(false)
    expect(shouldMoveFocus({ tv: false, navType: 'REPLACE', spot: 'body' })).toBe(false)
    expect(shouldMoveFocus({ tv: false, navType: 'PUSH', spot: 'other' })).toBe(false)
  })
})
