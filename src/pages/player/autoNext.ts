// Reglas que comparten el reproductor de la web y el nativo de la app de TV.

/** Sin datos de créditos, la tarjeta del siguiente episodio aparece este tiempo antes del final. */
export const NEXT_FALLBACK_S = 30
/** Tráilers y clips: no se guardan en el historial. Los episodios de serie pueden ser cortos (webseries). */
export const MIN_HISTORY_S = 120
export const MIN_HISTORY_EPISODE_S = 60

/** Episodios seguidos que pasaron solos, sin que nadie toque nada (para el "¿Seguís viendo?"). */
export const AUTONEXT_KEY = 'sp-autonext-count'

export function readAutoCount(): number {
  try {
    return Number(sessionStorage.getItem(AUTONEXT_KEY)) || 0
  } catch {
    return 0
  }
}

export function writeAutoCount(n: number) {
  try {
    sessionStorage.setItem(AUTONEXT_KEY, String(n))
  } catch {
    // sin persistencia, no pasa nada
  }
}
