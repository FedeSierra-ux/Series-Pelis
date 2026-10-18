import { NavLink, Link, Outlet, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './ErrorBoundary'
import { HoverTrailerLayer } from './HoverTrailer'
import { OfflineBanner } from './OfflineBanner'
import { ProfileAvatar } from './ProfileAvatar'
import { useActiveProfile, useProfiles } from '../lib/profileSwitch'
import { Theme2Icon, type Theme2IconName } from './Theme2Icons'
import './layout-v14.css'

// Estructura del Tema 2: riel lateral con íconos en PC/TV y, en el celular, cabecera chica
// arriba + barra de pestañas abajo. Las dos cosas están siempre en el DOM y el CSS muestra
// una u otra (la navegación espacial ignora lo que está oculto).

interface Item {
  to: string
  label: string
  icon: Theme2IconName
  end?: boolean
}

// v0.14 (U2): menos destinos, como Netflix. Historial y Calendario viven en "Vos" (/me), con Mi lista,
// Seguir viendo, Te gustaron y Tu año. v0.23: Mi lista salió del menú (es lo principal de Vos).
// Ajustes va abajo de todo (fuera de esta lista).
const RAIL: Item[] = [
  { to: '/search', label: 'Buscar', icon: 'search' },
  { to: '/', label: 'Inicio', icon: 'home', end: true },
  { to: '/discover/movie', label: 'Películas', icon: 'movie' },
  { to: '/discover/series', label: 'Series', icon: 'series' },
  { to: '/me', label: 'Vos', icon: 'user' },
]

const TABS: Item[] = [
  { to: '/', label: 'Inicio', icon: 'home', end: true },
  { to: '/discover/movie', label: 'Películas', icon: 'movie' },
  { to: '/discover/series', label: 'Series', icon: 'series' },
  { to: '/me', label: 'Vos', icon: 'user' },
]

/** "Vos" queda marcado también en lo que se abre desde ahí: historial, calendario, metas y Tu año. */
const isVosPath = (pathname: string) => /^\/(me|history|calendar)(\/|$)/.test(pathname)

/** Ícono del ítem; "Vos" muestra el avatar del perfil activo cuando hay más de uno (v0.18). */
function ItemIcon({ item, size }: { item: Item; size?: number }) {
  const multi = useProfiles().length > 1
  const profile = useActiveProfile()
  if (item.to === '/me' && multi) return <ProfileAvatar profile={profile} size={size ?? 24} className="t2-avatar" />
  return <Theme2Icon name={item.icon} size={size} />
}

function RailLink({ item, forceActive }: { item: Item; forceActive?: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => `t2-rail-link${isActive || forceActive ? ' active' : ''}`}
    >
      <span className="t2-pill" aria-hidden>
        <ItemIcon item={item} />
      </span>
      <span className="t2-rail-label">{item.label}</span>
    </NavLink>
  )
}

export function Theme2Layout() {
  const { pathname } = useLocation()
  const inVos = isVosPath(pathname)
  return (
    <div className="app t2-app">
      <nav className="t2-rail" aria-label="Principal">
        <Link to="/" className="t2-logo" aria-label="Flix, inicio">
          <img src="/favicon.svg" alt="" />
        </Link>
        {RAIL.map((item) => (
          <RailLink key={item.to} item={item} forceActive={item.to === '/me' && inVos} />
        ))}
        <span className="t2-rail-spacer" />
        <RailLink item={{ to: '/settings', label: 'Ajustes', icon: 'settings' }} />
      </nav>

      <header className="t2-top">
        <Link to="/" className="t2-brand">
          <span className="t2-logo t2-logo-sm" aria-hidden>
            <img src="/favicon.svg" alt="" />
          </span>
          <span>Flix</span>
        </Link>
        <NavLink to="/search" className="t2-round" aria-label="Buscar">
          <Theme2Icon name="search" size={20} />
        </NavLink>
        <NavLink to="/settings" className="t2-round" aria-label="Ajustes">
          <Theme2Icon name="settings" size={20} />
        </NavLink>
      </header>

      <main className="main t2-main">
        <OfflineBanner />
        {pathname === '/' && (
          <Link to="/search" className="t2-searchbar">
            <Theme2Icon name="search" size={20} />
            <span>Buscar pelis, series y personas</span>
          </Link>
        )}
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <HoverTrailerLayer />

      <nav className="t2-tabs" aria-label="Principal">
        {TABS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `t2-tab${isActive || (item.to === '/me' && inVos) ? ' active' : ''}`}
          >
            <span className="t2-pill" aria-hidden>
              <ItemIcon item={item} size={20} />
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
