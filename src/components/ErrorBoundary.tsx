import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

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

function ErrorScreen({ error, componentStack }: { error: Error; componentStack: string }) {
  const detail = errorDetail(error, componentStack)
  const copy = () => {
    navigator.clipboard?.writeText(detail).catch(() => {})
  }
  return (
    <div className="page error-screen" role="alert">
      <h1>Algo falló</h1>
      <p className="muted">Esta pantalla no se pudo abrir. Probá volver o recargar; si sigue pasando, mandá el detalle.</p>
      <div className="error-actions">
        <button className="btn" onClick={() => history.back()}>
          ← Volver
        </button>
        <button className="btn btn-primary" onClick={() => location.reload()}>
          Recargar
        </button>
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
