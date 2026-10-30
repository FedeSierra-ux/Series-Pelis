import { useEffect, useRef, useState } from 'react'
import { localTitle } from '../lib/localTitles'
import { markNotInterested, notInterestedStore, restoreNotInterested, unmarkNotInterested, type NotInterestedEntry, type RatedTitle } from '../lib/ratings'
import { useStore } from '../lib/store'

const UNDO_MS = 6000

/**
 * "No me interesa": el estado, el cambio y el aviso con "Deshacer". Lo usa el menú ⋯
 * de la ficha (el aviso va afuera del menú, así no desaparece cuando el menú se cierra).
 */
export function useNotInterested(title: RatedTitle, tmdbId?: number) {
  const marked = !!useStore(notInterestedStore)[title.id]
  const [toast, setToast] = useState<{ text: string; undo: () => void }>()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const show = (text: string, undo: () => void) => {
    setToast({ text, undo })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(undefined), UNDO_MS)
  }

  const toggle = () => {
    if (marked) {
      const prev = unmarkNotInterested(title.id)
      if (prev) show('Se va a volver a recomendar', () => restoreNotInterested(prev as NotInterestedEntry))
    } else {
      markNotInterested(title, tmdbId)
      show('No te lo vamos a recomendar', () => unmarkNotInterested(title.id))
    }
  }

  const toastEl = toast && (
    <div className="undo-toast" role="status">
      <span>
        {toast.text}
        <span className="muted"> · {localTitle(title.id, title.name)}</span>
      </span>
      <button
        type="button"
        className="btn btn-small"
        onClick={() => {
          toast.undo()
          clearTimeout(timer.current)
          setToast(undefined)
        }}
      >
        Deshacer
      </button>
    </div>
  )

  return { marked, toggle, toast: toastEl }
}
