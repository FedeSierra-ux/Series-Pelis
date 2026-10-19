import { useEffect, useState } from 'react'

// Barra de controles del reproductor: etiqueta de cada botón y la barra compacta del celular.

/** aria-label + etiqueta visible al pasar el mouse o enfocar el botón (la dibuja el CSS con `data-tip`). */
export function tip(label: string) {
  return { 'aria-label': label, 'data-tip': label }
}

/**
 * Celular vertical: una sola fila de íconos y "Abrir en…", ventana flotante y Ajustar pasan al ⚙.
 * Es la misma consulta que el `@media` de `player-v14.css` (los botones los esconde el CSS).
 */
export const COMPACT_BAR_QUERY = '(max-width: 760px) and (pointer: coarse)'

/** Pantalla angosta (celular vertical): el subtítulo sube por arriba de "Saltar intro" con los controles. */
export const NARROW_QUERY = '(max-width: 760px)'

/**
 * Celular apaisado: más de 760 px de ancho pero pantalla táctil y poco alto (el mismo corte de 500 px que usa
 * `player-v14.css` para la barra en dos renglones). Ahí el subtítulo también sube por arriba de la esquina.
 */
export const PHONE_LANDSCAPE_QUERY = '(pointer: coarse) and (max-height: 500px)'

/**
 * ¿El subtítulo sube por arriba de lo que hay en la esquina ("Saltar", siguiente episodio…) cuando se ven los
 * controles? En el celular vertical (pantalla angosta, como desde la v0.26.1) y en el apaisado. En la TV
 * nunca por el apaisado (algunas teles chicas podrían declarar `pointer: coarse` con poco alto): PC y TV
 * quedan como estaban.
 */
export function liftsSubForCorner({ narrow, phoneLandscape, tv }: { narrow: boolean; phoneLandscape: boolean; tv: boolean }): boolean {
  return narrow || (phoneLandscape && !tv)
}

function matchesNow(query: string) {
  try {
    return matchMedia(query).matches
  } catch {
    return false
  }
}

/** true mientras la consulta de medios se cumple (cambia al girar el celular o al achicar la ventana). */
export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => matchesNow(query))
  useEffect(() => {
    let mq: MediaQueryList
    try {
      mq = matchMedia(query)
    } catch {
      return
    }
    const update = () => {
      setMatch(mq.matches)
    }
    update()
    // Los navegadores de TV viejos solo tienen addListener.
    if (typeof mq.addEventListener !== 'function') {
      mq.addListener(update)
      return () => {
        mq.removeListener(update)
      }
    }
    mq.addEventListener('change', update)
    return () => {
      mq.removeEventListener('change', update)
    }
  }, [query])
  return match
}

/** true mientras la barra va compacta (cambia al girar el celular). */
export function useCompactBar(): boolean {
  return useMediaQuery(COMPACT_BAR_QUERY)
}
