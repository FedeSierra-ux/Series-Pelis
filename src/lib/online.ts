import { useSyncExternalStore } from 'react'

// Estado de la conexión (navigator.onLine + eventos online/offline). Sin red la app muestra lo que
// tiene guardado: la caché de IndexedDB (lib/cache.ts) y el service worker (vite.config.ts).

function subscribe(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

export const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, () => true)
}

/**
 * Mensaje de error amable cuando el problema es la falta de conexión (undefined si hay red).
 * `what` es la frase completa, ej. "esta ficha no está guardada".
 */
export function offlineMessage(what: string): string | undefined {
  return isOnline() ? undefined : `Sin conexión: ${what} en este dispositivo. Probá de nuevo cuando vuelva internet.`
}
