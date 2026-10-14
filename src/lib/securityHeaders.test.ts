import { describe, expect, it } from 'vitest'
import html from '../../index.html?raw'
import headers from '../../public/_headers?raw'

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
    expect(csp).toContain('frame-src https://www.youtube.com https://www.youtube-nocookie.com')
    expect(csp).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline/)
  })
})
