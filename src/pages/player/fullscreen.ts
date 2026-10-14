import { useEffect } from 'react'

// Pantalla completa y orientación del reproductor.
//
// La pantalla completa se pide sobre <html> y no sobre el <div> del reproductor: al pasar al siguiente
// episodio (o al cambiar de fuente) el reproductor se vuelve a montar, y si la pantalla completa era de
// su <div> el navegador la cerraba sola. El reproductor tapa todo (position: fixed), así que se ve igual.
// Al salir del reproductor se cierra si la abrió él.
//
// En el celular (U34), al empezar a reproducir se pide pantalla completa y horizontal. No todos los
// navegadores lo permiten (iPhone no tiene ninguna de las dos para una página): todo va con try/catch.

/** Reproductores montados ahora (al pasar de episodio hay un instante con 0 y otro con 2). */
let mounted = 0
/** La pantalla completa la pidió el reproductor (si la pidió el usuario con F11, no se toca). */
let owned = false
/** Se trabó la orientación: hay que soltarla al salir. */
let orientationLocked = false

type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void }

function orientation(): LockableOrientation | undefined {
  try {
    return typeof screen === 'undefined' ? undefined : (screen.orientation as LockableOrientation | undefined)
  } catch {
    return undefined
  }
}

export const isFullscreen = () => typeof document !== 'undefined' && !!document.fullscreenElement

export async function enterFullscreen(): Promise<boolean> {
  if (isFullscreen()) return true
  const el = document.documentElement
  if (typeof el.requestFullscreen !== 'function') return false
  try {
    await el.requestFullscreen({ navigationUI: 'hide' })
    owned = true
    return true
  } catch {
    return false
  }
}

export async function exitFullscreen() {
  unlockOrientation()
  owned = false
  if (!isFullscreen()) return
  try {
    await document.exitFullscreen()
  } catch {
    // ya había salido
  }
}

export function toggleFullscreen() {
  if (isFullscreen()) exitFullscreen()
  else enterFullscreen()
}

/** Horizontal (solo funciona en pantalla completa, y no en todos los navegadores). */
export async function lockLandscape(): Promise<boolean> {
  const o = orientation()
  if (!o || typeof o.lock !== 'function') return false
  try {
    await o.lock('landscape')
    orientationLocked = true
    return true
  } catch {
    return false
  }
}

export function unlockOrientation() {
  if (!orientationLocked) return
  orientationLocked = false
  try {
    orientation()?.unlock?.()
  } catch {
    // nada
  }
}

/**
 * ¿Es un celular? Pantalla táctil sin mouse y el lado corto de la pantalla chico (una tablet no:
 * ahí se ve bien en vertical). La TV no entra porque no es táctil.
 */
export function isPhoneLike(): boolean {
  try {
    const coarse = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches
    return coarse && Math.min(screen.width, screen.height) <= 540
  } catch {
    return false
  }
}

/**
 * Ciclo de vida del reproductor: en el celular pide pantalla completa + horizontal al entrar (si el
 * navegador no lo deja sin un toque reciente, lo vuelve a intentar con el primer toque) y al salir del
 * reproductor suelta la orientación y cierra la pantalla completa que haya abierto.
 */
export function usePlayerScreen(phone: boolean) {
  useEffect(() => {
    mounted++
    let disposed = false
    const retry = () => {
      if (!disposed) enterFullscreen().then((ok) => ok && lockLandscape())
    }
    if (phone) {
      enterFullscreen().then((ok) => {
        if (disposed) return
        if (ok) lockLandscape()
        else window.addEventListener('pointerup', retry, { once: true })
      })
    }
    // Si el usuario sale de la pantalla completa (gesto del sistema), se suelta la orientación.
    const onChange = () => {
      if (!isFullscreen()) {
        owned = false
        unlockOrientation()
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => {
      disposed = true
      mounted--
      window.removeEventListener('pointerup', retry)
      document.removeEventListener('fullscreenchange', onChange)
      // Un instante después: si se montó otro reproductor (siguiente episodio) sigue todo igual.
      setTimeout(() => {
        if (mounted > 0) return
        unlockOrientation()
        if (owned) exitFullscreen()
      }, 0)
    }
  }, [phone])
}
