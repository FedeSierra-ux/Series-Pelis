import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

// Selector propio en vez de <select>: con el control remoto un <select> enfocado se "come" las
// flechas (la navegación espacial no puede salir de él). Este abre una lista de botones que se
// recorre con ↑/↓, Enter elige y Atrás cierra. En el celular se abre como hoja desde abajo.

export interface PickerOption {
  value: string
  label: string
  icon?: string
}

interface Props {
  label: string
  value: string
  options: PickerOption[]
  onChange: (value: string) => void
  /** Texto del botón cuando el valor está vacío (por defecto, el de la opción vacía). */
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Abrir la lista apenas aparece (ej. "Fusionar con…", que no tiene paso previo). */
  autoOpen?: boolean
  /** Se avisa cada vez que la lista se cierra, se haya elegido algo o no. */
  onClose?: () => void
}

const CLOSE_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])

export function Picker({ label, value, options, onChange, placeholder, disabled, className, autoOpen, onClose }: Props) {
  const [open, setOpen] = useState(!!autoOpen)
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number; maxHeight: number }>()
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const id = useId()
  const current = options.find((o) => o.value === value)
  const shown = current && (current.value || !placeholder) ? current.label : (placeholder ?? current?.label ?? '')

  const close = (refocus = true) => {
    setOpen(false)
    // El foco vuelve al botón que abrió la lista (si no, queda en <body> y el próximo Atrás se va de la página).
    if (refocus) requestAnimationFrame(() => button.current?.focus({ preventScroll: true }))
    onClose?.()
  }

  useLayoutEffect(() => {
    if (!open || !button.current) return
    const r = button.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const up = below < 240 && above > below
    setPos({
      top: up ? Math.max(8, r.top - Math.min(above, 420)) : r.bottom + 6,
      left: Math.min(r.left, window.innerWidth - Math.max(r.width, 220) - 8),
      minWidth: r.width,
      maxHeight: Math.min(up ? above : below, 420),
    })
  }, [open])

  useEffect(() => {
    // Recién con la posición calculada: antes la lista está oculta y el foco no entra
    // (y Escape le llegaba a la navegación general, que volvía de página).
    if (!open || !pos) return
    // Foco en la opción elegida, así ↑/↓ arranca desde ahí.
    const el = list.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? list.current?.querySelector<HTMLElement>('button')
    el?.focus({ preventScroll: true })
    el?.scrollIntoView({ block: 'nearest' })
    const onScroll = () => close(false)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, pos])

  /** ↑/↓ se quedan dentro de la lista: en la primera o la última opción no se mueven (no se sale a la página). */
  const moveFocus = (delta: -1 | 1) => {
    const opts = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])
    if (!opts.length) return
    const i = opts.indexOf(document.activeElement as HTMLElement)
    const next = opts[Math.min(opts.length - 1, Math.max(0, (i < 0 ? (delta > 0 ? -1 : opts.length) : i) + delta))]
    next.focus({ preventScroll: true })
    next.scrollIntoView({ block: 'nearest' })
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (CLOSE_KEYS.has(e.key)) {
      // Antes de que la navegación espacial lo tome como "volver a la página anterior".
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      moveFocus(e.key === 'ArrowDown' ? 1 : -1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Tab') {
      // Nada que elegir a los costados: el foco se queda en la lista.
      e.preventDefault()
      e.stopPropagation()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      const opts = list.current?.querySelectorAll<HTMLElement>('[role="option"]')
      opts?.[e.key === 'Home' ? 0 : opts.length - 1]?.focus({ preventScroll: true })
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`picker-btn${value ? ' is-set' : ''}${className ? ` ${className}` : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="picker-label">{label}</span>
        <span className="picker-value">{shown}</span>
        <span className="picker-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open &&
        createPortal(
          <div className="picker-layer" data-nav-scope onKeyDown={onKeyDown} onClick={() => close()}>
            <div
              ref={list}
              id={id}
              className="picker-pop"
              role="listbox"
              aria-label={label}
              style={pos ? { top: pos.top, left: pos.left, minWidth: pos.minWidth, maxHeight: pos.maxHeight } : { visibility: 'hidden' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="picker-title">{label}</div>
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  className="picker-opt"
                  onClick={() => {
                    onChange(o.value)
                    close()
                  }}
                >
                  {o.icon && <img src={o.icon} alt="" loading="lazy" />}
                  <span>{o.label}</span>
                  {o.value === value && (
                    <span className="picker-check" aria-hidden>
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
