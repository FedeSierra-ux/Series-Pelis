import { describe, expect, it } from 'vitest'
import { isSpainTrailer, pickTrailer, type TmdbVideo } from './tmdb'

const v = (key: string, o: Partial<TmdbVideo>): TmdbVideo => ({ key, site: 'YouTube', type: 'Trailer', ...o })

describe('tráiler (v0.24: latino primero)', () => {
  const en = v('en', { iso_639_1: 'en', iso_3166_1: 'US', name: 'Official Trailer', official: true })
  const esDub = v('esdub', { iso_639_1: 'es', iso_3166_1: 'MX', name: 'Tráiler doblado' })
  const esSub = v('essub', { iso_639_1: 'es', iso_3166_1: 'MX', name: 'Tráiler subtitulado' })
  const spDub = v('spdub', { iso_639_1: 'es', iso_3166_1: 'ES', name: 'Tráiler oficial en español', official: true })
  const spSub = v('spsub', { iso_639_1: 'es', iso_3166_1: 'ES', name: 'Tráiler VOSE' })

  it('peli en otro idioma: subtitulado latino > latino doblado > España subtitulado > original > España doblado', () => {
    const all = [spDub, en, spSub, esDub, esSub]
    expect(pickTrailer(all, 'en')?.key).toBe('essub')
    expect(pickTrailer([spDub, en, spSub, esDub], 'en')?.key).toBe('esdub')
    expect(pickTrailer([spDub, en, spSub], 'en')?.key).toBe('spsub')
    expect(pickTrailer([spDub, en], 'en')?.key).toBe('en')
    expect(pickTrailer([spDub], 'en')?.key).toBe('spdub')
  })

  it('peli de habla hispana: el tráiler en español (audio original), latino primero', () => {
    const ar = v('ar', { iso_639_1: 'es', iso_3166_1: 'AR', name: 'Tráiler oficial' })
    const sp = v('sp', { iso_639_1: 'es', iso_3166_1: 'ES', name: 'Tráiler oficial', official: true })
    expect(pickTrailer([en, sp, ar], 'es')?.key).toBe('ar')
    expect(pickTrailer([en, sp], 'es')?.key).toBe('sp')
  })

  it('a igual idioma, tráiler antes que avance y oficial antes', () => {
    const teaser = v('teaser', { iso_639_1: 'es', iso_3166_1: 'MX', name: 'Avance subtitulado', type: 'Teaser', official: true })
    expect(pickTrailer([teaser, esSub], 'en')?.key).toBe('essub')
    expect(pickTrailer([v('x', { site: 'Vimeo' }), v('y', { type: 'Clip' })])).toBeUndefined()
    expect(pickTrailer(undefined)).toBeUndefined()
  })

  it('España por país o por nombre; "latino" en el nombre gana', () => {
    expect(isSpainTrailer({ iso_3166_1: 'ES', name: 'Tráiler' })).toBe(true)
    expect(isSpainTrailer({ iso_3166_1: 'MX', name: 'Tráiler en castellano' })).toBe(true)
    expect(isSpainTrailer({ iso_3166_1: 'ES', name: 'Tráiler doblaje latino' })).toBe(false)
    expect(isSpainTrailer({ name: 'Tráiler' })).toBe(false)
  })
})
