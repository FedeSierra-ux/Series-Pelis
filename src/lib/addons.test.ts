import { describe, expect, it } from 'vitest'
import { normalizeManifestUrl } from './addons'

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
