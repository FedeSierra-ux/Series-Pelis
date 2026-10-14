import { useEffect, useRef, type RefObject } from 'react'
import { DOUBLE_TAP_MS, TAP_MOVE_PX, classifyTap, pinchFit, type TapState } from './gestures'
import type { VideoFit } from './videoFit'

// Eventos de los gestos del celular sobre el <video> (la lógica está en gestures.ts). Solo toques:
// con mouse el clic sigue pausando y el doble clic pone pantalla completa.

/** Un toque más largo que esto no es un toque (el usuario está apoyando el dedo). */
const TAP_MAX_MS = 450

interface Handlers {
  /** Toque simple (ya descartado que fuera el primero de un doble toque). */
  onTap: () => void
  /** Doble toque (y los toques seguidos del mismo lado): `count` = cuántos van en la racha. */
  onSeek: (zone: 'left' | 'right', count: number) => void
  /** Pellizco: el modo de imagen que corresponde. */
  onPinch: (fit: VideoFit) => void
  getFit: () => VideoFit
}

export function useTouchGestures(target: RefObject<HTMLElement | null>, handlers: Handlers, enabled = true) {
  const h = useRef(handlers)
  h.current = handlers

  useEffect(() => {
    const el = target.current
    if (!el || !enabled) return
    const pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>()
    let pinch: { start: number; last: number } | undefined
    /** Este gesto fue un pellizco: al levantar los dedos no cuenta como toque. */
    let pinched = false
    let taps: TapState | undefined
    let single: ReturnType<typeof setTimeout> | undefined

    const dist = () => {
      const [a, b] = [...pointers.values()]
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
    }

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: e.timeStamp })
      if (pointers.size === 2) {
        const d = dist()
        pinch = { start: d, last: d }
        pinched = true
        clearTimeout(single)
      }
    }
    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      if (!p) return
      p.x = e.clientX
      p.y = e.clientY
      if (pinch && pointers.size >= 2) pinch.last = dist()
    }
    const onUp = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      if (!p) return
      pointers.delete(e.pointerId)
      if (pinch) {
        if (pointers.size < 2) {
          const next = pinchFit(pinch.start, pinch.last, h.current.getFit())
          if (next !== h.current.getFit()) h.current.onPinch(next)
          pinch = undefined
        }
        return
      }
      if (pointers.size > 0) return
      if (pinched) {
        pinched = false
        return
      }
      const moved = Math.hypot(p.x - p.sx, p.y - p.sy) > TAP_MOVE_PX
      if (moved || e.timeStamp - p.t > TAP_MAX_MS || e.type === 'pointercancel') return
      const rect = el.getBoundingClientRect()
      const { result, state } = classifyTap(taps, { x: e.clientX - rect.left, y: e.clientY - rect.top, at: e.timeStamp, width: rect.width })
      taps = state
      clearTimeout(single)
      if (result.kind === 'seek') {
        h.current.onSeek(result.zone, result.count)
        return
      }
      // Se espera un poquito por si es el primero de un doble toque.
      single = setTimeout(() => h.current.onTap(), DOUBLE_TAP_MS)
    }
    const onCancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = undefined
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onCancel)
    return () => {
      clearTimeout(single)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onCancel)
    }
  }, [target, enabled])
}
