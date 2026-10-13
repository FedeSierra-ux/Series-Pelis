import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { isChunkLoadError, isOffline } from '../lib/errors'
import { ReportButton } from './ReportButton'

type Props = { children: ReactNode }
type State = { error: Error | null; stack: string }

// Si una pantalla tira un error al dibujarse, React desmonta todo y queda la pantalla en negro.
// Esto la reemplaza por un aviso con el error (para poder reportarlo) y botones para salir.
class Boundary extends Component<Props, State> {
  state: State = { error: null, stack: '' }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[Series-Pelis] Error en pantalla:', error, info.componentStack)
    this.setState({ stack: info.componentStack ?? '' })
  }

  render() {
    const { error, stack } = this.state
    if (!error) return this.props.children
    if (isChunkLoadError(error)) return <ChunkErrorScreen />
    return <ErrorScreen error={error} componentStack={stack} />
  }
}

export function errorDetail(error: Error, componentStack = ''): string {
  return [
    `${error.name}: ${error.message}`,
    `Página: ${location.pathname}${location.search}`,
    `Navegador: ${navigator.userAgent}`,
    (error.stack ?? '').split('\n').slice(0, 6).join('\n'),
    componentStack.trim().split('\n').slice(0, 6).join('\n'),
  ]
    .filter(Boolean)
    .join('\n')
}

/** Sigue si hay conexión o no (para cambiar el aviso sin recargar). */
function useOnline() {
  const [online, setOnline] = useState(() => !isOffline())
  useEffect(() => {
    const update = () => setOnline(!isOffline())
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

/**
 * Una parte de la app (una pantalla que se baja aparte) no se pudo descargar. Sin conexión no es un error
 * de la app: falta bajarla. Con conexión suele ser una versión nueva publicada: recargar la trae.
 */
function ChunkErrorScreen() {
  const online = useOnline()
  const [stillOffline, setStillOffline] = useState(false)
  const retry = () => {
    if (isOffline()) setStillOffline(true)
    else location.reload()
  }
  return (
    <div className="page error-screen" role="alert">
      <h1>{online ? 'Falta una parte de la app' : 'Sin conexión'}</h1>
      <p className="muted">
        {online
          ? 'Esta parte de la app no se pudo descargar. Recargá para traerla de nuevo.'
          : 'Esta parte de la app todavía no se descargó. Conectate y probá de nuevo.'}
      </p>
      {!online && stillOffline && <p className="muted small">Todavía no hay conexión.</p>}
      <div className="error-actions">
        <button className="btn" onClick={() => history.back()}>
          ← Volver
        </button>
        {online ? (
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Recargar
          </button>
        ) : (
          <button className="btn btn-primary" onClick={retry}>
            Probar de nuevo
          </button>
        )}
      </div>
    </div>
  )
}

function ErrorScreen({ error, componentStack }: { error: Error; componentStack: string }) {
  const detail = errorDetail(error, componentStack)
  const copy = () => {
    navigator.clipboard?.writeText(detail).catch(() => {})
  }
  return (
    <div className="page error-screen" role="alert">
      <h1>Algo falló</h1>
      <p className="muted">Esta pantalla no se pudo abrir. Probá volver o recargar; si sigue pasando, mandá el informe.</p>
      <div className="error-actions">
        <button className="btn" onClick={() => history.back()}>
          ← Volver
        </button>
        <button className="btn btn-primary" onClick={() => location.reload()}>
          Recargar
        </button>
        <ReportButton kind="app" error={error} context={{ componentStack: componentStack.trim().split('\n').slice(0, 6).join('\n') }} />
        <button className="btn btn-ghost" onClick={copy}>
          Copiar detalle
        </button>
      </div>
      <pre className="error-detail">{detail}</pre>
    </div>
  )
}

// Se reinicia al cambiar de página: si falla una pantalla, las demás siguen andando.
export function ErrorBoundary({ children }: Props) {
  const { pathname } = useLocation()
  return <Boundary key={pathname}>{children}</Boundary>
}
