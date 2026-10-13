import { NavLink, Outlet } from 'react-router-dom'
import { ErrorBoundary } from './ErrorBoundary'
import { HoverTrailerLayer } from './HoverTrailer'
import { OfflineBanner } from './OfflineBanner'
import { useTheme } from '../lib/theme'
import { Theme2Layout } from './Theme2Layout'

// En el celular entran 7 ítems abajo: "Calendario" se oculta ahí y se llega desde Historial.
const LINKS: { to: string; label: string; icon: string; end?: boolean; desktopOnly?: boolean }[] = [
  { to: '/', label: 'Inicio', icon: '⌂', end: true },
  { to: '/discover/movie', label: 'Películas', icon: '🎬' },
  { to: '/discover/series', label: 'Series', icon: '📺' },
  { to: '/search', label: 'Buscar', icon: '⌕' },
  { to: '/list', label: 'Mi lista', icon: '★' },
  { to: '/history', label: 'Historial', icon: '⟲' },
  { to: '/calendar', label: 'Calendario', icon: '📅', desktopOnly: true },
  { to: '/settings', label: 'Ajustes', icon: '⚙' },
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
              <span className="nav-icon" aria-hidden>
                {l.icon}
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
