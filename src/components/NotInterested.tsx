import { useEffect, useRef, useState } from 'react'
import { markNotInterested, notInterestedStore, restoreNotInterested, unmarkNotInterested, type NotInterestedEntry, type RatedTitle } from '../lib/ratings'
import { useStore } from '../lib/store'

const UNDO_MS = 6000

/**
 * "Ya no me interesa": saca el título de "Para vos" y de las filas de Inicio. Tocándolo de nuevo
 * se deshace; también se gestiona en Ajustes → Gustos.
 */
export function NotInterestedButton({ title, tmdbId }: { title: RatedTitle; tmdbId?: number }) {
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

  return (
    <>
      <button
        type="button"
        className={`btn not-interested${marked ? ' on' : ''}`}
        aria-pressed={marked}
        onClick={toggle}
        title={marked ? 'Volver a recomendarlo' : 'Sacarlo de las recomendaciones y de Inicio'}
      >
        {marked ? '⊘ No me interesa' : '⊘ Ya no me interesa'}
      </button>
      {toast && (
        <div className="undo-toast" role="status">
          <span>
            {toast.text}
            <span className="muted"> · {title.name}</span>
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
      )}
    </>
  )
}
