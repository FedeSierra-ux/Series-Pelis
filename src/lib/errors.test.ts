import { describe, expect, it } from 'vitest'
import { HttpError } from './cache'
import { errorText } from './errors'

describe('errorText', () => {
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
