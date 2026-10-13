import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './ErrorBoundary'
import { HoverTrailerLayer } from './HoverTrailer'
import { OfflineBanner } from './OfflineBanner'
import { useTheme } from '../lib/theme'
import { Theme2Icon, type Theme2IconName } from './Theme2Icons'
import { Theme2Layout } from './Theme2Layout'

interface Item {
  to: string
  label: string
  icon: Theme2IconName
  end?: boolean
}

// Barra de arriba (PC y TV): todos los ítems.
const LINKS: Item[] = [
  { to: '/', label: 'Inicio', icon: 'home', end: true },
  { to: '/discover/movie', label: 'Películas', icon: 'movie' },
  { to: '/discover/series', label: 'Series', icon: 'series' },
  { to: '/tv', label: 'TV', icon: 'antenna' },
  { to: '/search', label: 'Buscar', icon: 'search' },
  { to: '/list', label: 'Mi lista', icon: 'list', end: true },
  { to: '/history', label: 'Historial', icon: 'history' },
  { to: '/calendar', label: 'Calendario', icon: 'calendar' },
  { to: '/settings', label: 'Ajustes', icon: 'settings' },
]

// Barra de abajo (solo celular, v0.10): lo más usado y "Más" para el resto.
// No hay ruta "Descubrir" sola, así que van Películas y Series.
const BAR: Item[] = [
  { to: '/', label: 'Inicio', icon: 'home', end: true },
  { to: '/discover/movie', label: 'Películas', icon: 'movie' },
  { to: '/discover/series', label: 'Series', icon: 'series' },
  { to: '/search', label: 'Buscar', icon: 'search' },
  { to: '/list', label: 'Mi lista', icon: 'list', end: true },
]

// Hoja "Más": lo que no entra abajo, incluidas las pantallas que antes no estaban en ningún menú.
const MORE: Item[] = [
  { to: '/tv', label: 'TV en vivo', icon: 'antenna' },
  { to: '/history', label: 'Historial', icon: 'history', end: true },
  { to: '/calendar', label: 'Calendario', icon: 'calendar' },
  { to: '/lists', label: 'Listas', icon: 'lists' },
  { to: '/together', label: 'Juntos', icon: 'users' },
  { to: '/history/diary', label: 'Diario', icon: 'book' },
  { to: '/history/goals', label: 'Metas', icon: 'trophy' },
  { to: '/settings', label: 'Ajustes', icon: 'settings' },
]

const CLOSE_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])

/** `/history/year` también cuenta como "Más" (cuelga de Historial). */
function inMore(pathname: string) {
  return MORE.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))
}

function NavIcon({ name }: { name: Theme2IconName }) {
  // SVG con el color del texto (currentColor): mismo estilo que los emojis de antes, sin depender de la fuente.
  return (
    <span className="nav-icon" aria-hidden style={{ display: 'inline-flex' }}>
      <Theme2Icon name={name} size={20} />
    </span>
  )
}

/** Hoja desde abajo con el resto del menú. Atrás/Escape la cierra sin salir de la página. */
function MoreSheet({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('a')?.focus({ preventScroll: true })
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  const onKeyDown = (e: KeyboardEvent) => {
    if (!CLOSE_KEYS.has(e.key)) return
    e.preventDefault()
    e.stopPropagation()
    onClose()
  }
  return createPortal(
    <div className="nav-sheet-layer" data-nav-scope onClick={onClose} onKeyDown={onKeyDown}>
      <nav ref={ref} className="nav-sheet" role="dialog" aria-modal="true" aria-label="Más secciones" onClick={(e) => e.stopPropagation()}>
        <div className="nav-sheet-grip" aria-hidden />
        <ul>
          {MORE.map((l) => (
            <li key={l.to}>
              <NavLink to={l.to} end={l.end} className="nav-sheet-link" onClick={onClose}>
                <span className="nav-sheet-icon" aria-hidden>
                  <Theme2Icon name={l.icon} size={22} />
                </span>
                <span>{l.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>,
    document.body,
  )
}

export function Layout() {
  const theme = useTheme()
  const { pathname } = useLocation()
  const [more, setMore] = useState(false)
  const moreBtn = useRef<HTMLButtonElement>(null)

  // Al cambiar de pantalla la hoja se cierra sola (también si se llegó por Atrás).
  useEffect(() => {
    setMore(false)
  }, [pathname])

  const closeMore = () => {
    setMore(false)
    requestAnimationFrame(() => moreBtn.current?.focus({ preventScroll: true }))
  }

  if (theme === '2') return <Theme2Layout />
  return (
    <div className="app">
      <nav className="nav" aria-label="Principal">
        <NavLink to="/" className="brand" end>
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>Series-Pelis</span>
        </NavLink>
        <div className="nav-links">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className="nav-link">
              <NavIcon name={l.icon} />
              <span className="nav-label">{l.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="main">
        <OfflineBanner />
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <HoverTrailerLayer />

      {/* Barra inferior del celular (el CSS la muestra solo ahí; en la TV no existe). */}
      <nav className="nav-bottom" aria-label="Principal (celular)">
        {BAR.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className="nav-link">
            <NavIcon name={l.icon} />
            <span className="nav-label">{l.label}</span>
          </NavLink>
        ))}
        <button
          ref={moreBtn}
          type="button"
          className={`nav-link nav-more-btn${inMore(pathname) ? ' active' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
        >
          <NavIcon name="more" />
          <span className="nav-label">Más</span>
        </button>
      </nav>
      {more && <MoreSheet onClose={closeMore} />}
    </div>
  )
}
