import { describe, expect, it } from 'vitest'
import html from '../../index.html?raw'
import headers from '../../public/_headers?raw'
import { launchMethod, schemeOf } from '../pages/player/externalLaunch'
import { EXTERNAL_PLAYERS, externalLaunch } from './externalPlayers'
import type { Os } from './platform'

const cspOf = (text: string) => (text.split(/^\/\*\n/m)[1] ?? '').match(/Content-Security-Policy: (.*)/)![1]
const directive = (csp: string, name: string) =>
  (csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? '').split(/\s+/).slice(1)

// La CSP de public/_headers no permite scripts inline (desde la v0.11 el tema va fijo en index.html).
// Si alguien agrega uno, la CSP lo bloquea en producción: este test avisa antes.

describe('cabeceras de seguridad', () => {
  it('index.html no tiene scripts ni manejadores inline (la CSP los bloquearía)', () => {
    const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    expect(inline).toHaveLength(0)
    expect(html).not.toMatch(/\son[a-z]+=/i)
  })

  it('tiene las cabeceras básicas para /*', () => {
    const block = headers.split(/^\/\*\n/m)[1] ?? ''
    for (const h of [
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'X-Frame-Options: DENY',
      'Permissions-Policy:',
      'Content-Security-Policy:',
    ]) {
      expect(block).toContain(h)
    }
    const csp = block.match(/Content-Security-Policy: (.*)/)![1]
    expect(csp).toContain("object-src 'none'")
    expect(directive(csp, 'frame-src')).toEqual(expect.arrayContaining(['https://www.youtube.com', 'https://www.youtube-nocookie.com']))
    expect(csp).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/)
  })

  // Auditoría de código #1: con la CSP de la v0.10, "Abrir en VLC" en la PC no hacía nada (el iframe oculto
  // con vlc://… quedaba bloqueado por frame-src). Firefox sigue usando el iframe: cada esquema de escritorio
  // tiene que estar permitido.
  it('frame-src permite los esquemas de los reproductores externos que se abren con iframe', () => {
    const frameSrc = directive(cspOf(headers), 'frame-src')
    const desktop: Os[] = ['windows', 'mac', 'linux']
    const firefox = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'
    for (const os of desktop) {
      expect(launchMethod(os, firefox)).toBe('iframe')
      for (const p of EXTERNAL_PLAYERS.filter((x) => x.os.includes(os))) {
        const href = externalLaunch(p.id, 'https://ejemplo.com/video.mp4', os).href
        if (!href) continue
        expect(frameSrc, `${p.label} en ${os}`).toContain(schemeOf(href))
      }
    }
  })

  it('en Chrome de escritorio se abre con un enlace y en Android/iOS con location (sin iframe)', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
    expect(launchMethod('windows', chrome)).toBe('anchor')
    expect(launchMethod('mac', chrome)).toBe('anchor')
    expect(launchMethod('android', chrome)).toBe('location')
    expect(launchMethod('ios', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('location')
  })

  it('schemeOf saca el esquema como lo escribe la CSP', () => {
    expect(schemeOf('vlc://https://a.com/b.mp4')).toBe('vlc:')
    expect(schemeOf('iina://weblink?url=x')).toBe('iina:')
    expect(schemeOf('sin esquema')).toBeUndefined()
  })
})
