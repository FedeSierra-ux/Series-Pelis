import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cachedLogoTone,
  canMeasureLogo,
  classifyLogoPixels,
  FALLBACK_TONE,
  LIGHT_SHARE,
  measureLogoTone,
  MIN_PIXELS,
  relativeLuminance,
  rememberLogoTone,
  resetLogoToneCache,
  retryUrl,
  STORAGE_MAX,
} from './logoTone'

type Px = [number, number, number, number]

/** Arma los píxeles RGBA de un logo: `n` veces cada color. */
function pixels(...parts: [Px, number][]): Uint8ClampedArray {
  const flat: number[] = []
  for (const [px, n] of parts) for (let i = 0; i < n; i++) flat.push(...px)
  return new Uint8ClampedArray(flat)
}

const BLACK: Px = [0, 0, 0, 255]
const WHITE: Px = [255, 255, 255, 255]
const RED: Px = [226, 35, 26, 255] // rojo de Spider-Man
const NAVY: Px = [20, 30, 90, 255] // borde azul oscuro de Spider-Man
const DARK_RED: Px = [110, 10, 10, 255] // Blade Runner 2049
const MATRIX_GREEN: Px = [120, 230, 90, 255]
const CLEAR: Px = [255, 255, 255, 0]

describe('relativeLuminance', () => {
  it('va de 0 (negro) a 1 (blanco)', () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0)
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 5)
    expect(relativeLuminance(128, 128, 128)).toBeCloseTo(0.216, 2)
  })
})

describe('classifyLogoPixels', () => {
  it('un logo negro (Severance) es oscuro', () => {
    expect(classifyLogoPixels(pixels([BLACK, 500], [CLEAR, 1500]))).toBe('dark')
  })

  it('un rojo oscuro es oscuro; blanco, verde claro y rojo vivo son claros', () => {
    expect(classifyLogoPixels(pixels([DARK_RED, 200]))).toBe('dark')
    expect(classifyLogoPixels(pixels([WHITE, 200]))).toBe('light')
    expect(classifyLogoPixels(pixels([MATRIX_GREEN, 200]))).toBe('light')
    expect(classifyLogoPixels(pixels([RED, 200]))).toBe('light')
  })

  it('Spider-Man: rojo con mucho borde azul oscuro sigue siendo claro', () => {
    expect(classifyLogoPixels(pixels([RED, 40], [NAVY, 60], [CLEAR, 400]))).toBe('light')
  })

  it('un logo oscuro con pocos brillos sigue siendo oscuro', () => {
    expect(classifyLogoPixels(pixels([BLACK, 90], [WHITE, 10]))).toBe('dark')
  })

  it('el umbral es la parte legible de lo opaco', () => {
    const n = 100
    const light = Math.ceil(n * LIGHT_SHARE)
    expect(classifyLogoPixels(pixels([WHITE, light], [BLACK, n - light]))).toBe('light')
    expect(classifyLogoPixels(pixels([WHITE, light - 1], [BLACK, n - light + 1]))).toBe('dark')
  })

  it('ignora lo transparente (aunque sea blanco) y lo casi transparente', () => {
    expect(classifyLogoPixels(pixels([BLACK, 100], [CLEAR, 5000], [[255, 255, 255, 100], 5000]))).toBe('dark')
  })

  it('sin píxeles opacos suficientes no decide', () => {
    expect(classifyLogoPixels(new Uint8ClampedArray())).toBeUndefined()
    expect(classifyLogoPixels(pixels([CLEAR, 1000]))).toBeUndefined()
    expect(classifyLogoPixels(pixels([WHITE, MIN_PIXELS - 1]))).toBeUndefined()
    expect(classifyLogoPixels(pixels([WHITE, MIN_PIXELS]))).toBe('light')
  })

  it('el valor seguro es con halo', () => {
    expect(FALLBACK_TONE).toBe('dark')
  })
})

describe('canMeasureLogo / retryUrl', () => {
  it('solo metahub y TMDB por https', () => {
    expect(canMeasureLogo('https://images.metahub.space/logo/medium/tt11280740/img')).toBe(true)
    expect(canMeasureLogo('https://image.tmdb.org/t/p/w500/abc.png')).toBe(true)
    expect(canMeasureLogo('http://images.metahub.space/logo/medium/tt1/img')).toBe(false)
    expect(canMeasureLogo('https://example.com/logo.png')).toBe(false)
    expect(canMeasureLogo('https://metahub.space.example.com/logo.png')).toBe(false)
    expect(canMeasureLogo('no es una url')).toBe(false)
    expect(canMeasureLogo(undefined)).toBe(false)
  })

  it('el reintento va a live.metahub.space con el mismo camino; otros sitios no tienen', () => {
    expect(retryUrl('https://images.metahub.space/logo/medium/tt1/img')).toBe('https://live.metahub.space/logo/medium/tt1/img')
    expect(retryUrl('https://images.metahub.space/logo/small/tt1/img')).toBe('https://live.metahub.space/logo/small/tt1/img')
    expect(retryUrl('https://live.metahub.space/logo/medium/tt1/img')).toBeUndefined()
    expect(retryUrl('https://image.tmdb.org/t/p/w500/a.png')).toBeUndefined()
    expect(retryUrl('no es una url')).toBeUndefined()
  })
})

describe('caché de tonos', () => {
  let saved: Record<string, string>
  beforeEach(() => {
    vi.useFakeTimers()
    saved = {}
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => saved[k] ?? null,
      setItem: (k: string, v: string) => {
        saved[k] = v
      },
    })
    resetLogoToneCache()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    resetLogoToneCache()
  })

  it('guarda lo medido en localStorage y lo lee en otra sesión', () => {
    rememberLogoTone('https://images.metahub.space/logo/medium/tt1/img', 'dark', true)
    rememberLogoTone('https://images.metahub.space/logo/medium/tt2/img', 'light', true)
    vi.runAllTimers()
    expect(JSON.parse(saved['sp-logo-tone'])).toEqual({
      'https://images.metahub.space/logo/medium/tt1/img': 'd',
      'https://images.metahub.space/logo/medium/tt2/img': 'l',
    })
    resetLogoToneCache()
    expect(cachedLogoTone('https://images.metahub.space/logo/medium/tt1/img')).toBe('dark')
    expect(cachedLogoTone('https://images.metahub.space/logo/medium/tt2/img')).toBe('light')
    expect(cachedLogoTone('https://images.metahub.space/logo/medium/tt3/img')).toBeUndefined()
  })

  it('el valor seguro por una falla queda solo en memoria', () => {
    rememberLogoTone('https://images.metahub.space/logo/medium/tt1/img', 'dark', false)
    vi.runAllTimers()
    expect(saved['sp-logo-tone']).toBeUndefined()
    expect(cachedLogoTone('https://images.metahub.space/logo/medium/tt1/img')).toBe('dark')
  })

  it(`guarda ${STORAGE_MAX} como mucho (se van los más viejos)`, () => {
    for (let i = 0; i < STORAGE_MAX + 5; i++) rememberLogoTone(`https://images.metahub.space/logo/medium/tt${i}/img`, 'light', true)
    vi.runAllTimers()
    const keys = Object.keys(JSON.parse(saved['sp-logo-tone']))
    expect(keys).toHaveLength(STORAGE_MAX)
    expect(keys[0]).toBe('https://images.metahub.space/logo/medium/tt5/img')
  })

  it('aguanta basura o un localStorage que tira', async () => {
    saved['sp-logo-tone'] = '{roto'
    expect(cachedLogoTone('https://images.metahub.space/logo/medium/tt1/img')).toBeUndefined()
    resetLogoToneCache()
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
    })
    rememberLogoTone('https://images.metahub.space/logo/medium/tt1/img', 'light', true)
    vi.runAllTimers()
    expect(cachedLogoTone('https://images.metahub.space/logo/medium/tt1/img')).toBe('light')
  })

  it('un logo de otro sitio no se mide: va con halo', async () => {
    await expect(measureLogoTone('https://example.com/logo.png')).resolves.toBe('dark')
    await expect(measureLogoTone('https://images.metahub.space/logo/medium/tt9/img'.replace('https', 'http'))).resolves.toBe('dark')
  })
})
