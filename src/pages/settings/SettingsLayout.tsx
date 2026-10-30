import { Component, useEffect, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react'

// Ajustes en dos columnas (v0.10, V5 de la auditoría): desde 1024 px, índice fijo a la izquierda
// con la sección visible resaltada; en el celular, cada sección es un <details> plegable (las
// cerradas de entrada y de a una por vez). Acá no hay lógica de ninguna sección: solo la estructura y el foco.

/** Hasta este ancho, las secciones van plegadas; desde acá, índice + contenido. */
export const WIDE_QUERY = '(min-width: 1024px)'

export interface SettingsSectionDef {
  /** Ancla (`#id`) y clave del índice. */
  id: string
  /** Título del índice y del resumen plegable (el h2 de la sección queda oculto en el celular). */
  title: string
  element: ReactNode
}

/** `matchMedia` como estado de React (sin librerías). En el servidor o en tests da `false`. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'

function isVisible(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

/** Celular: abrir una sección cierra las otras (con "Addons" abierto el resto quedaba a dos pantallas). Devuelve cuántas cerró. */
function closeOtherSections(keep: HTMLDetailsElement): number {
  let closed = 0
  for (const d of document.querySelectorAll<HTMLDetailsElement>('details.settings-block[open]')) {
    if (d === keep) continue
    d.open = false
    closed++
  }
  return closed
}

/**
 * Lleva a una sección. `focusFirst` (control remoto o teclado) pasa el foco al primer control de
 * la sección: así en la TV elegir del índice deja listo el ↓ para seguir dentro del contenido.
 */
export function goToSection(id: string, focusFirst: boolean) {
  const el = document.getElementById(id)
  if (!el) return
  if (el instanceof HTMLDetailsElement) {
    // Primero se cierran las otras: así el scroll de abajo cuenta con el alto final de la página.
    closeOtherSections(el)
    el.open = true
  }
  // `scroll-margin-top` en .settings-block deja lugar para la barra de arriba.
  el.scrollIntoView({ block: 'start' })
  if (!focusFirst) return
  requestAnimationFrame(() => {
    // Primero un control de verdad (campo, botón, selector); un enlace suelto del texto, solo si no hay otra cosa.
    const all = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible)
    const first = all.find((c) => !(c instanceof HTMLAnchorElement) || c.classList.contains('btn')) ?? all[0]
    first?.focus({ preventScroll: true })
    first?.scrollIntoView({ block: 'nearest' })
  })
}

/** Línea (desde arriba) que una sección tiene que haber pasado para contar como "la que se está leyendo". */
const READING_LINE = 0.12

/** Tiempo en que el foco recién movido manda aunque el control todavía no haya entrado en pantalla (scroll suave). */
const FOCUS_GRACE_MS = 1000

/** Sección que se resalta en el índice: la última cuyo título ya pasó la línea de lectura (o la última si se llegó al final). */
export function useActiveSection(ids: string[], enabled: boolean) {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return
    // Cuándo entró el foco por última vez: mientras dura el scroll suave que lo sigue, el control todavía
    // está fuera de la pantalla y igual tiene que mandar.
    let focusAt = 0
    // Sección que tiene el foco (control remoto o teclado), si el control enfocado se ve en pantalla.
    const focusedSection = (): string | undefined => {
      const el = document.activeElement
      if (!(el instanceof HTMLElement) || el === document.body) return undefined
      const block = el.closest<HTMLElement>('.settings-block')
      if (!block || !ids.includes(block.id)) return undefined
      if (performance.now() - focusAt < FOCUS_GRACE_MS) return block.id
      const r = el.getBoundingClientRect()
      return r.bottom > 0 && r.top < window.innerHeight ? block.id : undefined
    }
    const update = () => {
      // El foco manda sobre el scroll: en la TV se baja por los controles y la línea de lectura podía marcar
      // otra sección. Si el control enfocado salió de la pantalla (se scrolleó con el mouse), vuelve el scroll.
      const focused = focusedSection()
      if (focused) {
        setActive(focused)
        return
      }
      const limit = window.innerHeight * READING_LINE + 8
      let current = ids[0]
      for (const id of ids) {
        const el = document.getElementById(id)
        if (!el) continue
        if (el.getBoundingClientRect().top > limit) break
        current = id
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) current = ids[ids.length - 1]
      setActive(current)
    }
    // El observador avisa cuando un título cruza la línea de lectura; el scroll cubre el final de la página.
    const io = new IntersectionObserver(update, { rootMargin: `-${READING_LINE * 100}% 0px -${100 - READING_LINE * 100 - 1}% 0px` })
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    }
    // Al entrar el foco en una sección, el índice la marca enseguida (no espera al scroll).
    const onFocusIn = () => {
      focusAt = performance.now()
      const focused = focusedSection()
      if (focused) setActive(focused)
    }
    window.addEventListener('scroll', update, { passive: true })
    document.addEventListener('focusin', onFocusIn)
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', update)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [ids, enabled])
  return [active, setActive] as const
}

export function SettingsIndex({
  sections,
  active,
  onSelect,
}: {
  sections: Pick<SettingsSectionDef, 'id' | 'title'>[]
  active: string
  onSelect: (id: string, focusFirst: boolean) => void
}) {
  const choose = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    // `detail === 0`: fue Enter (teclado o control remoto), no un clic del mouse.
    onSelect(id, e.detail === 0 || document.documentElement.hasAttribute('data-tv'))
  }
  return (
    <nav className="settings-index" aria-label="Secciones de Ajustes">
      <ul>
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={`settings-index-link${active === s.id ? ' active' : ''}`}
              aria-current={active === s.id ? 'true' : undefined}
              onClick={(e) => choose(e, s.id)}
            >
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * Si una sección falla al dibujarse (un dato guardado con mala forma, por ejemplo) solo ella se reemplaza por un
 * aviso: las demás —en especial "Tus datos", donde se importa una copia— siguen a mano (uso-01).
 */
class SectionBoundary extends Component<{ title: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown) {
    console.error(`[Flix] Error en Ajustes → ${this.props.title}:`, error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <section className="settings-section" role="alert">
        <h2>{this.props.title}</h2>
        <p className="muted">Esta sección no se pudo mostrar. Probá recargar; si sigue igual, en “Tus datos” podés restablecer los ajustes.</p>
        <p className="muted small">{this.state.error.message}</p>
        <div className="hero-actions">
          <button className="btn" onClick={() => this.setState({ error: null })}>
            Reintentar
          </button>
          <button className="btn" onClick={() => location.reload()}>
            Recargar
          </button>
        </div>
      </section>
    )
  }
}

/**
 * Envoltorio de cada sección: ancla en PC/TV y <details> plegable en el celular (cerrado de entrada: la sección de Addons,
 * la más larga, empujaba a todas las demás; abrir una cierra las otras). El estado `open` lo maneja el navegador.
 */
export function SettingsBlock({ id, title, wide, children }: { id: string; title: string; wide: boolean; children: ReactNode }) {
  if (wide) {
    return (
      <div className="settings-block" id={id}>
        <SectionBoundary title={title}>{children}</SectionBoundary>
      </div>
    )
  }
  return (
    <details
      className="settings-block"
      id={id}
      onToggle={(e) => {
        const el = e.currentTarget
        // Al abrir a mano, las otras se cierran y, si había alguna arriba, esta se sube para no perderla de vista.
        if (el.open && closeOtherSections(el) > 0) el.scrollIntoView({ block: 'start' })
      }}
    >
      <summary className="settings-summary">
        <h2 className="settings-summary-title">{title}</h2>
        <span className="settings-summary-caret" aria-hidden>
          ▾
        </span>
      </summary>
      <SectionBoundary title={title}>{children}</SectionBoundary>
    </details>
  )
}
