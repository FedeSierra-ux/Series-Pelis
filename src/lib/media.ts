import { useSyncExternalStore } from 'react'
import { REDUCED_MOTION_QUERY } from './mediaQueries'

// `matchMedia` como estado de React: un solo hook para toda la app (las consultas con nombre están en
// `mediaQueries.ts`). Sin `matchMedia` (servidor, tests en node) da `false` y no se suscribe a nada.

/** ¿Se cumple la consulta ahora? Nunca tira: sin `matchMedia` o con una consulta rota da `false`. */
export function matchesNow(query: string): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia(query).matches
  } catch {
    return false
  }
}

/** Avisa cada vez que la consulta cambia (girar el celular, achicar la ventana). Devuelve la limpieza. */
export function subscribeMedia(query: string, onChange: () => void): () => void {
  let mq: MediaQueryList
  try {
    if (typeof matchMedia !== 'function') return () => {}
    mq = matchMedia(query)
  } catch {
    return () => {}
  }
  // Los navegadores de TV viejos solo tienen addListener.
  if (typeof mq.addEventListener !== 'function') {
    mq.addListener(onChange)
    return () => {
      mq.removeListener(onChange)
    }
  }
  mq.addEventListener('change', onChange)
  return () => {
    mq.removeEventListener('change', onChange)
  }
}

/** true mientras la consulta de medios se cumple. En el primer render ya trae el valor real (no parpadea). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => subscribeMedia(query, onChange),
    () => matchesNow(query),
    () => false,
  )
}

/** ¿Pidió reducir el movimiento? Lectura puntual para handlers y efectos (en un componente, `useMediaQuery`). */
export function prefersReducedMotion(): boolean {
  return matchesNow(REDUCED_MOTION_QUERY)
}
