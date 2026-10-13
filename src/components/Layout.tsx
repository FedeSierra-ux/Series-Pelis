import { NavLink, Outlet } from 'react-router-dom'
import { ErrorBoundary } from './ErrorBoundary'
import { HoverTrailerLayer } from './HoverTrailer'
import { OfflineBanner } from './OfflineBanner'
import { useTheme } from '../lib/theme'
import { Theme2Icon, type Theme2IconName } from './Theme2Icons'
import { Theme2Layout } from './Theme2Layout'

// En el celular entran 8 ítems abajo: "Calendario" se oculta ahí y se llega desde Historial.
const LINKS: { to: string; label: string; icon: Theme2IconName; end?: boolean; desktopOnly?: boolean }[] = [
  { to: '/', label: 'Inicio', icon: 'home', end: true },
  { to: '/discover/movie', label: 'Películas', icon: 'movie' },
  { to: '/discover/series', label: 'Series', icon: 'series' },
  { to: '/tv', label: 'TV', icon: 'antenna' },
  { to: '/search', label: 'Buscar', icon: 'search' },
  { to: '/list', label: 'Mi lista', icon: 'list' },
  { to: '/history', label: 'Historial', icon: 'history' },
  { to: '/calendar', label: 'Calendario', icon: 'calendar', desktopOnly: true },
  { to: '/settings', label: 'Ajustes', icon: 'settings' },
]

export function Layout() {
  if (useTheme() === '2') return <Theme2Layout />
  return (
    <div className="app">
      <nav className="nav" aria-label="Principal">
        <NavLink to="/" className="brand" end>
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>Series-Pelis</span>
        </NavLink>
        <div className="nav-links">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={`nav-link${l.desktopOnly ? ' nav-desktop-only' : ''}`}>
              {/* SVG con el color del texto (currentColor): mismo estilo que los emojis de antes, sin depender de la fuente. */}
              <span className="nav-icon" aria-hidden style={{ display: 'inline-flex' }}>
                <Theme2Icon name={l.icon} size={20} />
              </span>
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
    </div>
  )
}
