import { useEffect, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react'

// Ajustes en dos columnas (v0.10, V5 de la auditoría): desde 1024 px, índice fijo a la izquierda
// con la sección visible resaltada; en el celular, cada sección es un <details> plegable (la
// primera abierta). Acá no hay lógica de ninguna sección: solo la estructura y el foco.

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

/**
 * Lleva a una sección. `focusFirst` (control remoto o teclado) pasa el foco al primer control de
 * la sección: así en la TV elegir del índice deja listo el ↓ para seguir dentro del contenido.
 */
export function goToSection(id: string, focusFirst: boolean) {
  const el = document.getElementById(id)
  if (!el) return
  if (el instanceof HTMLDetailsElement) el.open = true
  // `scroll-margin-top` en .settings-block deja lugar para la barra de arriba.
  el.scrollIntoView({ block: 'start' })
  if (!focusFirst) return
  requestAnimationFrame(() => {
    const first = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).find(isVisible)
    first?.focus({ preventScroll: true })
    first?.scrollIntoView({ block: 'nearest' })
  })
}

/** Sección que se resalta en el índice: la primera (en orden) que asoma por la franja alta de la pantalla. */
export function useActiveSection(ids: string[], enabled: boolean) {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === 'undefined') return
    const visible = new Set<string>()
    const update = () => {
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      const first = ids.find((id) => visible.has(id))
      if (atBottom && visible.size) setActive(ids[Math.max(...ids.map((id, i) => (visible.has(id) ? i : -1)))])
      else if (first) setActive(first)
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).id
          if (e.isIntersecting) visible.add(id)
          else visible.delete(id)
        }
        update()
      },
      // Franja entre el 12 % y el 45 % de la pantalla: lo que se está leyendo.
      { rootMargin: '-12% 0px -55% 0px' },
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    }
    window.addEventListener('scroll', update, { passive: true })
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', update)
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
 * Envoltorio de cada sección: ancla en PC/TV y <details> plegable en el celular. El `open` inicial
 * lo pone React una sola vez; después manda el usuario (abrir/cerrar no vuelve a renderizar).
 */
export function SettingsBlock({ id, title, wide, defaultOpen, children }: { id: string; title: string; wide: boolean; defaultOpen?: boolean; children: ReactNode }) {
  if (wide) {
    return (
      <div className="settings-block" id={id}>
        {children}
      </div>
    )
  }
  return (
    <details className="settings-block" id={id} open={defaultOpen}>
      <summary className="settings-summary">
        <h2 className="settings-summary-title">{title}</h2>
        <span className="settings-summary-caret" aria-hidden>
          ▾
        </span>
      </summary>
      {children}
    </details>
  )
}
