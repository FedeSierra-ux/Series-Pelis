import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { DetailIcon, type DetailIconName } from './DetailIcons'

// Menú ⋯ de la ficha (v0.14): las acciones que se usan poco (Desde el principio, Marcar como vista,
// Ver en IMDb, No me interesa). Botón con aria-haspopup y una lista role="menu": ↑ ↓ recorren,
// Enter elige, Escape / Atrás cierra y el foco vuelve al ⋯. Va en un portal porque la portada de la
// ficha recorta lo que se sale (overflow: hidden).

export interface MoreItem {
  id: string
  label: string
  icon: DetailIconName
  onSelect?: () => void
  /** Link externo (Ver en IMDb). */
  href?: string
  /** Marcado (✓ Vista, No me interesa). */
  checked?: boolean
}

const CLOSE_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])

export function MoreMenu({ items, label = 'Más opciones' }: { items: MoreItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean }>()
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const id = useId()

  const close = (refocus = true) => {
    setOpen(false)
    setPos(undefined)
    if (refocus) requestAnimationFrame(() => button.current?.focus({ preventScroll: true }))
  }

  useLayoutEffect(() => {
    if (!open || !button.current) return
    const r = button.current.getBoundingClientRect()
    const width = 260
    const height = items.length * 52 + 16
    const up = window.innerHeight - r.bottom < height + 12 && r.top > height
    setPos({
      top: up ? r.top - height - 6 : r.bottom + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
      up,
    })
  }, [open, items.length])

  useEffect(() => {
    if (!open || !pos) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]')?.focus({ preventScroll: true })
    const onScroll = () => close(false)
    const onDown = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close(false)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    document.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open, pos])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const els = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])
    const i = els.indexOf(document.activeElement as HTMLElement)
    if (CLOSE_KEYS.has(e.key) || e.key === 'Tab') {
      if (e.key !== 'Tab') e.preventDefault()
      e.stopPropagation()
      close(e.key !== 'Tab')
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = e.key === 'ArrowDown' ? Math.min(els.length - 1, i + 1) : Math.max(0, i - 1)
      els[next]?.focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      els[e.key === 'Home' ? 0 : els.length - 1]?.focus()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // Que la navegación espacial no salga del menú.
      e.preventDefault()
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className="d-icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="d-icon-circle">
          <DetailIcon name="more" />
        </span>
        <span className="d-icon-label">Más</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="menu"
            aria-label={label}
            className={`d-menu${pos?.up ? ' up' : ''}`}
            style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
            data-nav-scope
            onKeyDown={onKeyDown}
          >
            {items.map((it) => {
              const content = (
                <>
                  <DetailIcon name={it.icon} size={20} />
                  <span>{it.label}</span>
                  {it.checked && <span className="d-menu-check" aria-hidden>✓</span>}
                </>
              )
              const role = it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'
              return it.href ? (
                <a key={it.id} role={role} className="d-menu-item" href={it.href} target="_blank" rel="noreferrer" onClick={() => close(false)}>
                  {content}
                </a>
              ) : (
                <button
                  key={it.id}
                  type="button"
                  role={role}
                  aria-checked={it.checked !== undefined ? it.checked : undefined}
                  className="d-menu-item"
                  onClick={() => {
                    close()
                    it.onSelect?.()
                  }}
                >
                  {content}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
