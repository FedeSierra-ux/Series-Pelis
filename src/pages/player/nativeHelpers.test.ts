import { describe, expect, it } from 'vitest'
import { embeddedSubOption, nativeStartAt, nativeSubList, nativeSubtitleStyle, shouldSaveProgress, withEmbedded } from './nativeHelpers'
import type { SubOption } from '../../lib/subtitlePrefs'

const name = (c?: string) => ({ spa: 'Español', eng: 'Inglés', spl: 'Español' })[c ?? ''] ?? (c ?? '')

describe('nativeStartAt', () => {
  it('la posición del cambio de fuente gana; 0 es "sin posición"', () => {
    expect(nativeStartAt({ at: 250 }, { position: 900, duration: 3000, watched: false })).toBe(250)
    expect(nativeStartAt({ at: 0 }, { position: 900, duration: 3000, watched: false })).toBe(900)
  })
  it('"Ver desde el principio" arranca en 0 aunque haya progreso', () => {
    expect(nativeStartAt({ at: 0, fromStart: true }, { position: 900, duration: 3000, watched: false })).toBe(0)
    expect(nativeStartAt({ at: 0, fromStart: true }, undefined)).toBe(0)
  })
  it('como la web: ni lo visto, ni los primeros segundos, ni el final', () => {
    expect(nativeStartAt(undefined, { position: 900, duration: 3000, watched: true })).toBe(0)
    expect(nativeStartAt(undefined, { position: 20, duration: 3000, watched: false })).toBe(0)
    expect(nativeStartAt(undefined, { position: 2985, duration: 3000, watched: false })).toBe(0)
    expect(nativeStartAt(undefined, undefined)).toBe(0)
  })
})

describe('shouldSaveProgress', () => {
  it('mismos mínimos que la web', () => {
    expect(shouldSaveProgress(30, 100, false)).toBe(false)
    expect(shouldSaveProgress(30, 100, true)).toBe(true)
    expect(shouldSaveProgress(3, 3000, false)).toBe(false)
    expect(shouldSaveProgress(30, NaN, true)).toBe(false)
  })
})

describe('subtítulos', () => {
  it('las pistas del video se reemplazan y las externas quedan', () => {
    const ext: SubOption = { url: 'https://x/a.srt', lang: 'spa' }
    const first = withEmbedded([ext], [{ id: 'emb:0:0', label: 'English', lang: 'en' }])
    expect(first.map((s) => s.url)).toEqual(['https://x/a.srt', 'emb:0:0'])
    const second = withEmbedded(first, [{ id: 'emb:1:0', label: 'Forced', lang: 'es' }])
    expect(second.map((s) => s.url)).toEqual(['https://x/a.srt', 'emb:1:0'])
    expect(second[1].forced).toBe(true)
    expect(embeddedSubOption({ id: 'emb:2:0', label: 'English SDH', lang: 'en' }).sdh).toBe(true)
  })

  it('la lista para Android: solo externas, preferidas primero, numeradas y sin SDH si se ocultan', () => {
    const subs: SubOption[] = [
      { url: 'https://x/en.srt', lang: 'eng' },
      { url: 'https://x/es1.srt', lang: 'spa' },
      { url: 'https://x/es2.srt', lang: 'spl', latino: true },
      { url: 'https://x/sdh.srt', lang: 'spa', sdh: true },
      { url: 'emb:0:0', lang: 'en', label: 'English' },
      { url: 'hls:0', lang: 'en', hls: 0 },
    ]
    const list = nativeSubList(subs, { hideSdh: true, langs: ['spa'], active: '' }, name)
    expect(list.map((o) => o.id)).toEqual(['https://x/es1.srt', 'https://x/es2.srt', 'https://x/en.srt'])
    expect(list[0].label).toBe('Español · Opción 1')
    expect(list[1].latino).toBe(true)
    // El activo se muestra aunque sea SDH.
    expect(nativeSubList(subs, { hideSdh: true, langs: ['spa'], active: 'https://x/sdh.srt' }, name)).toHaveLength(4)
  })

  it('el estilo va sin la fuente', () => {
    expect(nativeSubtitleStyle({ size: 'l', color: 'yellow', background: 'none', outline: true, font: 'serif', position: 10 })).toEqual({
      size: 'l',
      color: 'yellow',
      background: 'none',
      outline: true,
      position: 10,
    })
  })
})
