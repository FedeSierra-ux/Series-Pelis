import { NavLink, Link, Outlet, useLocation } from 'react-router-dom'
import { Theme2Icon, type Theme2IconName } from './Theme2Icons'

// Estructura del Tema 2: riel lateral con íconos en PC/TV y, en el celular, cabecera chica
// arriba + barra de pestañas abajo. Las dos cosas están siempre en el DOM y el CSS muestra
// una u otra (la navegación espacial ignora lo que está oculto).

interface Item {
  to: string
  label: string
  icon: Theme2IconName
  end?: boolean
}

const RAIL: Item[] = [
  { to: '/search', label: 'Buscar', icon: 'search' },
  { to: '/', label: 'Inicio', icon: 'home', end: true },
  { to: '/discover/movie', label: 'Películas', icon: 'movie' },
  { to: '/discover/series', label: 'Series', icon: 'series' },
  { to: '/list', label: 'Mi lista', icon: 'list' },
  { to: '/history', label: 'Historial', icon: 'history' },
  { to: '/calendar', label: 'Calendario', icon: 'calendar' },
]

const TABS: Item[] = [
  { to: '/', label: 'Inicio', icon: 'home', end: true },
  { to: '/discover/movie', label: 'Películas', icon: 'movie' },
  { to: '/discover/series', label: 'Series', icon: 'series' },
  { to: '/list', label: 'Mi lista', icon: 'list' },
  // "Vos": historial, Tu año y calendario (se llega a los dos últimos desde el historial).
  { to: '/history', label: 'Vos', icon: 'user' },
]

function RailLink({ item }: { item: Item }) {
  return (
    <NavLink to={item.to} end={item.end} className="t2-rail-link">
      <span className="t2-pill" aria-hidden>
        <Theme2Icon name={item.icon} />
      </span>
      <span className="t2-rail-label">{item.label}</span>
    </NavLink>
  )
}

export function Theme2Layout() {
  const { pathname } = useLocation()
  const inVos = pathname.startsWith('/history') || pathname.startsWith('/calendar')
  return (
    <div className="app t2-app">
      <nav className="t2-rail" aria-label="Principal">
        <Link to="/" className="t2-logo" aria-label="Series-Pelis, inicio">
          SP
        </Link>
        {RAIL.map((item) => (
          <RailLink key={item.to} item={item} />
        ))}
        <span className="t2-rail-spacer" />
        <RailLink item={{ to: '/settings', label: 'Ajustes', icon: 'settings' }} />
      </nav>

      <header className="t2-top">
        <Link to="/" className="t2-brand">
          <span className="t2-logo t2-logo-sm" aria-hidden>
            SP
          </span>
          <span>Series-Pelis</span>
        </Link>
        <NavLink to="/search" className="t2-round" aria-label="Buscar">
          <Theme2Icon name="search" size={20} />
        </NavLink>
        <NavLink to="/settings" className="t2-round" aria-label="Ajustes">
          <Theme2Icon name="settings" size={20} />
        </NavLink>
      </header>

      <main className="main t2-main">
        {pathname === '/' && (
          <Link to="/search" className="t2-searchbar">
            <Theme2Icon name="search" size={20} />
            <span>Buscar pelis, series y personas</span>
          </Link>
        )}
        <Outlet />
      </main>

      <nav className="t2-tabs" aria-label="Principal">
        {TABS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `t2-tab${isActive || (item.icon === 'user' && inVos) ? ' active' : ''}`}
          >
            <span className="t2-pill" aria-hidden>
              <Theme2Icon name={item.icon} size={20} />
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
