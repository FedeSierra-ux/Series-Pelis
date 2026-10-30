import { useCallback, useEffect, useRef, useState } from 'react'

// Aviso "Hecho · Deshacer" (estilo `.undo-toast`, el mismo del historial) para acciones que se pueden revertir:
// quitar un addon, marcar una temporada, borrar el historial. Un solo aviso a la vez; se va solo.

/** Cuánto se ve el aviso con "Deshacer". */
export const UNDO_TOAST_MS = 6000

export interface UndoToastState {
  text: string
  detail?: string
  undo: () => void
}

export interface UndoToastApi {
  toast: UndoToastState | undefined
  /** Muestra el aviso. `undo` se llama si tocan "Deshacer". */
  show: (text: string, undo: () => void, detail?: string) => void
  /** "Deshacer": revierte y saca el aviso (el foco vuelve a donde estaba, si ese control sigue en pantalla). */
  undo: () => void
  dismiss: () => void
}

export function useUndoToast(): UndoToastApi {
  const [toast, setToast] = useState<UndoToastState>()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const from = useRef<Element | null>(null)
  useEffect(
    () => () => {
      clearTimeout(timer.current)
    },
    [],
  )

  const dismiss = useCallback(() => {
    clearTimeout(timer.current)
    setToast(undefined)
  }, [])

  const show = useCallback((text: string, undo: () => void, detail?: string) => {
    from.current = document.activeElement
    setToast({ text, detail, undo })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(undefined), UNDO_TOAST_MS)
  }, [])

  const undo = useCallback(() => {
    if (!toast) return
    toast.undo()
    dismiss()
    // El aviso desaparece con el foco adentro: vuelve al control de donde salió (control remoto y teclado).
    const back = from.current
    if (back instanceof HTMLElement && back.isConnected) requestAnimationFrame(() => back.focus())
  }, [toast, dismiss])

  return { toast, show, undo, dismiss }
}

export function UndoToast({ api }: { api: UndoToastApi }) {
  const { toast, undo } = api
  if (!toast) return null
  return (
    <div className="undo-toast" role="status">
      <span>
        {toast.text}
        {toast.detail && <span className="muted"> · {toast.detail}</span>}
      </span>
      <button type="button" className="btn btn-small" onClick={undo}>
        Deshacer
      </button>
    </div>
  )
}
