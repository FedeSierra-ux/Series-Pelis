import { useEffect, useRef, useState, type FormEvent } from 'react'
import { KeyboardToggle } from '../../components/OnScreenKeyboard'
import { QrCode } from '../../components/QrCode'
import { AuthApiError, joinHouse, pairPoll, pairStart, setupAdmin, type PairStart } from '../../lib/auth'
import { useTvMode } from '../../lib/tv'
import './auth.css'

const errText = (err: unknown) => (err instanceof AuthApiError ? err.message : 'No se pudo conectar. Probá de nuevo.')

/** Código de 6 dígitos para que otro aparato apruebe esta TV (con QR para el celular). Se renueva solo. */
function PairCode({ tv }: { tv: boolean }) {
  const [pair, setPair] = useState<PairStart>()
  const [error, setError] = useState<string>()
  const [round, setRound] = useState(0)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    setError(undefined)
    pairStart(tv).then(
      (p) => {
        if (!alive) return
        setPair(p)
        const poll = async () => {
          if (!alive) return
          if (Date.now() > p.expiresAt) {
            setRound((r) => r + 1)
            return
          }
          try {
            const status = await pairPoll(p.poll)
            if (!alive || status === 'ok') return
            if (status === 'expired') {
              setRound((r) => r + 1)
              return
            }
          } catch {
            // Sin conexión un momento: se vuelve a preguntar.
          }
          timer = setTimeout(poll, Math.max(2, p.interval) * 1000)
        }
        timer = setTimeout(poll, Math.max(2, p.interval) * 1000)
      },
      (err) => {
        if (!alive) return
        setPair(undefined)
        setError(errText(err))
      },
    )
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [round, tv])

  if (error) {
    return (
      <div className="login-pair">
        <p className="login-error" role="alert">
          {error}
        </p>
        <button type="button" className="btn" onClick={() => setRound((r) => r + 1)}>
          Pedir otro código
        </button>
      </div>
    )
  }
  if (!pair) return <div className="spinner" />
  const link = `${location.origin}/vincular#${pair.code}`
  return (
    <div className="login-pair">
      <p className="login-code" aria-label={`Código ${pair.code.split('').join(' ')}`}>
        {pair.code.slice(0, 3)}
        <span aria-hidden> </span>
        {pair.code.slice(3)}
      </p>
      <QrCode text={link} size={tv ? 180 : 150} label="Código QR para aprobar este aparato desde el celular" />
      <p className="muted small">
        Escaneá el QR con un celular donde ya entraste, o abrí <strong>Ajustes → Casa → Vincular un aparato</strong> y
        escribí el código. Esta pantalla entra sola.
      </p>
    </div>
  )
}

function InviteForm({ tv }: { tv: boolean }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!code.trim() || busy) return
    setBusy(true)
    setError(undefined)
    try {
      await joinHouse(code, tv)
    } catch (err) {
      setError(errText(err))
      setBusy(false)
    }
  }
  return (
    <form className="login-form" onSubmit={submit}>
      <label className="login-label" htmlFor="login-invite">
        Enlace o código de invitación
      </label>
      <div className="inline-form">
        <input
          id="login-invite"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ABCD-EFGH-JKMN"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <button className="btn btn-primary" disabled={busy || !code.trim()}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </div>
      <KeyboardToggle value={code} onChange={setCode} onDone={() => void submit()} doneLabel="Entrar" label="Teclado para el código de invitación" />
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

function AdminForm({ needsSetup, tv }: { needsSetup: boolean; tv: boolean }) {
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!key.trim() || busy) return
    setBusy(true)
    setError(undefined)
    try {
      await setupAdmin(key, name, tv)
    } catch (err) {
      setError(errText(err))
      setBusy(false)
    }
  }
  return (
    <form className="login-form" onSubmit={submit}>
      <p className="muted small">
        {needsSetup
          ? 'Primera vez: con la clave del administrador (la que cargaste en Cloudflare como ADMIN_KEY) se crea tu casa.'
          : 'Si sos el administrador y perdiste la sesión, entrá de nuevo con la clave.'}
      </p>
      <label className="login-label" htmlFor="login-key">
        Clave del administrador
      </label>
      <input id="login-key" type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="current-password" />
      {needsSetup && (
        <>
          <label className="login-label" htmlFor="login-house">
            Nombre de tu casa
          </label>
          <input id="login-house" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Casa principal" maxLength={40} />
        </>
      )}
      <button className="btn btn-primary" disabled={busy || !key.trim()}>
        {busy ? 'Entrando…' : needsSetup ? 'Crear mi casa' : 'Entrar'}
      </button>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

/** Pantalla de entrada: aparece cuando el sitio tiene casas y este aparato todavía no entró. */
export function Login({ needsSetup }: { needsSetup: boolean }) {
  const tv = useTvMode()
  // En la TV el código arranca solo; en la PC o el celular, al tocar el botón (cada código cuenta para el tope).
  const [showPair, setShowPair] = useState(tv)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    boxRef.current?.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true })
  }, [])

  return (
    <main className="login" data-nav-scope data-no-screensaver>
      <div ref={boxRef} className="login-box">
        <header className="login-head">
          <h1>Series-Pelis</h1>
          <p className="muted">{needsSetup ? 'Configurá el sitio con la clave del administrador.' : 'Entrá con tu casa para empezar.'}</p>
        </header>

        {needsSetup ? (
          <AdminForm needsSetup tv={tv} />
        ) : (
          <div className="login-grid">
            <section className="login-card" aria-labelledby="login-pair-title">
              <h2 id="login-pair-title">Con otro aparato</h2>
              {showPair ? (
                <PairCode tv={tv} />
              ) : (
                <>
                  <p className="muted small">Si ya entraste en el celular o la PC, aprobá este aparato desde ahí con un código.</p>
                  <button type="button" className="btn" onClick={() => setShowPair(true)}>
                    Mostrar código
                  </button>
                </>
              )}
            </section>
            <section className="login-card" aria-labelledby="login-invite-title">
              <h2 id="login-invite-title">Con una invitación</h2>
              <InviteForm tv={tv} />
              <details className="login-admin">
                <summary>Soy el administrador</summary>
                <AdminForm needsSetup={false} tv={tv} />
              </details>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
