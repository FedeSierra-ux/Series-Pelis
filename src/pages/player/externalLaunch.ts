import type { Os } from '../../lib/platform'

// Cómo abrir un esquema propio (vlc://, mpv://, intent://) sin que lo bloquee la CSP ni saque al usuario
// de la app. Lógica pura: se prueba junto con la CSP en lib/securityHeaders.test.ts.
//
// - Android / iOS: `location.href` (el sistema ofrece la app o la tienda).
// - Firefox de escritorio: un iframe oculto. Con un <a> o `location.href`, si el esquema no está
//   registrado Firefox reemplaza la app por su página de error. La CSP (`frame-src` en public/_headers)
//   tiene que permitir esos esquemas.
// - El resto (Chrome, Edge, Safari): un clic en un <a> temporal dentro del mismo gesto. No pasa por
//   `frame-src`; sin un esquema registrado el navegador simplemente no hace nada.

export type LaunchMethod = 'location' | 'anchor' | 'iframe'

export function launchMethod(os: Os, userAgent: string): LaunchMethod {
  if (os === 'android' || os === 'ios') return 'location'
  return /firefox\//i.test(userAgent) && !/seamonkey/i.test(userAgent) ? 'iframe' : 'anchor'
}

/** Esquema de un enlace ("vlc:" para "vlc://…"), como lo escribe la CSP. */
export function schemeOf(href: string): string | undefined {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(href)
  return m ? `${m[1].toLowerCase()}:` : undefined
}

/** Abre el enlace con el método que corresponde al navegador. */
export function launchUrl(href: string, os: Os, userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  const method = launchMethod(os, userAgent)
  if (method === 'location') {
    window.location.href = href
    return
  }
  if (method === 'iframe') {
    const frame = document.createElement('iframe')
    frame.style.display = 'none'
    frame.src = href
    document.body.appendChild(frame)
    setTimeout(() => frame.remove(), 3000)
    return
  }
  const a = document.createElement('a')
  a.href = href
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
