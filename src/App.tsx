import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Layout } from './components/Layout'
import { Onboarding } from './components/Onboarding'
import { Screensaver } from './components/Screensaver'
import { ShortcutsHelp, useGlobalShortcuts } from './components/ShortcutsHelp'
import { TvHints } from './components/TvHints'
import { UpdateToast } from './components/UpdateToast'
import { resetFocus, restoreFocus, saveFocus, trackFocus } from './lib/focusMemory'
import { initSpatialNav } from './lib/spatialNav'
import { Detail } from './pages/Detail'
import { Discover } from './pages/Discover'
import { History } from './pages/History'
import { Home } from './pages/Home'
import { MyList } from './pages/MyList'
import { Search } from './pages/Search'
import { Settings } from './pages/Settings'

// El reproductor (con hls.js) se descarga recién al dar play: la portada carga más liviana.
const Player = lazy(() => import('./pages/Player').then((m) => ({ default: m.Player })))
const Calendar = lazy(() => import('./pages/Calendar').then((m) => ({ default: m.Calendar })))
const YearReview = lazy(() => import('./pages/YearReview').then((m) => ({ default: m.YearReview })))
const Diary = lazy(() => import('./pages/Diary').then((m) => ({ default: m.Diary })))
const Goals = lazy(() => import('./pages/Goals').then((m) => ({ default: m.Goals })))
const Person = lazy(() => import('./pages/Person').then((m) => ({ default: m.Person })))
const Together = lazy(() => import('./pages/Together').then((m) => ({ default: m.Together })))
const ListsIndex = lazy(() => import('./pages/Lists').then((m) => ({ default: m.ListsIndex })))
const ListPage = lazy(() => import('./pages/Lists').then((m) => ({ default: m.ListPage })))
const LiveTv = lazy(() => import('./pages/LiveTv').then((m) => ({ default: m.LiveTv })))
const CatalogManager = lazy(() => import('./pages/CatalogManager').then((m) => ({ default: m.CatalogManager })))

const pageFallback = <div className="page"><div className="spinner" /></div>

function SpatialNav() {
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => initSpatialNav(() => location.pathname !== '/' && navigate(-1)), [navigate, location.pathname])
  return null
}

/** Atajos de teclado globales ("/", "?", "T", "G" + letra); necesita el router, por eso es un componente. */
function GlobalShortcuts() {
  useGlobalShortcuts()
  return null
}

/**
 * Scroll y foco al cambiar de pantalla. Al entrar a una nueva (PUSH) se arranca arriba, como siempre;
 * al volver (POP, "Atrás") se restaura el scroll y el foco guardados de esa pantalla, así en la TV el
 * cursor vuelve al póster o episodio del que saliste. Lo que se guarda es de la pantalla que se deja.
 */
function ScrollMemory() {
  const location = useLocation()
  const type = useNavigationType()
  const prev = useRef<{ key: string; pathname: string } | undefined>(undefined)
  useEffect(trackFocus, [])
  // Con useLayoutEffect: antes de que la pantalla nueva enfoque algo (un autoFocus), así lo
  // que se guarda es el foco de la pantalla que se deja.
  useLayoutEffect(() => {
    const before = prev.current
    prev.current = { key: location.key, pathname: location.pathname }
    if (before && before.key !== location.key) saveFocus(before.key)
    if (type === 'POP') {
      if (!restoreFocus(location.key)) window.scrollTo(0, 0)
      return
    }
    resetFocus()
    // REPLACE en la misma pantalla (ej. la búsqueda que actualiza "?q=") no mueve nada.
    if (type === 'PUSH' || before?.pathname !== location.pathname) window.scrollTo(0, 0)
  }, [location.key])
  return null
}

export function App() {
  return (
    <BrowserRouter>
      <SpatialNav />
      <GlobalShortcuts />
      <ScrollMemory />
      <ErrorBoundary keepMounted>
        <Screensaver />
        <Onboarding />
        {/* Después del asistente: la guía de la TV espera a que cierre y la ayuda "?" va encima de todo. */}
        <TvHints />
        <ShortcutsHelp />
        <UpdateToast />
        <Routes>
          <Route
            path="/watch/:type/:id"
            element={
              <ErrorBoundary>
                <Suspense fallback={<div className="player"><div className="player-spinner" /></div>}>
                  <Player />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="discover/:type" element={<Discover />} />
            <Route path="search" element={<Search />} />
            <Route path="detail/:type/:id" element={<Detail />} />
            <Route path="person/:id" element={<Suspense fallback={pageFallback}><Person /></Suspense>} />
            <Route path="together" element={<Suspense fallback={pageFallback}><Together /></Suspense>} />
            <Route path="lists" element={<Suspense fallback={pageFallback}><ListsIndex /></Suspense>} />
            <Route path="lists/:id" element={<Suspense fallback={pageFallback}><ListPage /></Suspense>} />
            <Route path="tv" element={<Suspense fallback={pageFallback}><LiveTv /></Suspense>} />
            <Route path="list" element={<MyList />} />
            <Route path="history" element={<History />} />
            <Route path="history/year" element={<Suspense fallback={pageFallback}><YearReview /></Suspense>} />
            <Route path="history/diary" element={<Suspense fallback={pageFallback}><Diary /></Suspense>} />
            <Route path="history/goals" element={<Suspense fallback={pageFallback}><Goals /></Suspense>} />
            <Route path="calendar" element={<Suspense fallback={pageFallback}><Calendar /></Suspense>} />
            <Route path="settings" element={<Settings />} />
            <Route path="settings/catalogs" element={<Suspense fallback={pageFallback}><CatalogManager /></Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
