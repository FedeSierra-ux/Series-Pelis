// Adelantar "manteniendo" ← / → (TV y teclado): modo scrub. Lógica pura, se prueba en scrub.test.ts.
//
// - Un toque suelto sigue siendo ±10 s al instante.
// - Si la flecha se mantiene (o se repite enseguida), el video se pausa y se mueve un destino que acelera:
//   10 s, después 30 s y después 1 min por paso. Se ve la miniatura del destino.
// - OK confirma (va al destino), Atrás cancela (vuelve a donde estaba antes de la primera flecha).

/** Cada cuánto avanza el destino mientras se mantiene la flecha. */
export const SCRUB_TICK_MS = 180
/** Dos toques de la misma flecha más juntos que esto cuentan como "mantener" (controles que no repiten). */
export const SCRUB_REPEAT_MS = 320
/** Paso de un toque suelto (y del primer tramo al mantener). */
export const SCRUB_TAP_S = 10

/** Cuánto avanza cada paso según cuánto hace que se mantiene la flecha. */
export function scrubStep(heldMs: number): number {
  if (heldMs < 1500) return 10
  if (heldMs < 4000) return 30
  return 60
}

export type Dir = 1 | -1

/** Última flecha apretada, para saber si la que llega es "la misma, mantenida". */
export interface LastPress {
  key: string
  at: number
  /** Ya se soltó (llegó el keyup). */
  up: boolean
}

/**
 * ¿Esta flecha es parte de mantener? Sí si es una repetición (o llegó sin soltar la anterior). Con
 * `rapid` (la TV: hay controles que mandan apretar/soltar en vez de repetir) también un toque enseguida
 * del anterior; en la PC no, así dos toques rápidos siguen siendo +20 s.
 */
export function isHold(prev: LastPress | undefined, key: string, now: number, repeat: boolean, rapid = false): boolean {
  if (repeat) return true
  if (!prev || prev.key !== key) return false
  return !prev.up || (rapid && now - prev.at < SCRUB_REPEAT_MS)
}

export interface Scrub {
  /** Dónde estaba antes de la primera flecha (Atrás vuelve acá). */
  origin: number
  /** Destino elegido hasta ahora. */
  target: number
  dir: Dir
  /** Desde cuándo se mantiene la flecha (para acelerar). */
  holdStart: number
  lastTick: number
  /** Se estaba reproduciendo: al confirmar o cancelar sigue reproduciendo. */
  wasPlaying: boolean
}

const clamp = (t: number, duration: number) => Math.max(0, Math.min(Number.isFinite(duration) && duration > 0 ? duration : t, t))

/** Empieza el modo scrub. `current` ya incluye el primer toque de ±10 s. */
export function startScrub(origin: number, current: number, dir: Dir, now: number, wasPlaying: boolean): Scrub {
  return { origin, target: current, dir, holdStart: now, lastTick: now, wasPlaying }
}

/**
 * Llega otra flecha estando en modo scrub. Mantenida (`held`, ver `isHold`): avanza un paso cada
 * `SCRUB_TICK_MS`, con el paso que corresponda al tiempo mantenido. Un toque nuevo (se soltó y pasó un
 * rato) o la otra flecha: ±10 s y vuelve a empezar despacio.
 */
export function scrubKey(s: Scrub, dir: Dir, now: number, duration: number, held: boolean): Scrub {
  if (!held || dir !== s.dir) {
    return { ...s, dir, holdStart: now, lastTick: now, target: clamp(s.target + dir * SCRUB_TAP_S, duration) }
  }
  if (now - s.lastTick < SCRUB_TICK_MS) return s
  return { ...s, lastTick: now, target: clamp(s.target + dir * scrubStep(now - s.holdStart), duration) }
}

/** Cuánto se movió el destino (para el texto "+2:30"). */
export function scrubDelta(s: Scrub): number {
  return s.target - s.origin
}
