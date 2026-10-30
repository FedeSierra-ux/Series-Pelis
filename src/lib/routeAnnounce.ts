// Aviso de cambio de pantalla para lectores de pantalla (a11y-04, WCAG 4.1.3 y 2.4.3). En una SPA el navegador no
// anuncia nada al navegar: cambia `document.title` (useTitle) pero el foco se queda en el enlace del riel. La parte
// pura vive acá (con test); lo que toca el DOM, en components/RouteAnnouncer.tsx.

/** Cuánto tiene que quedar quieto el título antes de anunciarlo (las fichas lo ponen recién al cargar el nombre). */
export const ANNOUNCE_SETTLE_MS = 400
/** Tope de espera: si el título sigue cambiando, se anuncia el que haya. */
export const ANNOUNCE_MAX_MS = 2000
/** El aviso se borra pasado esto, para que no quede como texto suelto al recorrer la página con el cursor virtual. */
export const ANNOUNCE_CLEAR_MS = 4000

const SUFFIX = ' · Flix'

/** Lo que se dice: el título sin " · Flix"; el de Inicio es solo "Flix" y se dice "Inicio". */
export function announcementText(title: string, pathname: string): string {
  const clean = title.endsWith(SUFFIX) ? title.slice(0, -SUFFIX.length) : title
  if (clean === 'Flix' || clean === '') return pathname === '/' ? 'Inicio' : 'Flix'
  return clean
}

/**
 * ¿Hay que anunciar? Solo si cambió la ruta (una búsqueda que actualiza "?q=" no cuenta) y no es el
 * reproductor, que tiene sus propios avisos y suena encima.
 */
export function shouldAnnounce(before: string, after: string): boolean {
  return before !== after && !after.startsWith('/watch')
}

/** Cuánto falta esperar para anunciar (0 = ya): el título quieto `ANNOUNCE_SETTLE_MS`, o el tope. Puro. */
export function settleWait(o: { now: number; lastChange: number; start: number }): number {
  if (o.now - o.start >= ANNOUNCE_MAX_MS) return 0
  return Math.max(0, ANNOUNCE_SETTLE_MS - (o.now - o.lastChange))
}

export type FocusSpot = 'body' | 'nav' | 'other'

/**
 * ¿Se lleva el foco al título de la pantalla nueva? Solo al entrar (PUSH), fuera de la TV (ahí el foco ya se
 * maneja solo: `focusInitialWhenReady`) y si el foco no estaba en otro lado de la página: en el vacío (el enlace en el
 * que se hizo clic ya no existe) o en el riel/barra, donde quedó el que eligió la pantalla. Un campo que tomó el
 * foco solo (la búsqueda) o lo que el usuario ya tocó no se pisa.
 */
export function shouldMoveFocus(o: { tv: boolean; navType: string; spot: FocusSpot }): boolean {
  return !o.tv && o.navType === 'PUSH' && o.spot !== 'other'
}
