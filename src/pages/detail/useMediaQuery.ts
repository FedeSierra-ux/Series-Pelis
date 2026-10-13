import { useSyncExternalStore } from 'react'

/** ¿Se cumple la media query ahora? Se actualiza al girar el celular o achicar la ventana. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof matchMedia !== 'function') return () => {}
      const mq = matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => typeof matchMedia === 'function' && matchMedia(query).matches,
    () => false,
  )
}

/** Celular: la ficha pone las fuentes debajo del episodio elegido en vez de a la derecha. */
export const NARROW_QUERY = '(max-width: 760px)'
