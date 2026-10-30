import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthApiError, listDevices, logout, revokeDevice, useAuth, type DeviceInfo } from '../../lib/auth'
import { flushCloudSync, useSyncStatus } from '../../lib/cloudSync'
import '../auth/auth.css'
import { Spinner } from '../../components/Spinner'

export const authErrorText = (err: unknown) => (err instanceof AuthApiError ? err.message : 'No se pudo conectar. Probá de nuevo.')

/** "hace 5 min", "hace 2 h", "hace 3 días". */
export function ago(ms: number, now = Date.now()): string {
  const min = Math.round((now - ms) / 60_000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

function SyncLine({ offline }: { offline?: boolean }) {
  const st = useSyncStatus()
  // Se redibuja cada minuto para que "hace N min" no quede viejo.
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])
  const pending = st.pending > 0 ? ` · ${st.pending === 1 ? '1 cambio' : `${st.pending} cambios`} por subir` : ''
  const text = offline
    ? 'Sin conexión con el sitio: los cambios se suben cuando vuelva.'
    : st.phase === 'syncing'
      ? 'Sincronizando…'
      : st.phase === 'error'
        ? (st.error ?? 'No se pudo sincronizar.')
        : st.lastSync
          ? `Sincronizado ${ago(st.lastSync)}`
          : 'Esperando para sincronizar…'
  const dot = offline ? 'error' : st.phase === 'off' ? '' : st.phase
  return (
    <p className="sync-status" role="status">
      <span className={`sync-dot ${dot}`} aria-hidden />
      <span>
        {text}
        {pending}
      </span>
    </p>
  )
}

/** Lista de aparatos con sesión abierta en una casa, con "Sacar" (confirmado en el lugar). */
export function DeviceList({ house, onChange }: { house?: string; onChange?: () => void }) {
  const [devices, setDevices] = useState<DeviceInfo[]>()
  const [error, setError] = useState<string>()
  const [confirming, setConfirming] = useState<string>()
  const [round, setRound] = useState(0)

  useEffect(() => {
    let alive = true
    listDevices(house).then(
      (d) => {
        if (alive) setDevices(d)
      },
      (err) => {
        if (alive) setError(authErrorText(err))
      },
    )
    return () => {
      alive = false
    }
  }, [house, round])

  const revoke = async (id: string) => {
    setConfirming(undefined)
    try {
      await revokeDevice(id, house)
      setRound((r) => r + 1)
      onChange?.()
    } catch (err) {
      setError(authErrorText(err))
    }
  }

  if (error) return <p className="error-text">{error}</p>
  if (!devices) return <Spinner />
  if (!devices.length) return <p className="muted small">Ningún aparato entró todavía.</p>
  return (
    <ul className="house-list">
      {devices.map((d) => (
        <li key={d.id} className="house-item">
          <div className="house-item-text">
            <strong>
              {d.label} {d.current && <span className="chip small">Este aparato</span>}
            </strong>
            <span className="muted small">Usado {ago(d.lastSeenAt)}</span>
          </div>
          {!d.current && (
            <div className="house-item-actions">
              {confirming === d.id ? (
                <span className="confirm-inline">
                  <span className="small">¿Sacarlo de la casa?</span>
                  <span className="confirm-inline-btns">
                    <button type="button" className="btn btn-small danger" onClick={() => void revoke(d.id)}>
                      Sí, sacar
                    </button>
                    <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirming(undefined)}>
                      No
                    </button>
                  </span>
                </span>
              ) : (
                <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirming(d.id)}>
                  Sacar
                </button>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Ajustes → Casa: en qué casa está este aparato, la sincronización, los aparatos y "Salir". */
export function HouseSettings() {
  const auth = useAuth()
  const [confirmOut, setConfirmOut] = useState(false)
  const [leaving, setLeaving] = useState(false)
  if (auth.status !== 'in') return null

  const leave = async () => {
    setLeaving(true)
    // Lo que quedó sin subir se sube antes (con tope: sin conexión no se queda esperando).
    await flushCloudSync()
    await logout().catch(() => {})
  }

  return (
    <section className="settings-section">
      <h2>Casa</h2>
      <p>
        Este aparato está en <strong>{auth.house.name}</strong>
        {auth.house.isAdmin && ' (administrador)'}. Los addons, los ajustes de reproducción, el historial, “Mi lista” y tus
        estrellas se sincronizan solos con los demás aparatos de la casa.
      </p>
      <SyncLine offline={auth.offline} />
      <div className="hero-actions">
        <Link className="btn" to="/vincular">
          Vincular un aparato
        </Link>
        <span className="muted small">Para entrar en la TV con el código de 6 números que muestra.</span>
      </div>
      <h3>Aparatos de la casa</h3>
      <DeviceList />
      <div className="hero-actions">
        {confirmOut ? (
          <span className="confirm-inline">
            <span>
              {auth.house.isAdmin
                ? '¿Salir de la casa en este aparato? Lo guardado acá queda, pero deja de sincronizarse.'
                : '¿Salir de la casa en este aparato? Se borran los addons de este aparato; lo demás queda, pero deja de sincronizarse.'}
            </span>
            <button type="button" className="btn danger" onClick={() => void leave()} disabled={leaving}>
              {leaving ? 'Saliendo…' : 'Sí, salir'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmOut(false)} disabled={leaving}>
              Cancelar
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn-ghost danger" onClick={() => setConfirmOut(true)}>
            Salir de la casa
          </button>
        )}
      </div>
    </section>
  )
}
