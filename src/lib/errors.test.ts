import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from './cache'
import { addonUrlProblem, errorText, isChunkLoadError } from './errors'

afterEach(() => vi.unstubAllGlobals())

describe('errorText', () => {
  it('sin conexión dice eso primero, salvo que un servidor haya respondido', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(errorText(new TypeError('Failed to fetch'))).toMatch(/^Sin conexión/)
    expect(errorText(new DOMException('aborted', 'AbortError'))).toMatch(/^Sin conexión/)
    expect(errorText(new Error('cualquier cosa'))).toMatch(/^Sin conexión/)
    expect(errorText(new HttpError(404, 'https://x'))).toMatch(/404/)
    vi.stubGlobal('navigator', { onLine: true })
    expect(errorText(new TypeError('Failed to fetch'))).toMatch(/No se pudo conectar/)
  })

  it('traduce los errores de red y de tiempo', () => {
    expect(errorText(new TypeError('Failed to fetch'))).toMatch(/No se pudo conectar/)
    expect(errorText(new TypeError('NetworkError when attempting to fetch resource.'))).toMatch(/No se pudo conectar/)
    expect(errorText(new DOMException('signal is aborted without reason', 'AbortError'))).toMatch(/Tardó demasiado/)
  })

  it('explica los códigos HTTP sin mostrar la URL', () => {
    expect(errorText(new HttpError(404, 'https://x/manifest.json'))).toBe('No se encontró (el servidor respondió 404).')
    expect(errorText(new HttpError(503, 'https://x'))).toMatch(/problema ahora/)
    expect(errorText(new HttpError(403, 'https://x'))).toMatch(/rechazó/)
    expect(errorText(new HttpError(429, 'https://x'))).toMatch(/Demasiados/)
    expect(errorText(new HttpError(418, 'https://x'))).not.toMatch(/https/)
  })

  it('JSON roto y mensajes propios', () => {
    expect(errorText(new SyntaxError('Unexpected token < in JSON at position 0'))).toMatch(/formato/)
    expect(errorText(new Error('La URL no devolvió un manifest de addon válido'))).toBe('La URL no devolvió un manifest de addon válido')
    expect(errorText('algo')).toBe('algo')
  })
})

describe('addonUrlProblem', () => {
  it('acepta direcciones reales (dominio, localhost, IP) y rechaza lo que no es una URL', () => {
    expect(addonUrlProblem('https://torrentio.strem.fun/manifest.json')).toBeUndefined()
    expect(addonUrlProblem('http://localhost:11470/manifest.json')).toBeUndefined()
    expect(addonUrlProblem('http://192.168.0.10:7000/manifest.json')).toBeUndefined()
    // Lo que deja `normalizeManifestUrl` cuando se pega "hola" o "torrentio".
    expect(addonUrlProblem('https://hola/manifest.json')).toMatch(/La URL no es válida/)
    expect(addonUrlProblem('https://torrentio/manifest.json')).toMatch(/pegá la dirección del manifest/)
    expect(addonUrlProblem('ftp://x.com/manifest.json')).toMatch(/La URL no es válida/)
    expect(addonUrlProblem('https://')).toMatch(/La URL no es válida/)
  })
})

describe('isChunkLoadError', () => {
  it('reconoce los errores de los navegadores al bajar una parte de la app', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Player-abc.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x/a.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'x')"))).toBe(false)
  })
})
