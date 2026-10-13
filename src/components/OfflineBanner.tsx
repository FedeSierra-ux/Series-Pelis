import { useEffect, useRef, useState } from 'react'
import { useOnline } from '../lib/online'

const BACK_ONLINE_MS = 8000

/** Aviso "Sin conexión" arriba de todo; al volver internet ofrece actualizar. */
export function OfflineBanner() {
  const online = useOnline()
  const wasOffline = useRef(!online)
  const [back, setBack] = useState(false)

  useEffect(() => {
    if (!online) {
      wasOffline.current = true
      setBack(false)
      return
    }
    if (!wasOffline.current) return
    wasOffline.current = false
    setBack(true)
    const t = setTimeout(() => setBack(false), BACK_ONLINE_MS)
    return () => clearTimeout(t)
  }, [online])

  if (online && !back) return null
  return (
    <div className={`offline-banner${online ? ' is-back' : ''}`} role="status">
      {online ? (
        <>
          <span>Volvió la conexión.</span>
          <button type="button" className="btn btn-small" onClick={() => window.location.reload()}>
            Actualizar
          </button>
        </>
      ) : (
        <span>
          <strong>Sin conexión.</strong> Te mostramos lo que tenés guardado: Seguir viendo, Mi lista, Historial y las fichas que ya
          abriste.
        </span>
      )}
    </div>
  )
}
