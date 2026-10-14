// Gestos del reproductor en el celular. Lógica pura (se prueba en gestures.test.ts); los eventos
// viven en useTouchGestures.ts.
//
// - Toque simple: muestra u oculta los controles (no pausa).
// - Doble toque a la izquierda / derecha: −/+10 s. Más toques seguidos del mismo lado suman 10 s cada uno.
// - Pellizcar: abrir = llenar la pantalla (cover), cerrar = ajustar (contain).

import type { VideoFit } from './videoFit'

/** Dos toques más juntos que esto son un doble toque. */
export const DOUBLE_TAP_MS = 300
/** Después de un doble toque, cada toque del mismo lado dentro de este tiempo suma otros 10 s. */
export const TAP_STREAK_MS = 700
/** Si el dedo se movió más que esto, no fue un toque. */
export const TAP_MOVE_PX = 24
/** Distancia máxima entre los dos toques de un doble toque. */
export const DOUBLE_TAP_DIST_PX = 80

export type TapZone = 'left' | 'center' | 'right'

/** Izquierda y derecha son el 40 % de cada lado; el centro no adelanta. */
export function tapZone(x: number, width: number): TapZone {
  if (!(width > 0)) return 'center'
  const f = x / width
  return f < 0.4 ? 'left' : f > 0.6 ? 'right' : 'center'
}

export interface TapState {
  /** Último toque. */
  at: number
  x: number
  y: number
  /** Racha de adelantos: lado, cuántos van y hasta cuándo vale. */
  streak?: { zone: 'left' | 'right'; count: number; until: number }
}

export type TapResult =
  /** Un toque suelto: el que llama espera DOUBLE_TAP_MS por si llega el segundo antes de mostrar/ocultar. */
  | { kind: 'single' }
  /** Adelantar o atrasar: `count` toques en la racha (1 = el doble toque, 2 = un toque más…). */
  | { kind: 'seek'; zone: 'left' | 'right'; count: number }

export interface Tap {
  x: number
  y: number
  at: number
  width: number
}

/** Clasifica un toque según el anterior. Devuelve el resultado y el estado nuevo. */
export function classifyTap(prev: TapState | undefined, tap: Tap): { result: TapResult; state: TapState } {
  const zone = tapZone(tap.x, tap.width)
  const base: TapState = { at: tap.at, x: tap.x, y: tap.y }
  const streak = prev?.streak
  if (streak && zone === streak.zone && tap.at <= streak.until) {
    const count = streak.count + 1
    return { result: { kind: 'seek', zone, count }, state: { ...base, streak: { zone, count, until: tap.at + TAP_STREAK_MS } } }
  }
  const near = prev && tap.at - prev.at <= DOUBLE_TAP_MS && Math.hypot(tap.x - prev.x, tap.y - prev.y) <= DOUBLE_TAP_DIST_PX
  if (near && zone !== 'center' && !streak) {
    return { result: { kind: 'seek', zone, count: 1 }, state: { ...base, streak: { zone, count: 1, until: tap.at + TAP_STREAK_MS } } }
  }
  return { result: { kind: 'single' }, state: base }
}

/** Abrir los dedos más de un 15 % llena la pantalla; cerrarlos, la ajusta. "Estirar" solo con el botón. */
export function pinchFit(startDist: number, endDist: number, current: VideoFit): VideoFit {
  if (!(startDist > 0) || !(endDist > 0)) return current
  const ratio = endDist / startDist
  if (ratio > 1.15) return 'cover'
  if (ratio < 0.87) return 'contain'
  return current
}
