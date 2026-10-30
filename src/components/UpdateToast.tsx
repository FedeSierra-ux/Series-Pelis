/// <reference types="vite-plugin-pwa/react" />
import { useRegisterSW } from 'virtual:pwa-register/react'
import { NoticeCard } from './NoticeCard'

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

  if (!needRefresh) return null

  const dismiss = () => setNeedRefresh(false)

  return (
    <NoticeCard text="Hay una versión nueva de Flix" polite onBack={dismiss}>
      <button type="button" className="btn btn-primary btn-small" onClick={() => void updateServiceWorker(true)}>
        Actualizar
      </button>
      <button type="button" className="btn btn-small" onClick={dismiss}>
        Después
      </button>
    </NoticeCard>
  )
}
