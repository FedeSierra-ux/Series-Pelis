import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthApiError, joinHouse, useAuth } from '../../lib/auth'
import { useTitle } from '../../lib/hooks'
import { useTvMode } from '../../lib/tv'
import './auth.css'

/**
 * `/unirse#CODIGO`: el enlace de invitación que manda el admin. Pide confirmar antes de entrar (un enlace
 * se puede abrir sin querer) y después saca el código de la barra de direcciones.
 */
export function JoinPage() {
  useTitle('Unirse a una casa')
  const auth = useAuth()
  const tv = useTvMode()
  const navigate = useNavigate()
  const { hash } = useLocation()
  // El código se lee una vez: después se borra de la URL.
  const [code] = useState(() => {
    try {
      return decodeURIComponent(hash.slice(1)).trim()
    } catch {
      return ''
    }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (hash) navigate({ hash: '' }, { replace: true })
  }, [])

  const join = async () => {
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      await joinHouse(code, tv)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : 'No se pudo conectar. Probá de nuevo.')
      setBusy(false)
    }
  }

  let body
  if (auth.status === 'disabled') {
    body = (
      <>
        <h1>Unirse a una casa</h1>
        <p className="muted">Este sitio no usa casas: la app ya está lista para usar.</p>
        <Link className="btn btn-primary" to="/" replace>
          Ir al inicio
        </Link>
      </>
    )
  } else if (auth.status === 'in') {
    body = (
      <>
        <h1>Ya entraste</h1>
        <p>
          Este aparato ya está en <strong>{auth.house.name}</strong>.
          {code && ' Para usar la invitación, primero salí de la casa desde Ajustes → Casa.'}
        </p>
        <Link className="btn btn-primary" to="/" replace>
          Ir al inicio
        </Link>
      </>
    )
  } else if (!code) {
    body = (
      <>
        <h1>Unirse a una casa</h1>
        <p className="muted">El enlace no trae el código. Pedile al administrador uno nuevo o escribí el código a mano.</p>
        <Link className="btn btn-primary" to="/" replace>
          Escribir el código
        </Link>
      </>
    )
  } else {
    body = (
      <>
        <h1>Te invitaron a una casa</h1>
        <p className="muted">
          Al entrar, este aparato comparte los addons, los ajustes, el historial y “Mi lista” con el resto de la casa. Lo que
          ya tengas guardado acá se suma.
        </p>
        <button type="button" className="btn btn-primary" onClick={join} disabled={busy} autoFocus>
          {busy ? 'Entrando…' : 'Entrar a la casa'}
        </button>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <Link className="btn btn-ghost" to="/" replace>
          Otras formas de entrar
        </Link>
      </>
    )
  }

  return (
    <main className="login" data-nav-scope data-no-screensaver>
      <div className="auth-card">{body}</div>
    </main>
  )
}
