import { useSyncExternalStore } from 'react'
import { ReportButton } from '../../components/ReportButton'
import { installId, queuedCount, useReportsEnabled } from '../../lib/diagnostics'
import { settingsStore, useStore } from '../../lib/store'

function subscribeOnline(listener: () => void) {
  window.addEventListener('online', listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener('online', listener)
    window.removeEventListener('storage', listener)
  }
}

/**
 * Ajustes → Diagnóstico: informes de errores. Solo aparece si el sitio tiene activados los informes
 * (`/api/report/_status`). El envío automático está apagado por defecto; "Enviar un informe ahora" sirve
 * para avisar de algo que no tiró un error (una peli que no carga, un addon lento).
 */
export function DiagnosticsSettings() {
  const enabled = useReportsEnabled()
  const settings = useStore(settingsStore)
  const queued = useSyncExternalStore(subscribeOnline, queuedCount, () => 0)
  if (!enabled) return null

  const toggle = (on: boolean) => {
    // El id anónimo se genera al activar la opción (y se guarda en este navegador).
    if (on) installId()
    settingsStore.set((s) => ({ ...s, sendReports: on }))
  }

  return (
    <section className="settings-section">
      <h2>Diagnóstico</h2>
      <label className="check">
        <input type="checkbox" checked={settings.sendReports} onChange={(e) => toggle(e.target.checked)} />
        Enviar informes de errores automáticamente
      </label>
      <p className="muted small">
        Cuando algo falla, la app le manda un aviso a quien administra el sitio para poder arreglarlo sin pedirte fotos de
        la tele. Se manda: el mensaje del error, en qué pantalla pasó, la versión de la app, el tipo de dispositivo y
        navegador, el tema, y solo el <strong>nombre del sitio</strong> de los addons o de la fuente involucrados (por
        ejemplo, “torrentio.strem.fun”).
      </p>
      <p className="muted small">
        No se manda: la dirección completa de tus addons ni sus claves (Real-Debrid, TorBox), la dirección de los
        streams, tu historial, tu lista ni nada que te identifique. Los informes se borran solos a los 30 días.
      </p>
      <p className="muted small">
        Id de esta instalación: <code>{settings.sendReports ? installId().slice(0, 8) : '—'}</code>
        {queued > 0 && ` · ${queued} informe${queued === 1 ? '' : 's'} esperando conexión`}
      </p>
      <h3>¿Pasó algo que no salió como error?</h3>
      <p className="muted small">Contá qué estabas viendo y qué pasó; se manda con los mismos datos de arriba.</p>
      <ReportButton kind="manual" label="Enviar un informe ahora" />
    </section>
  )
}
