import { NavLink, Outlet } from 'react-router-dom'

const LINKS = [
  { to: '/', label: 'Inicio', icon: '⌂', end: true },
  { to: '/discover/movie', label: 'Películas', icon: '🎬' },
  { to: '/discover/series', label: 'Series', icon: '📺' },
  { to: '/search', label: 'Buscar', icon: '⌕' },
  { to: '/list', label: 'Mi lista', icon: '★' },
  { to: '/history', label: 'Historial', icon: '⟲' },
  { to: '/settings', label: 'Ajustes', icon: '⚙' },
]

export function Layout() {
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
              <span className="nav-icon" aria-hidden>
                {l.icon}
              </span>
              <span className="nav-label">{l.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
