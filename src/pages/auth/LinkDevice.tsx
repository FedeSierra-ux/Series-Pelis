import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { KeyboardToggle } from '../../components/OnScreenKeyboard'
import { AuthApiError, pairApprove, useAuth } from '../../lib/auth'
import { useTitle } from '../../lib/hooks'
import './auth.css'

const digits = (s: string) => s.replace(/\D/g, '').slice(0, 6)

/**
 * `/vincular`: aprobar con el código de 6 dígitos un aparato que muestra la pantalla de entrada (la TV).
 * El QR de la TV trae el código en `#`; igual hay que tocar "Aprobar" (nunca se aprueba solo).
 */
export function LinkDevice() {
  useTitle('Vincular un aparato')
  const auth = useAuth()
  const navigate = useNavigate()
  const { hash } = useLocation()
  const [code, setCode] = useState(() => digits(hash.slice(1)))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()

  useEffect(() => {
    if (hash) navigate({ hash: '' }, { replace: true })
  }, [])

  const approve = async (e?: FormEvent) => {
    e?.preventDefault()
    if (code.length !== 6 || busy) return
    setBusy(true)
    setMsg(undefined)
    try {
      const r = await pairApprove(code)
      setMsg({ ok: true, text: `✓ Listo: “${r.label}” entró a ${r.house}. En unos segundos se abre solo.` })
      setCode('')
    } catch (err) {
      setMsg({ ok: false, text: err instanceof AuthApiError ? err.message : 'No se pudo conectar. Probá de nuevo.' })
    } finally {
      setBusy(false)
    }
  }

  if (auth.status !== 'in') {
    return (
      <div className="page auth-page">
        <div className="auth-card">
          <h1>Vincular un aparato</h1>
          <p className="muted">Este sitio no usa casas: no hace falta vincular nada.</p>
          <Link className="btn" to="/">
            Ir al inicio
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page auth-page">
      <form className="auth-card" onSubmit={approve}>
        <h1>Vincular un aparato</h1>
        <p className="muted">
          Escribí el código de 6 números que muestra la TV (o el otro aparato) para que entre a <strong>{auth.house.name}</strong>.
        </p>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="auth-code-input"
          aria-label="Código de 6 números"
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(digits(e.target.value))}
          autoFocus={!code}
        />
        <KeyboardToggle value={code} onChange={(v) => setCode(digits(v))} onDone={() => void approve()} doneLabel="Aprobar" label="Teclado para el código" />
        <p className="muted small">Aprobá solo un código que estés viendo en tu propia pantalla: el aparato entra a tu casa.</p>
        <button className="btn btn-primary" disabled={busy || code.length !== 6} autoFocus={!!code}>
          {busy ? 'Aprobando…' : 'Aprobar'}
        </button>
        {msg && (
          <p className={msg.ok ? 'ok' : 'login-error'} role={msg.ok ? 'status' : 'alert'}>
            {msg.text}
          </p>
        )}
      </form>
    </div>
  )
}
