import { describe, expect, it } from 'vitest'
import { cleanStream, CINEMETA_ADDON, normalizeManifestUrl, resourceUrl, searchTerm } from './addons'

describe('normalizeManifestUrl', () => {
  it('deja igual una URL completa', () => {
    expect(normalizeManifestUrl('https://addon.example/abc/manifest.json')).toBe('https://addon.example/abc/manifest.json')
  })

  it('agrega https:// y /manifest.json', () => {
    expect(normalizeManifestUrl('addon.example/abc')).toBe('https://addon.example/abc/manifest.json')
    expect(normalizeManifestUrl('https://addon.example/abc/')).toBe('https://addon.example/abc/manifest.json')
  })

  it('pasa stremio:// a https:// (sin importar mayúsculas)', () => {
    expect(normalizeManifestUrl('stremio://addon.example/manifest.json')).toBe('https://addon.example/manifest.json')
    expect(normalizeManifestUrl('Stremio://addon.example/x/manifest.json')).toBe('https://addon.example/x/manifest.json')
  })

  it('saca espacios y saltos de línea pegados', () => {
    expect(normalizeManifestUrl('  https://addon.example/ab c\n/manifest.json ')).toBe('https://addon.example/abc/manifest.json')
  })

  it('cambia la página de configuración por el manifest', () => {
    expect(normalizeManifestUrl('https://addon.example/cfg123/configure')).toBe('https://addon.example/cfg123/manifest.json')
    expect(normalizeManifestUrl('https://addon.example/configure/')).toBe('https://addon.example/manifest.json')
    expect(normalizeManifestUrl('https://addon.example/cfg/configure?x=1#top')).toBe('https://addon.example/cfg/manifest.json')
  })

  it('respeta la query del manifest', () => {
    expect(normalizeManifestUrl('https://addon.example/manifest.json?token=1')).toBe('https://addon.example/manifest.json?token=1')
  })
})

describe('cleanStream: enlaces externos (code-06)', () => {
  it('externalUrl solo con http(s): javascript:, data: e intent: se descartan', () => {
    expect(cleanStream({ externalUrl: 'https://ejemplo.com/ver?x=1' })?.externalUrl).toBe('https://ejemplo.com/ver?x=1')
    expect(cleanStream({ externalUrl: 'HTTP://ejemplo.com/ver' })?.externalUrl).toBe('HTTP://ejemplo.com/ver')
    // Sin nada reproducible, el stream entero se va.
    expect(cleanStream({ externalUrl: 'javascript:alert(1)' })).toBeUndefined()
    expect(cleanStream({ externalUrl: 'data:text/html,<h1>hola</h1>' })).toBeUndefined()
    expect(cleanStream({ externalUrl: 'intent://x#Intent;end' })).toBeUndefined()
    expect(cleanStream({ externalUrl: 'https://ejemplo.com/con espacio' })).toBeUndefined()
    // Con url propia el stream queda, pero sin el enlace sucio.
    expect(cleanStream({ url: 'https://cdn.example/a.mp4', externalUrl: 'javascript:1' })).toEqual({ url: 'https://cdn.example/a.mp4' })
  })

  it('ytId solo con pinta de id de YouTube', () => {
    expect(cleanStream({ ytId: 'dQw4w9WgXcQ' })?.ytId).toBe('dQw4w9WgXcQ')
    expect(cleanStream({ ytId: 'abc&list=PL123' })).toBeUndefined()
    expect(cleanStream({ ytId: 'a/b' })).toBeUndefined()
    expect(cleanStream({ url: 'https://cdn.example/a.mp4', ytId: 'x y' })).toEqual({ url: 'https://cdn.example/a.mp4' })
  })
})

describe('normalizeManifestUrl: barra final (auditoría de uso #5)', () => {
  it('no arma …/manifest.json/manifest.json', () => {
    expect(normalizeManifestUrl('https://opensubtitles-v3.strem.io/manifest.json/')).toBe('https://opensubtitles-v3.strem.io/manifest.json')
    expect(normalizeManifestUrl('https://addon.example/cfg/manifest.json//')).toBe('https://addon.example/cfg/manifest.json')
    expect(normalizeManifestUrl('https://addon.example/manifest.json/?token=1')).toBe('https://addon.example/manifest.json?token=1')
  })

  it('una URL sin manifest pero con query lo agrega antes de la query', () => {
    expect(normalizeManifestUrl('https://addon.example/cfg/?token=1')).toBe('https://addon.example/cfg/manifest.json?token=1')
  })
})

describe('búsqueda con barras (uso-03)', () => {
  it('searchTerm cambia las barras por espacios y junta los espacios', () => {
    expect(searchTerm('Face/Off')).toBe('Face Off')
    expect(searchTerm('AC/DC')).toBe('AC DC')
    expect(searchTerm('a\\b // c')).toBe('a b c')
    expect(searchTerm('  /  ')).toBe('')
    expect(searchTerm('100% what? #1 a&b')).toBe('100% what? #1 a&b')
  })

  it('la URL de búsqueda no lleva %2F ni %5C, y lo demás se codifica igual', () => {
    const url = resourceUrl(CINEMETA_ADDON, 'catalog', 'movie', 'top', { search: 'face/off' })
    expect(url).toMatch(/\/catalog\/movie\/top\/search=face%20off\.json$/)
    expect(resourceUrl(CINEMETA_ADDON, 'catalog', 'movie', 'top', { search: 'a&b?' })).toMatch(/search=a%26b%3F\.json$/)
    // Otros extras no se tocan.
    expect(resourceUrl(CINEMETA_ADDON, 'catalog', 'movie', 'top', { genre: 'Sci/Fi', skip: '20' })).toContain('genre=Sci%2FFi&skip=20')
  })
})
