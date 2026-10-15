import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { KeyboardToggle } from '../../components/OnScreenKeyboard'
import { AuthApiError, pairApprove, pairInfo, useAuth, type PairInfo } from '../../lib/auth'
import { ago } from '../settings/HouseSettings'
import { useTitle } from '../../lib/hooks'
import './auth.css'

const digits = (s: string) => s.replace(/\D/g, '').slice(0, 6)

/**
 * `/vincular`: aprobar con el código de 6 dígitos un aparato que muestra la pantalla de entrada (la TV).
 * Va en dos pasos: primero se busca el código y se ve qué aparato lo pidió, cuándo y desde dónde; recién
 * ahí se aprueba. El QR de la TV trae el código en `#`, pero nunca se aprueba solo (un código que manda
 * otra persona metería su aparato en esta casa).
 */
export function LinkDevice() {
  useTitle('Vincular un aparato')
  const auth = useAuth()
  const navigate = useNavigate()
  const { hash } = useLocation()
  const [code, setCode] = useState(() => digits(hash.slice(1)))
  const [info, setInfo] = useState<PairInfo>()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()

  useEffect(() => {
    if (hash) navigate({ hash: '' }, { replace: true })
  }, [])

  const fail = (err: unknown) => setMsg({ ok: false, text: err instanceof AuthApiError ? err.message : 'No se pudo conectar. Probá de nuevo.' })

  const lookup = async (e?: FormEvent) => {
    e?.preventDefault()
    if (code.length !== 6 || busy) return
    setBusy(true)
    setMsg(undefined)
    try {
      setInfo(await pairInfo(code))
    } catch (err) {
      fail(err)
    } finally {
      setBusy(false)
    }
  }

  const approve = async () => {
    if (!info || busy) return
    setBusy(true)
    setMsg(undefined)
    try {
      const r = await pairApprove(code)
      setMsg({ ok: true, text: `✓ Listo: “${r.label}” entró a ${r.house}. En unos segundos se abre solo.` })
      setCode('')
      setInfo(undefined)
    } catch (err) {
      fail(err)
      setInfo(undefined)
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    setInfo(undefined)
    setCode('')
    setMsg(undefined)
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

  const notice = msg && (
    <p className={msg.ok ? 'ok' : 'login-error'} role={msg.ok ? 'status' : 'alert'}>
      {msg.text}
    </p>
  )
  const farAway = info?.origin && info.here && info.origin !== info.here

  return (
    <div className="page auth-page">
      {info ? (
        <div className="auth-card" role="group" aria-labelledby="pair-confirm-title">
          <h1 id="pair-confirm-title">¿Aprobar este aparato?</h1>
          <dl className="pair-info">
            <dt>Aparato</dt>
            <dd>
              {info.label} {info.kind === 'tv' && <span className="chip small">TV</span>}
            </dd>
            <dt>Pidió el código</dt>
            <dd>{ago(info.createdAt)}</dd>
            {info.origin && (
              <>
                <dt>Desde</dt>
                <dd>{info.origin}</dd>
              </>
            )}
          </dl>
          {farAway && (
            <p className="login-error" role="alert">
              Ojo: el código se pidió desde {info.origin} y vos estás en {info.here}. Si no es tu aparato, cancelá.
            </p>
          )}
          <p className="muted small">
            Va a entrar a <strong>{auth.house.name}</strong> y va a ver el historial, la lista y los addons de la casa.
          </p>
          <div className="hero-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void approve()}>
              {busy ? 'Aprobando…' : 'Sí, aprobar'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={cancel} autoFocus>
              Cancelar
            </button>
          </div>
          {notice}
        </div>
      ) : (
        <form className="auth-card" onSubmit={lookup}>
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
            autoFocus
          />
          <KeyboardToggle value={code} onChange={(v) => setCode(digits(v))} onDone={() => void lookup()} doneLabel="Seguir" label="Teclado para el código" />
          <p className="muted small">Aprobá solo un código que estés viendo en tu propia pantalla: el aparato entra a tu casa.</p>
          <button className="btn btn-primary" disabled={busy || code.length !== 6}>
            {busy ? 'Buscando…' : 'Seguir'}
          </button>
          {notice}
        </form>
      )}
    </div>
  )
}
