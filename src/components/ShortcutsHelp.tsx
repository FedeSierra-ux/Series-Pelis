import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { GOTO_TARGETS, SHORTCUT_GROUPS, createChordMatcher, isTypingTarget, type Shortcut } from '../lib/shortcuts'
import './shortcuts-help.css'

// Ayuda "?" con la tabla de atajos (lib/shortcuts.ts) y el hook que escucha los atajos globales.
// Se abre con "?", desde Ajustes o con openShortcutsHelp(); se cierra con Esc/Atrás, "?" de nuevo,
// el botón o un click afuera. Mientras está abierta, las flechas se quedan adentro (data-nav-scope).

const EVENT = 'sp-shortcuts-help'
const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])
const FOCUSABLE = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])'

type Action = 'open' | 'close' | 'toggle'

function dispatch(action: Action) {
  window.dispatchEvent(new CustomEvent<Action>(EVENT, { detail: action }))
}

/** Abre la ayuda de atajos (desde Ajustes, por ejemplo). */
export function openShortcutsHelp() {
  dispatch('open')
}
export function closeShortcutsHelp() {
  dispatch('close')
}
export function toggleShortcutsHelp() {
  dispatch('toggle')
}

/** Lleva a Buscar y deja el cursor en el campo (que aparece recién cuando se pinta la página). */
function focusSearchInput() {
  let tries = 0
  const tick = () => {
    const input = document.querySelector<HTMLInputElement>('.search-input')
    if (input) {
      input.focus({ preventScroll: true })
      input.select()
      return
    }
    if (++tries < 30) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/**
 * Atajos globales: "/" (Buscar), "?" (ayuda) y "G" + letra (ir a una sección).
 * No se meten cuando se está escribiendo, con el teclado en pantalla abierto, dentro de una ventana
 * (data-nav-scope: asistente, ayuda, listas) ni donde la página maneja sus teclas (data-nav-disabled:
 * el reproductor y "Tu año"). Las flechas y "Atrás" siguen siendo de lib/spatialNav.ts.
 */
export function useGlobalShortcuts() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pathRef = useRef(pathname)
  pathRef.current = pathname

  useEffect(() => {
    const chord = createChordMatcher({ leader: 'g', targets: GOTO_TARGETS })
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return
      // En el reproductor manda el reproductor.
      if (pathRef.current.startsWith('/watch')) return
      // Solo teclas de un carácter: las flechas, Enter, Atrás y demás no son de acá.
      if (e.key.length !== 1) return
      if (document.querySelector('[data-nav-disabled], [data-nav-scope], .osk') || isTypingTarget(document.activeElement)) {
        chord.reset()
        return
      }

      const result = chord.feed(e.key)
      if (result.type === 'match') {
        e.preventDefault()
        if (result.value.to !== pathRef.current) navigate(result.value.to)
        if (result.value.to === '/search') focusSearchInput()
        return
      }
      if (result.type === 'pending') return

      switch (e.key) {
        case '/':
          e.preventDefault()
          if (pathRef.current !== '/search') navigate('/search')
          focusSearchInput()
          return
        case '?':
          e.preventDefault()
          toggleShortcutsHelp()
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])
}

/** Dibuja las teclas de un atajo: cada palabra es una <kbd>; las alternativas van separadas por "/". */
export function ShortcutKeys({ keys }: { keys: Shortcut['keys'] }) {
  return (
    <span className="sh-keys">
      {keys.map((k, i) => (
        <span key={k} className="sh-alt">
          {i > 0 && <span className="sh-sep" aria-hidden>/</span>}
          {k.split(' ').map((part, j) => (
            <kbd key={j}>{part}</kbd>
          ))}
        </span>
      ))}
    </span>
  )
}

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const box = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const onEvent = (e: Event) => {
      const action = (e as CustomEvent<Action>).detail
      setOpen((prev) => (action === 'toggle' ? !prev : action === 'open'))
    }
    window.addEventListener(EVENT, onEvent)
    return () => window.removeEventListener(EVENT, onEvent)
  }, [])

  // Al entrar al reproductor se cierra sola: ahí las teclas son del video.
  useEffect(() => {
    if (pathname.startsWith('/watch')) setOpen(false)
  }, [pathname])

  // Foco adentro al abrir y de vuelta a lo que estaba enfocado al cerrar.
  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true })
    return () => {
      const el = opener.current
      if (el?.isConnected) el.focus({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  const close = () => setOpen(false)

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    if (BACK_KEYS.has(e.key) || e.key === '?') {
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    }
    // Tab y Shift+Tab dan la vuelta dentro de la ventana (las flechas ya se quedan por data-nav-scope).
    if (e.key === 'Tab' && box.current) {
      const els = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (!els.length) return
      const i = els.indexOf(document.activeElement as HTMLElement)
      const next = e.shiftKey ? (i <= 0 ? els.length - 1 : i - 1) : i >= els.length - 1 ? 0 : i + 1
      e.preventDefault()
      els[next].focus({ preventScroll: true })
      els[next].scrollIntoView({ block: 'nearest' })
    }
  }

  const onBackdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) close()
  }

  return (
    <div className="sh-layer" data-nav-scope data-no-screensaver onKeyDown={onKeyDown} onClick={onBackdrop}>
      {/* tabIndex -1: un click en el texto deja el foco en la ventana (y Esc le sigue llegando), no en <body>. */}
      <div ref={box} className="sh-box" role="dialog" aria-modal="true" aria-labelledby="sh-title" tabIndex={-1}>
        <header className="sh-head">
          <div>
            <h2 id="sh-title">Atajos de teclado</h2>
            <p className="muted sh-intro">
              En cualquier pantalla, <kbd>?</kbd> abre esta ayuda. Para ir a una sección: <kbd>G</kbd> y después la letra.
            </p>
          </div>
          <button type="button" className="btn btn-ghost sh-close" aria-label="Cerrar" onClick={close}>
            ✕
          </button>
        </header>
        <div className="sh-columns">
          {SHORTCUT_GROUPS.map((g, i) => (
            // Cada grupo se puede enfocar: con el control remoto las flechas recorren las columnas
            // (→ siguiente columna, ↓ "Entendido", ↑ la cruz). El foco arranca en la primera.
            <section key={g.id} className="sh-group" tabIndex={0} aria-labelledby={`sh-${g.id}`} data-autofocus={i === 0 ? '' : undefined}>
              <h3 id={`sh-${g.id}`}>{g.title}</h3>
              <ul className="sh-list">
                {g.shortcuts.map((s) => (
                  <li key={s.keys.join('|')} className="sh-row">
                    <ShortcutKeys keys={s.keys} />
                    <span className="sh-desc">{s.description}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <footer className="sh-foot">
          <button type="button" className="btn btn-primary" onClick={close}>
            Entendido
          </button>
        </footer>
      </div>
    </div>
  )
}
