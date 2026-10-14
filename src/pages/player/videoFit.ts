// Ajustar / llenar / estirar el video (botón, tecla Z, pellizco y ⚙). Se recuerda por dispositivo
// (localStorage): en un celular 20:9 conviene "llenar" y en la TV, casi siempre "ajustar".

export type VideoFit = 'contain' | 'cover' | 'fill'

export const VIDEO_FITS: VideoFit[] = ['contain', 'cover', 'fill']

export const FIT_LABELS: Record<VideoFit, string> = {
  contain: 'Ajustar',
  cover: 'Llenar',
  fill: 'Estirar',
}

/** Qué hace cada modo, para el aviso y el `aria-label`. */
export const FIT_HINTS: Record<VideoFit, string> = {
  contain: 'se ve todo, con bordes negros si hace falta',
  cover: 'llena la pantalla y recorta los bordes',
  fill: 'llena la pantalla deformando la imagen',
}

export const FIT_KEY = 'sp-video-fit'

export const isVideoFit = (v: unknown): v is VideoFit => typeof v === 'string' && (VIDEO_FITS as string[]).includes(v)

/** El que sigue en la vuelta Ajustar → Llenar → Estirar → Ajustar. */
export function nextFit(current: VideoFit): VideoFit {
  return VIDEO_FITS[(VIDEO_FITS.indexOf(current) + 1) % VIDEO_FITS.length]
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

const local = (): Storage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

// localStorage puede estar bloqueado (modo privado de algunas TVs): entonces no se recuerda y listo.
export function readFit(storage: Storage | undefined = local()): VideoFit {
  try {
    const v = storage?.getItem(FIT_KEY)
    return isVideoFit(v) ? v : 'contain'
  } catch {
    return 'contain'
  }
}

export function storeFit(fit: VideoFit, storage: Storage | undefined = local()) {
  try {
    storage?.setItem(FIT_KEY, fit)
  } catch {
    // sin persistencia, no pasa nada
  }
}
