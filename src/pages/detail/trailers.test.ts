import { describe, expect, it } from 'vitest'
import { backdropTrailerAllowed, embedTrailerUrl, isYtId, originalTitle } from './trailers'

describe('tráileres de la ficha', () => {
  it('la URL va sin interfaz, con subtítulos en español y, el de fondo, sin sonido y en loop', () => {
    const full = new URL(embedTrailerUrl('dQw4w9WgXcQ', { origin: 'https://x.pages.dev' }))
    expect(full.origin).toBe('https://www.youtube-nocookie.com')
    expect(full.searchParams.get('controls')).toBe('0')
    expect(full.searchParams.get('cc_load_policy')).toBe('1')
    expect(full.searchParams.get('cc_lang_pref')).toBe('es')
    expect(full.searchParams.get('mute')).toBe('0')
    expect(full.searchParams.get('loop')).toBeNull()
    expect(full.searchParams.get('enablejsapi')).toBe('1')
    expect(full.searchParams.get('origin')).toBe('https://x.pages.dev')
    const bg = new URL(embedTrailerUrl('dQw4w9WgXcQ', { muted: true, loop: true }))
    expect(bg.searchParams.get('mute')).toBe('1')
    expect(bg.searchParams.get('loop')).toBe('1')
    expect(bg.searchParams.get('playlist')).toBe('dQw4w9WgXcQ')
  })

  it('solo acepta ids de YouTube', () => {
    expect(isYtId('dQw4w9WgXcQ')).toBe(true)
    expect(isYtId('../../x?y')).toBe(false)
    expect(isYtId(undefined)).toBe(false)
  })

  it('el de fondo respeta el ajuste, el ahorro de datos, reducir movimiento y no va en el celular', () => {
    const pc = { enabled: true, saveData: false, reducedMotion: false, wide: true, coarsePointer: false }
    expect(backdropTrailerAllowed(pc)).toBe(true)
    expect(backdropTrailerAllowed({ ...pc, enabled: false })).toBe(false)
    expect(backdropTrailerAllowed({ ...pc, saveData: true })).toBe(false)
    expect(backdropTrailerAllowed({ ...pc, reducedMotion: true })).toBe(false)
    expect(backdropTrailerAllowed({ ...pc, wide: false })).toBe(false)
    expect(backdropTrailerAllowed({ ...pc, coarsePointer: true })).toBe(false)
  })

  it('título original si está en alfabeto latino (si no, el de TMDB)', () => {
    expect(originalTitle({ original_title: 'The Matrix' }, 'Matrix')).toBe('The Matrix')
    expect(originalTitle({ original_name: '진격의 거인' }, 'Attack on Titan')).toBe('Attack on Titan')
    expect(originalTitle(undefined, 'X')).toBe('X')
  })
})
