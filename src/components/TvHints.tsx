import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { focusInitialTarget } from '../lib/spatialNav'
import { settingsStore, useStore } from '../lib/store'
import { useTvMode } from '../lib/tv'
import './tv-hints.css'

// Guía del control remoto: una capa a pantalla completa con cuatro tarjetas que aparece la primera vez
// que la app corre en una TV (después del asistente inicial, si estaba abierto). Queda marcada con
// `hintsSeen` en Ajustes; desde Ajustes → "Ver la guía del control remoto" se vuelve a abrir (openTvHints).

const EVENT = 'sp-tv-hints'
const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])

/** Vuelve a mostrar la guía (también fuera del modo TV). */
export function openTvHints() {
  window.dispatchEvent(new Event(EVENT))
}

interface Hint {
  id: string
  title: string
  text: string
  icon: () => React.JSX.Element
}

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function DpadIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="29" {...stroke} opacity="0.35" />
      <circle cx="32" cy="32" r="7" fill="currentColor" opacity="0.35" />
      <path d="M32 9l-6 7h12zM32 55l-6-7h12zM9 32l7-6v12zM55 32l-7-6v12z" fill="currentColor" />
    </svg>
  )
}
function OkIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="29" {...stroke} opacity="0.35" />
      <circle cx="32" cy="32" r="17" fill="currentColor" opacity="0.18" />
      <text x="32" y="38" textAnchor="middle" fontSize="17" fontWeight="800" fill="currentColor" fontFamily="inherit">
        OK
      </text>
    </svg>
  )
}
function BackIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="29" {...stroke} opacity="0.35" />
      <path d="M40 20H27a9 9 0 0 0 0 18h14" {...stroke} strokeWidth="3.5" />
      <path d="M33 31l-7 7 7 7" {...stroke} strokeWidth="3.5" />
    </svg>
  )
}
function PlayerIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden>
      <rect x="4" y="12" width="56" height="40" rx="7" {...stroke} opacity="0.35" />
      <path d="M28 24v16l13-8z" fill="currentColor" />
      <path d="M11 32l4-4m-4 4l4 4M53 32l-4-4m4 4l-4 4" {...stroke} strokeWidth="3" />
    </svg>
  )
}

const HINTS: Hint[] = [
  {
    id: 'move',
    title: 'Movete con las flechas',
    text: 'Recorren pósters, botones y menús. Lo que está marcado se ve con un borde brillante.',
    icon: DpadIcon,
  },
  {
    id: 'ok',
    title: 'OK para elegir',
    text: 'Abre la ficha de una peli o serie: ahí están Mi lista, los episodios y las fuentes. También aprieta botones y da play.',
    icon: OkIcon,
  },
  {
    id: 'back',
    title: 'Atrás para volver',
    text: 'Vuelve a la pantalla anterior y cierra ventanas y menús. En Inicio, Películas, Series y Mi lista primero te lleva arriba y después al menú.',
    icon: BackIcon,
  },
  {
    id: 'player',
    title: 'En el reproductor',
    text: '← y → saltan 10 segundos. OK pausa y reanuda. ↑ muestra los controles, los episodios y las fuentes.',
    icon: PlayerIcon,
  },
]

export function TvHints() {
  const tv = useTvMode()
  const { hintsSeen } = useStore(settingsStore)
  const { pathname } = useLocation()
  const [forced, setForced] = useState(false)
  // Hasta mirar el DOM suponemos que el asistente está abierto: así nunca se pisan.
  const [obVisible, setObVisible] = useState(true)
  const box = useRef<HTMLDivElement>(null)

  const want = forced || (tv && !hintsSeen)
  const show = want && !obVisible && !pathname.startsWith('/watch')

  useEffect(() => {
    const onOpen = () => setForced(true)
    window.addEventListener(EVENT, onOpen)
    return () => window.removeEventListener(EVENT, onOpen)
  }, [])

  // Si el asistente inicial o "¿Quién está mirando?" (v0.18) están abiertos, esperamos a que cierren
  // (lo miramos cada medio segundo). `.ob-pending`: el asistente espera la primera sincronización para abrirse.
  useEffect(() => {
    if (!want) return
    const check = () => {
      const visible = !!document.querySelector('.onboarding, .ob-pending, .pf-layer')
      setObVisible(visible)
      return visible
    }
    if (!check()) return
    const id = setInterval(() => {
      if (!check()) clearInterval(id)
    }, 500)
    return () => clearInterval(id)
  }, [want])

  // Al abrir, el foco va a "Entendido"; al cerrar, vuelve a donde estaba (el botón de Ajustes) o a lo
  // primero de la pantalla. Antes quedaba en <body> y no se veía nada marcado hasta la primera flecha.
  const before = useRef<HTMLElement | null>(null)
  const wasShown = useRef(false)
  useEffect(() => {
    if (show) {
      wasShown.current = true
      const prev = document.activeElement
      before.current = prev instanceof HTMLElement && prev !== document.body ? prev : null
      box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true })
      return
    }
    if (!wasShown.current) return
    wasShown.current = false
    const prev = before.current
    before.current = null
    const active = document.activeElement
    if (active && active !== document.body) return
    if (prev?.isConnected) prev.focus({ preventScroll: true })
    else focusInitialTarget()
  }, [show])

  if (!show) return null

  const close = () => {
    setForced(false)
    if (!hintsSeen) settingsStore.set((s) => ({ ...s, hintsSeen: true }))
  }

  // "Atrás" del control también la cierra, sin llegar a la navegación general (que cambiaría de página).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!BACK_KEYS.has(e.key) || e.altKey || e.ctrlKey || e.metaKey) return
    e.preventDefault()
    e.stopPropagation()
    close()
  }

  return (
    <div className="tv-hints" data-nav-scope data-no-screensaver onKeyDown={onKeyDown}>
      <div ref={box} className="tv-hints-box" role="dialog" aria-modal="true" aria-labelledby="tv-hints-title" tabIndex={-1}>
        <h2 id="tv-hints-title">Así se usa con el control remoto</h2>
        <p className="tv-hints-sub">Cuatro cosas y listo. Después la encontrás en Ajustes → Teclado y ayuda.</p>
        <ul className="tv-hints-cards">
          {HINTS.map((h) => (
            <li key={h.id} className="tv-hint">
              <span className="tv-hint-icon">
                <h.icon />
              </span>
              <h3>{h.title}</h3>
              <p>{h.text}</p>
            </li>
          ))}
        </ul>
        <div className="tv-hints-actions">
          <button type="button" className="btn btn-primary tv-hints-ok" onClick={close} data-autofocus>
            Entendido
          </button>
        </div>
      </div>
    </div>
  )
}
