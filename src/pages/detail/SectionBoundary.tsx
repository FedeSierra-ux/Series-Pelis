import { Component, type ErrorInfo, type ReactNode } from 'react'

// Si una parte de la ficha (la lista de fuentes, una pestaña) se rompe por un dato raro de un addon,
// se cae solo esa parte, con un aviso y "Reintentar"; la portada, los episodios y el resto siguen.

interface Props {
  children: ReactNode
  /** "las fuentes", "esta sección". */
  what?: string
  /** Al cambiar (otro episodio), se vuelve a intentar solo. */
  resetKey?: string
}

interface State {
  error: Error | null
  resetKey?: string
}

export class SectionBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.resetKey ? null : { error: null, resetKey: props.resetKey }
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[Flix] Error en una sección de la ficha:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="d-section-error" role="alert">
        <p>No se pudieron mostrar {this.props.what ?? 'esta sección'}. Puede ser una respuesta rara de un addon.</p>
        <button type="button" className="btn btn-small" onClick={() => this.setState({ error: null })}>
          Reintentar
        </button>
      </div>
    )
  }
}
