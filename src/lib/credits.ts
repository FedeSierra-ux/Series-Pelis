import type { Segment, Segments } from './segments'

// Cuándo ofrecer el siguiente episodio según los créditos de IntroDB, sin cortar lo que venga después.

/** Más que esto entre el fin de los créditos y el final del video = hay algo después (escena, adelanto). */
export const AFTER_CREDITS_MIN_S = 20

export interface CreditsPlan {
  /** Los créditos, con el final recortado a la duración (o al inicio de la escena post-créditos). */
  credits?: Segment
  /** Hay contenido después de los créditos. */
  afterCredits: boolean
  /** Desde cuándo se muestra la tarjeta del siguiente episodio (si hay siguiente). */
  nextAt?: number
}

/**
 * Sin escena, la tarjeta sale al empezar los créditos (o `fallbackS` antes del final si no hay datos).
 * Con escena, recién al terminar los créditos, así no se la saltea.
 */
export function creditsPlan(segments: Segments | null, duration: number, hasNext: boolean, fallbackS: number): CreditsPlan {
  if (!(duration > 0)) return { afterCredits: false }
  const outro = segments?.outro && segments.outro.start < duration - 1 ? segments.outro : undefined
  let credits: Segment | undefined
  let afterCredits = false
  if (outro) {
    let end = Math.min(outro.end, duration)
    const post = segments?.postCredits
    if (post && post.start > outro.start && post.start < duration - 1) {
      end = Math.min(end, post.start)
      afterCredits = true
    }
    credits = { start: outro.start, end }
    afterCredits ||= duration - end > AFTER_CREDITS_MIN_S
  }
  let nextAt: number | undefined
  if (hasNext) {
    if (credits) nextAt = afterCredits ? credits.end : credits.start
    else if (duration > fallbackS * 4) nextAt = duration - fallbackS
  }
  return { credits, afterCredits, nextAt }
}
