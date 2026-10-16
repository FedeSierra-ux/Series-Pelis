import { describe, expect, it } from 'vitest'
import { parseLaunchPath } from './nativeLaunch'

describe('parseLaunchPath', () => {
  it('abre una ficha y reproduce directo con play=1', () => {
    expect(parseLaunchPath('/detail/movie/tt0133093?play=1')).toEqual({
      path: '/detail/movie/tt0133093',
      play: { type: 'movie', metaId: 'tt0133093', videoId: 'tt0133093' },
    })
    expect(parseLaunchPath('/detail/series/tt0903747?season=2&video=tt0903747%3A2%3A3&play=1')).toEqual({
      path: '/detail/series/tt0903747?season=2&video=tt0903747%3A2%3A3',
      play: { type: 'series', metaId: 'tt0903747', videoId: 'tt0903747:2:3' },
    })
  })

  it('sin play solo navega', () => {
    expect(parseLaunchPath('/detail/series/tt0903747')).toEqual({ path: '/detail/series/tt0903747' })
    expect(parseLaunchPath('/list')).toEqual({ path: '/list' })
  })

  it('no reproduce un episodio de otra serie', () => {
    expect(parseLaunchPath('/detail/series/tt1?video=tt2%3A1%3A1&play=1')).toEqual({ path: '/detail/series/tt1?video=tt2%3A1%3A1' })
  })

  it('rechaza lo que no es una ficha o Mi lista', () => {
    for (const bad of [
      undefined,
      '',
      'detail/movie/tt1',
      '//evil.com/detail/movie/tt1',
      '/settings',
      '/watch/movie/tt1',
      '/detail/movie/tt1/extra',
      '/detail/other/tt1',
      '/detail/movie/tt1#x',
      '/detail/movie/<script>',
      `/detail/movie/${'a'.repeat(600)}`,
    ]) {
      expect(parseLaunchPath(bad)).toBeUndefined()
    }
  })
})
