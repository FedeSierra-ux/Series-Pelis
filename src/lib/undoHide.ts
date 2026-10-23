import { useCallback, useEffect, useRef, useState } from 'react'
import { hideFromContinue, progressStore } from './store'

// "Eliminado de Seguir viendo · Deshacer": lo usan Inicio y Vos (antes cada página tenía su copia).

/** Cuánto se ve el aviso con "Deshacer". */
export const UNDO_MS = 5000

export interface UndoHide {
  /** Lo que se acaba de sacar (mientras se puede deshacer). */
  undo: { name: string; ids: string[] } | undefined
  /** Saca el título de "Seguir viendo" y deja el aviso. */
  hide: (metaId: string, name: string) => void
  /** Devuelve exactamente las entradas que se sacaron. */
  restore: () => void
}

/** Aviso "Eliminado de Seguir viendo · Deshacer" que se va solo a los 5 s. */
export function useUndoHide(): UndoHide {
  const [undo, setUndo] = useState<{ name: string; ids: string[] }>()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(
    () => () => {
      clearTimeout(timer.current)
    },
    [],
  )

  const hide = useCallback((metaId: string, name: string) => {
    // Guardamos qué entradas estaban visibles para devolver exactamente esas.
    const ids = Object.values(progressStore.get())
      .filter((e) => e.metaId === metaId && !e.hidden)
      .map((e) => e.videoId)
    hideFromContinue(metaId)
    setUndo({ name, ids })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setUndo(undefined), UNDO_MS)
  }, [])

  const restore = useCallback(() => {
    if (!undo) return
    progressStore.set((all) => {
      const copy = { ...all }
      for (const id of undo.ids) {
        if (!copy[id]) continue
        const { hidden: _hidden, ...rest } = copy[id]
        copy[id] = rest
      }
      return copy
    })
    clearTimeout(timer.current)
    setUndo(undefined)
  }, [undo])

  return { undo, hide, restore }
}
