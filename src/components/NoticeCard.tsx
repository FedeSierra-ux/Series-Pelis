import type { KeyboardEvent, ReactNode } from 'react'
import './update-toast.css'

const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])

interface NoticeCardProps {
  /** El texto del aviso. */
  text: string
  /** `alert` para lo que no se puede ignorar (no se pudo guardar); `status` para el resto. */
  role?: 'status' | 'alert'
  /** Lo anuncia el lector de pantalla sin interrumpir (`aria-live="polite"`). */
  polite?: boolean
  /** Atrás / Escape cierran el aviso (no roba el foco: se llega con las flechas). Sin esto, las teclas siguen de largo. */
  onBack?: () => void
  /** Barra de avance (la descarga de la app), entre el texto y los botones. */
  progress?: ReactNode
  /** Los botones. */
  children: ReactNode
}

/**
 * Tarjeta de aviso abajo y al centro (estilo `.update-toast`): "Hay una versión nueva", la descarga de la app,
 * "No se pudo guardar", "Buscando fuente…". Un solo marco para los cuatro; cada uno pone su texto y sus botones.
 */
export function NoticeCard({ text, role = 'status', polite = false, onBack, progress, children }: NoticeCardProps) {
  const onKeyDown = onBack
    ? (e: KeyboardEvent<HTMLDivElement>) => {
        if (!BACK_KEYS.has(e.key) || e.altKey || e.ctrlKey || e.metaKey) return
        e.preventDefault()
        e.stopPropagation()
        onBack()
      }
    : undefined
  return (
    <div className="update-toast" role={role} aria-live={polite ? 'polite' : undefined} onKeyDown={onKeyDown}>
      <span className="update-toast-text">{text}</span>
      {progress}
      <div className="update-toast-actions">{children}</div>
    </div>
  )
}
