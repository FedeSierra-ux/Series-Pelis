import { describe, expect, it } from 'vitest'
import { detailNames, logoCaption, sameTitle, titleKey } from './detailNames'

const hisHers = { title: 'Ella y yo', original_title: 'His & Hers', original_language: 'en' }

describe('nombre de la ficha (v0.28)', () => {
  it('el del mapa primero, después el de la ficha de TMDB, después Cinemeta', () => {
    expect(detailNames({ local: 'Ella y yo', tmdb: { title: 'Otro', original_title: 'His & Hers' }, cinemeta: 'His & Hers' }).name).toBe('Ella y yo')
    expect(detailNames({ tmdb: hisHers, cinemeta: 'His & Hers' }).name).toBe('Ella y yo')
    expect(detailNames({ cinemeta: 'His & Hers' })).toEqual({ name: 'His & Hers' })
  })

  it('un nombre de TMDB en otro alfabeto no sirve: va Cinemeta', () => {
    const spirited = { title: '千と千尋の神隠し', original_title: '千と千尋の神隠し', original_language: 'ja' }
    expect(detailNames({ tmdb: spirited, cinemeta: 'Spirited Away' })).toEqual({ name: 'Spirited Away', original: '千と千尋の神隠し', originalLang: 'ja' })
  })

  it('"Título original" solo si se lee distinto', () => {
    expect(detailNames({ tmdb: hisHers, cinemeta: 'His & Hers' })).toEqual({ name: 'Ella y yo', original: 'His & Hers', originalLang: 'en' })
    const secreto = { title: 'El secreto de sus ojos', original_title: 'El secreto de sus ojos', original_language: 'es' }
    expect(detailNames({ tmdb: secreto, cinemeta: 'The Secret in Their Eyes' }).original).toBeUndefined()
    // Sin la ficha de TMDB, el original del mapa (sin idioma).
    expect(detailNames({ local: 'Ella y yo', storedOriginal: 'His & Hers', cinemeta: 'His & Hers' })).toEqual({ name: 'Ella y yo', original: 'His & Hers' })
  })

  it('compara sin tildes, signos ni artículo inicial', () => {
    expect(sameTitle('The Matrix', 'Matrix')).toBe(true)
    expect(sameTitle('Amélie', 'amelie')).toBe(true)
    expect(sameTitle('Spider-Man: No Way Home', 'Spider Man No Way Home')).toBe(true)
    expect(sameTitle('Ella y yo', 'His & Hers')).toBe(false)
    expect(titleKey('진격의 거인')).toBe('진격의 거인')
    expect(sameTitle('かぐや', 'がぐや')).toBe(false)
  })
})

describe('debajo del logo', () => {
  it('el nombre en español si el logo dice otra cosa', () => {
    const names = detailNames({ tmdb: hisHers, cinemeta: 'His & Hers' })
    expect(logoCaption(names, 'His & Hers', 'en')).toEqual({ name: 'Ella y yo' })
  })

  it('nada si el nombre es el mismo', () => {
    const names = detailNames({ tmdb: { title: 'Dune', original_title: 'Dune' }, cinemeta: 'Dune' })
    expect(logoCaption(names, 'Dune', 'en')).toEqual({})
  })

  it('una peli argentina con el logo en inglés: el nombre en español igual', () => {
    const names = detailNames({ tmdb: { title: 'Relatos salvajes', original_title: 'Relatos salvajes' }, cinemeta: 'Wild Tales' })
    expect(logoCaption(names, 'Wild Tales', 'en')).toEqual({ name: 'Relatos salvajes' })
  })

  it('con el logo en español: "Título original" en lugar del nombre', () => {
    const names = detailNames({ tmdb: hisHers, cinemeta: 'His & Hers' })
    expect(logoCaption(names, 'His & Hers', 'es')).toEqual({ original: 'His & Hers' })
    expect(logoCaption(detailNames({ tmdb: { title: 'Nueve reinas', original_title: 'Nueve reinas' } }), undefined, 'es')).toEqual({})
  })
})
