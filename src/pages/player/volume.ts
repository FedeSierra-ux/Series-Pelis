// Volumen del reproductor: se recuerda mientras dure la sesión (como la velocidad), así no vuelve al
// 100 % en cada episodio. La rueda del mouse sobre el video sube o baja de a 5 %.

export const VOLUME_KEY = 'sp-volume'
export const WHEEL_STEP = 0.05

export interface VolumeState {
  /** 0 a 1 */
  volume: number
  muted: boolean
}

export const clampVolume = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100) / 100

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

const session = (): Storage | undefined => {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage
  } catch {
    return undefined
  }
}

export function readVolume(storage: Storage | undefined = session()): VolumeState | undefined {
  try {
    const raw = storage?.getItem(VOLUME_KEY)
    if (!raw) return undefined
    const v = JSON.parse(raw) as Partial<VolumeState>
    if (typeof v.volume !== 'number' || !Number.isFinite(v.volume)) return undefined
    return { volume: clampVolume(v.volume), muted: !!v.muted }
  } catch {
    return undefined
  }
}

export function storeVolume(state: VolumeState, storage: Storage | undefined = session()) {
  try {
    storage?.setItem(VOLUME_KEY, JSON.stringify({ volume: clampVolume(state.volume), muted: state.muted }))
  } catch {
    // sin persistencia, no pasa nada
  }
}

/**
 * Cuánto cambia el volumen un giro de la rueda: hacia arriba sube. Los touchpads mandan muchos eventos
 * chiquitos: se ignoran los menores a 4 px (y el que llama los agrupa con un pequeño freno).
 */
export function wheelVolumeDelta(deltaY: number): number {
  if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 4) return 0
  return deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP
}

/** Ícono según el nivel: silenciado, bajo o alto. */
export function volumeIcon(state: VolumeState): 'volumeOff' | 'volumeLow' | 'volumeHigh' {
  if (state.muted || state.volume === 0) return 'volumeOff'
  return state.volume < 0.5 ? 'volumeLow' : 'volumeHigh'
}
