// Velocidad de reproducción: ya no tiene botón en la barra (el usuario no la usa); queda con las teclas < y >.

/** Velocidades que recorren las teclas < y >. */
export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

export type Rate = (typeof RATES)[number]

const RATE_KEY = 'sp-rate'

export const formatRate = (rate: number) => `${rate.toLocaleString('es-AR')}×`

export const isRate = (n: number): n is Rate => (RATES as readonly number[]).includes(n)

/** La velocidad de esta sesión (sessionStorage puede estar bloqueado: entonces vale 1×). */
export function readRate(): Rate {
  try {
    const n = Number(sessionStorage.getItem(RATE_KEY))
    return isRate(n) ? n : 1
  } catch {
    return 1
  }
}

export function storeRate(rate: Rate) {
  try {
    sessionStorage.setItem(RATE_KEY, String(rate))
  } catch {
    // sin persistencia, no pasa nada
  }
}

/** La velocidad siguiente (delta +1) o anterior (−1) de la lista. */
export function stepRate(rate: number, delta: 1 | -1): Rate {
  const i = (RATES as readonly number[]).indexOf(rate)
  const next = RATES[Math.max(0, Math.min(RATES.length - 1, (i < 0 ? RATES.indexOf(1) : i) + delta))]
  return next
}
