import { useState } from 'react'
import { ensureLocalStremio, STREMIO_SERVICE_URL } from '../../lib/stremioServer'

// v0.29: en la PC sin Stremio Service, arriba de las fuentes. Con Stremio Service abierto los torrents sin debrid
// se reproducen en el navegador (como Stremio Web); la app lo encuentra sola al volver a la pestaña o con el botón.

export function StremioServiceNotice({ checking }: { checking: boolean }) {
  const [tried, setTried] = useState(false)
  const retry = () => {
    setTried(true)
    void ensureLocalStremio(true)
  }
  return (
    <div className="stremio-notice" role="note">
      <div className="stremio-notice-text">
        <strong>Para ver los torrents sin debrid en esta compu</strong>
        <span>Instalá Stremio Service (gratis, de Stremio) y dejalo abierto: Flix lo encuentra solo.</span>
        <span className="muted small">
          Si el navegador pregunta si Flix puede acceder a otras apps o dispositivos, elegí «Permitir». Si ya lo
          bloqueaste, habilitalo desde el ícono a la izquierda de la dirección.
        </span>
      </div>
      <div className="stremio-notice-actions">
        <a className="btn btn-small btn-primary" href={STREMIO_SERVICE_URL} target="_blank" rel="noreferrer">
          Descargar Stremio Service
        </a>
        <button className="btn btn-small" onClick={retry} aria-disabled={checking || undefined}>
          {checking ? 'Buscando…' : tried ? 'Probar de nuevo (no lo encontré)' : 'Probar de nuevo'}
        </button>
      </div>
    </div>
  )
}
