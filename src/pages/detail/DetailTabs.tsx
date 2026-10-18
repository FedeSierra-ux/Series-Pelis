import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

// Pestañas de la ficha (v0.14): "Episodios (o Fuentes) | Más como esto" y, en las series, "Detalles" (Extras se fue en
// la v0.24; Detalles volvió en la v0.25, solo para series). Patrón de pestañas
// accesible (tablist / tab / tabpanel) con activación automática: ← → mueven y eligen, Inicio y Fin
// van a la primera y la última. Solo la pestaña elegida entra en el orden del foco, así que con el
// control remoto ↓ desde los botones de la portada cae justo en ella y ↓ otra vez entra al contenido.
// Cada panel se monta la primera vez que se abre y después queda montado (oculto), así volver a una
// pestaña no vuelve a pedir nada ni pierde dónde estabas.

export interface DetailTab {
  id: string
  label: string
  content: ReactNode
}

interface Props {
  tabs: DetailTab[]
  active: string
  onChange: (id: string) => void
  label?: string
  /** ↑ desde las pestañas (con el control remoto): a dónde va el foco. Sin esto decide la navegación espacial. */
  onExitUp?: () => boolean
}

export function DetailTabs({ tabs, active, onChange, label = 'Secciones de la ficha', onExitUp }: Props) {
  const current = tabs.some((t) => t.id === active) ? active : tabs[0]?.id
  const [visited, setVisited] = useState<Set<string>>(() => new Set(current ? [current] : []))
  if (current && !visited.has(current)) setVisited(new Set(visited).add(current))
  const list = useRef<HTMLDivElement>(null)

  const select = (id: string, focus: boolean) => {
    onChange(id)
    if (focus) requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.focus({ preventScroll: true }))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = tabs.findIndex((t) => t.id === current)
    let next = -1
    if (e.key === 'ArrowRight') next = i + 1 < tabs.length ? i + 1 : -1
    else if (e.key === 'ArrowLeft') next = i - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    else {
      if (e.key === 'ArrowUp' && onExitUp?.()) e.preventDefault()
      return
    }
    // En los bordes la flecha no hace nada (no se sale al riel del menú por accidente).
    e.preventDefault()
    if (next >= 0 && next !== i) select(tabs[next].id, true)
  }

  if (tabs.length === 0) return null

  return (
    <div className="dt">
      <div ref={list} className="dt-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((t) => {
          const selected = t.id === current
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`dt-tab-${t.id}`}
              data-tab={t.id}
              aria-selected={selected}
              aria-controls={`dt-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              className={`dt-tab${selected ? ' active' : ''}`}
              onClick={() => select(t.id, true)}
              onFocus={(e) => {
                // Con las flechas desde afuera (la navegación espacial mira todos los botones) se cae
                // siempre en la pestaña elegida, no en la que quedó más cerca.
                const from = e.relatedTarget as Node | null
                if (selected || (from && list.current?.contains(from)) || !e.currentTarget.matches(':focus-visible')) return
                list.current?.querySelector<HTMLElement>(`[data-tab="${current}"]`)?.focus({ preventScroll: true })
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      {tabs.map((t) =>
        visited.has(t.id) || t.id === current ? (
          <div key={t.id} role="tabpanel" id={`dt-panel-${t.id}`} aria-labelledby={`dt-tab-${t.id}`} className="dt-panel" hidden={t.id !== current}>
            {t.content}
          </div>
        ) : null,
      )}
    </div>
  )
}
