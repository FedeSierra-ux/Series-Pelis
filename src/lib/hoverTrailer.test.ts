import { describe, expect, it } from 'vitest'
import { hoverTrailerUrl, placeCard, trailerAllowed, trailerKeyFromMeta, ytCommand, ytPlayerState, type TrailerEnv } from './hoverTrailer'

describe('hoverTrailerUrl', () => {
  const url = new URL(hoverTrailerUrl('dQw4w9WgXcQ', 'http://localhost:4177'))

  it('YouTube sin cookies, arranca solo y sin sonido', () => {
    expect(url.origin).toBe('https://www.youtube-nocookie.com')
    expect(url.pathname).toBe('/embed/dQw4w9WgXcQ')
    expect(url.searchParams.get('autoplay')).toBe('1')
    expect(url.searchParams.get('mute')).toBe('1')
    expect(url.searchParams.get('controls')).toBe('0')
  })

  it('con subtítulos en español', () => {
    expect(url.searchParams.get('cc_load_policy')).toBe('1')
    expect(url.searchParams.get('cc_lang_pref')).toBe('es')
    expect(url.searchParams.get('hl')).toBe('es')
  })

  it('en loop y con la API de iframes para el botón de sonido', () => {
    expect(url.searchParams.get('loop')).toBe('1')
    expect(url.searchParams.get('playlist')).toBe('dQw4w9WgXcQ')
    expect(url.searchParams.get('enablejsapi')).toBe('1')
    expect(url.searchParams.get('origin')).toBe('http://localhost:4177')
  })
})

describe('trailerKeyFromMeta', () => {
  it('prefiere trailerStreams y después los tráileres de tipo "Trailer"', () => {
    expect(trailerKeyFromMeta({ trailerStreams: [{ ytId: 'abcdefghijk' }], trailers: [{ source: 'zzzzzzzzzzz', type: 'Trailer' }] })).toBe('abcdefghijk')
    expect(
      trailerKeyFromMeta({
        trailers: [
          { source: 'clip1234567', type: 'Clip' },
          { source: 'trailer1234', type: 'Trailer' },
        ],
      }),
    ).toBe('trailer1234')
    expect(trailerKeyFromMeta({ trailers: [{ source: 'clip1234567', type: 'Clip' }] })).toBe('clip1234567')
  })

  it('descarta ids raros y metas sin tráiler', () => {
    expect(trailerKeyFromMeta({ trailerStreams: [{ ytId: 'https://evil/x' }] })).toBeUndefined()
    expect(trailerKeyFromMeta({})).toBeUndefined()
    expect(trailerKeyFromMeta(undefined)).toBeUndefined()
  })
})

describe('trailerAllowed', () => {
  const pc: TrailerEnv = { enabled: true, saveData: false, reducedMotion: false, wide: true, finePointer: true, coarsePointer: false }

  it('en la PC con el mouse o el teclado', () => {
    expect(trailerAllowed(pc, 'mouse')).toBe(true)
    expect(trailerAllowed(pc, 'focus')).toBe(true)
  })

  it('en la TV (sin mouse) solo con el foco del control remoto', () => {
    const tv = { ...pc, finePointer: false }
    expect(trailerAllowed(tv, 'focus')).toBe(true)
    expect(trailerAllowed(tv, 'mouse')).toBe(false)
  })

  it('nunca en celulares, con reducir movimiento, ahorro de datos o el ajuste apagado', () => {
    expect(trailerAllowed({ ...pc, coarsePointer: true, finePointer: false }, 'focus')).toBe(false)
    expect(trailerAllowed({ ...pc, wide: false }, 'mouse')).toBe(false)
    expect(trailerAllowed({ ...pc, reducedMotion: true }, 'mouse')).toBe(false)
    expect(trailerAllowed({ ...pc, saveData: true }, 'mouse')).toBe(false)
    expect(trailerAllowed({ ...pc, enabled: false }, 'mouse')).toBe(false)
  })
})

describe('placeCard', () => {
  it('centrada sobre el póster', () => {
    const p = placeCard({ left: 500, top: 300, width: 160, height: 240 }, 1366, 800)
    expect(p.width).toBe(368)
    expect(p.left + p.width / 2).toBeCloseTo(580, 0)
  })

  it('no se sale de la pantalla en los bordes', () => {
    const left = placeCard({ left: 0, top: 700, width: 160, height: 240 }, 1366, 800)
    expect(left.left).toBe(12)
    expect(left.top + (left.width * 9) / 16 + 92).toBeLessThanOrEqual(800 - 8 + 1)
    const right = placeCard({ left: 1300, top: 0, width: 160, height: 240 }, 1366, 800)
    expect(right.left + right.width).toBeLessThanOrEqual(1366 - 12)
    // Nunca tapa la barra de navegación.
    expect(right.top).toBeGreaterThanOrEqual(72)
  })

  it('en pantallas angostas usa casi todo el ancho', () => {
    expect(placeCard({ left: 10, top: 10, width: 300, height: 450 }, 400, 800).width).toBe(376)
  })
})

describe('ytCommand', () => {
  it('mensaje de la API de iframes de YouTube', () => {
    expect(JSON.parse(ytCommand('unMute'))).toEqual({ event: 'command', func: 'unMute', args: [] })
  })
})

describe('ytPlayerState', () => {
  it('lee el estado de infoDelivery y de onStateChange', () => {
    expect(ytPlayerState(JSON.stringify({ event: 'infoDelivery', info: { playerState: 1, muted: true } }))).toBe(1)
    expect(ytPlayerState({ event: 'onStateChange', info: 2 })).toBe(2)
  })

  it('ignora lo que no trae estado o no es JSON', () => {
    expect(ytPlayerState(JSON.stringify({ event: 'infoDelivery', info: { muted: true } }))).toBeUndefined()
    expect(ytPlayerState('no es json')).toBeUndefined()
    expect(ytPlayerState(null)).toBeUndefined()
  })
})
