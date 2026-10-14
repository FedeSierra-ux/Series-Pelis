import { describe, expect, it } from 'vitest'
import html from '../../index.html?raw'
import headers from '../../public/_headers?raw'

// La CSP de public/_headers permite el único <script> inline de index.html (el que marca el tema antes
// de pintar) por su hash. Si alguien toca ese script sin recalcular el hash, la CSP lo bloquea en
// producción y el Tema 2 parpadea: este test avisa antes.

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
}

describe('cabeceras de seguridad', () => {
  it('la CSP incluye el hash del único script inline (el del tema)', async () => {
    const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    expect(inline).toHaveLength(1)
    expect(headers).toContain(`'sha256-${await sha256(inline[0])}'`)
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
