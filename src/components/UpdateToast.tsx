/// <reference types="vite-plugin-pwa/react" />
import { useRef, type KeyboardEvent } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import './update-toast.css'

const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])

/**
 * "Hay una versión nueva": el service worker se instala en segundo plano y acá se avisa, sin recargar
 * solo (en la TV una recarga a mitad de algo molesta). "Actualizar" activa la versión nueva y recarga;
 * "Después" lo deja para la próxima vez. No roba el foco: se llega con las flechas; Atrás lo cierra.
 */
export function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  const box = useRef<HTMLDivElement>(null)

  if (!needRefresh) return null

  const dismiss = () => setNeedRefresh(false)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!BACK_KEYS.has(e.key) || e.altKey || e.ctrlKey || e.metaKey) return
    e.preventDefault()
    e.stopPropagation()
    dismiss()
  }

  return (
    <div ref={box} className="update-toast" role="status" aria-live="polite" onKeyDown={onKeyDown}>
      <span className="update-toast-text">Hay una versión nueva de Series-Pelis</span>
      <div className="update-toast-actions">
        <button type="button" className="btn btn-primary btn-small" onClick={() => void updateServiceWorker(true)}>
          Actualizar
        </button>
        <button type="button" className="btn btn-small" onClick={dismiss}>
          Después
        </button>
      </div>
    </div>
  )
}
