import { useMediaQuery } from '../../lib/media'
import { COMPACT_BAR_QUERY } from '../../lib/mediaQueries'

// Barra de controles del reproductor: etiqueta de cada botón y la barra compacta del celular.

/** aria-label + etiqueta visible al pasar el mouse o enfocar el botón (la dibuja el CSS con `data-tip`). */
export function tip(label: string) {
  return { 'aria-label': label, 'data-tip': label }
}

/**
 * ¿El subtítulo sube por arriba de lo que hay en la esquina ("Saltar", siguiente episodio…) cuando se ven los
 * controles? En el celular vertical (pantalla angosta, como desde la v0.26.1) y en el apaisado. En la TV
 * nunca por el apaisado (algunas teles chicas podrían declarar `pointer: coarse` con poco alto): PC y TV
 * quedan como estaban.
 */
export function liftsSubForCorner({ narrow, phoneLandscape, tv }: { narrow: boolean; phoneLandscape: boolean; tv: boolean }): boolean {
  return narrow || (phoneLandscape && !tv)
}

/** Lo que se oculta a los 3,5 s: la cabecera, la barra y los menús. */
export const BAR_SELECTOR = '.player-top, .player-controls, .player-menu'

/**
 * a11y-01: con el foco adentro de la cabecera, la barra o un menú, los controles no se ocultan (un anillo de foco
 * sobre una barra transparente no se ve). `viaMouse`: el último foco lo puso un clic o un toque (no Tab ni las
 * flechas): ahí se oculta igual, como siempre. En la TV tampoco: ahí el foco siempre está en algún botón y el OK
 * con los controles ocultos tiene que pausar. (No sirve `:focus-visible`: Chromium lo prende al apretar cualquier
 * tecla con el botón enfocado, aunque el foco lo haya puesto un clic.)
 */
export function keyboardFocusInBar(viaMouse: boolean): boolean {
  if (viaMouse || document.documentElement.hasAttribute('data-tv')) return false
  const active = document.activeElement
  return !!active && active !== document.body && !!active.closest(BAR_SELECTOR)
}

/** true mientras la barra va compacta (cambia al girar el celular). */
export function useCompactBar(): boolean {
  return useMediaQuery(COMPACT_BAR_QUERY)
}
