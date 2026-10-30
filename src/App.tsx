import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { AppUpdateToast } from './components/AppUpdateToast'
import { AuthGate } from './components/AuthGate'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Theme2Layout as Layout } from './components/Theme2Layout'
import { Onboarding } from './components/Onboarding'
import { RouteAnnouncer } from './components/RouteAnnouncer'
import { Screensaver } from './components/Screensaver'
import { ShortcutsHelp, useGlobalShortcuts } from './components/ShortcutsHelp'
import { TvHints } from './components/TvHints'
import { NativeHomeSync } from './components/NativeHomeSync'
import { NativeLaunch } from './components/NativeLaunch'
import { UpdateToast } from './components/UpdateToast'
import { ViewTransitionRouter } from './components/ViewTransitionRouter'
import { StorageWarning } from './components/StorageWarning'
import { resetFocus, restoreFocus, restorePending, saveFocus, trackFocus } from './lib/focusMemory'
import { firstVisibleCard, focusInitialWhenReady, initialFocusElement, initSpatialNav, isTv, ladderBack, revealRestored } from './lib/spatialNav'
import { nativeExit } from './lib/native'
import { Detail } from './pages/Detail'
import { Discover } from './pages/Discover'
import { History } from './pages/History'
import { Me } from './pages/Me'
import { Home } from './pages/Home'
import { Search } from './pages/Search'
// El CSS de Ajustes queda en el CSS inicial aunque la página sea lazy: un CSS cargado después de a11y.css/theme2.css
// cambiaría la cascada (v0.36: en el celular corría 12 px la lista de secciones).
import './pages/settings/settings-layout.css'
import { ProfileGate } from './pages/profiles/ProfileGate'
import { Spinner } from './components/Spinner'
import { LazyJoinPage } from './pages/auth/lazyAuth'

// El reproductor (con hls.js) se descarga recién al dar play: la portada carga más liviana.
const Player = lazy(() => import('./pages/Player').then((m) => ({ default: m.Player })))
const Calendar = lazy(() => import('./pages/Calendar').then((m) => ({ default: m.Calendar })))
const YearReview = lazy(() => import('./pages/YearReview').then((m) => ({ default: m.YearReview })))
const Goals = lazy(() => import('./pages/Goals').then((m) => ({ default: m.Goals })))
const Person = lazy(() => import('./pages/Person').then((m) => ({ default: m.Person })))
const Together = lazy(() => import('./pages/Together').then((m) => ({ default: m.Together })))
const ListsIndex = lazy(() => import('./pages/Lists').then((m) => ({ default: m.ListsIndex })))
const ListPage = lazy(() => import('./pages/Lists').then((m) => ({ default: m.ListPage })))
const LinkDevice = lazy(() => import('./pages/auth/LinkDevice').then((m) => ({ default: m.LinkDevice })))
// v0.36 (sistema-13): Ajustes (~55 KB) tampoco entra en el paquete inicial.
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))
const CatalogManager = lazy(() => import('./pages/CatalogManager').then((m) => ({ default: m.CatalogManager })))

const pageFallback = <div className="page"><Spinner /></div>

function SpatialNav() {
  const navigate = useNavigate()
  const location = useLocation()
  // "Atrás" en escalera en Inicio, Películas, Series y Mi lista: arriba de la pantalla, después el riel
  // y recién después lo de siempre (volver; en Inicio, nada, salvo en la app de TV, que se va al fondo).
  // Devuelve la limpieza a propósito.
  useEffect(
    () =>
      initSpatialNav(() => {
        if (ladderBack(location.pathname)) return
        if (location.pathname !== '/') navigate(-1)
        else nativeExit()
      }),
    [navigate, location.pathname],
  )
  return null
}

/** Atajos de teclado globales ("/", "?", "G" + letra); necesita el router, por eso es un componente. */
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
      // Si lo guardado ya no está (ej. la ficha vuelve del autoplay en otro episodio, tv-15): en la TV la primera
      // tarjeta a la vista o lo primero de la pantalla; en PC solo al volver del reproductor (a11y-08), el botón
      // principal de la ficha. En el resto de la PC, como siempre (nada).
      const fromPlayer = !!before?.pathname.startsWith('/watch')
      const fallback = () => firstVisibleCard() ?? (isTv() || fromPlayer ? initialFocusElement() : undefined)
      if (!restoreFocus(location.key, { reveal: revealRestored, fallback })) window.scrollTo(0, 0)
      // Sin nada que restaurar, en la TV se enfoca lo primero de la pantalla cuando aparezca (tv-04).
      if (isTv() && !restorePending()) return focusInitialWhenReady()
      return
    }
    resetFocus()
    // REPLACE en la misma pantalla (ej. la búsqueda que actualiza "?q=") no mueve nada.
    if (type === 'PUSH' || before?.pathname !== location.pathname) window.scrollTo(0, 0)
    // tv-04: en la TV, al entrar a una pantalla nueva el cursor aparece solo (en lo marcado con `data-autofocus`,
    // ej. el "Reproducir" de la ficha) en vez de esperar a la primera flecha. Devuelve la cancelación a propósito.
    if (isTv() && (type === 'PUSH' || before?.pathname !== location.pathname)) return focusInitialWhenReady()
  }, [location.key])
  return null
}

export function App() {
  return (
    // Como BrowserRouter, con transiciones entre pantallas (View Transitions) donde el navegador las tenga.
    <ViewTransitionRouter>
      <SpatialNav />
      <GlobalShortcuts />
      <ScrollMemory />
      <RouteAnnouncer />
      <ErrorBoundary keepMounted>
        {/* Con casas (v0.17), antes de todo la pantalla de entrada. */}
        <AuthGate>
          <Screensaver />
          {/* Perfiles (v0.18): "¿Quién está mirando?" en la TV al abrir y después del protector. */}
          <ProfileGate />
          <Onboarding />
          {/* Después del asistente: la guía de la TV espera a que cierre y la ayuda "?" va encima de todo. */}
          <TvHints />
          <ShortcutsHelp />
          <UpdateToast />
          {/* App de Android TV (v0.21): actualizarse sola, filas del inicio de la TV y abrir desde ellas. */}
          <AppUpdateToast />
          <NativeHomeSync />
          <NativeLaunch />
          <StorageWarning />
          <Routes>
            <Route
              path="/watch/:type/:id"
              element={
                <ErrorBoundary>
                  <Suspense fallback={<div className="player"><div className="player-spinner" role="status"><span className="sp-sr-only">Cargando…</span></div></div>}>
                    <Player />
                  </Suspense>
                </ErrorBoundary>
              }
            />
            <Route path="/unirse" element={<Suspense fallback={pageFallback}><LazyJoinPage /></Suspense>} />
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="discover/:type" element={<Discover />} />
              <Route path="search" element={<Search />} />
              <Route path="detail/:type/:id" element={<Detail />} />
              <Route path="person/:id" element={<Suspense fallback={pageFallback}><Person /></Suspense>} />
              <Route path="together" element={<Suspense fallback={pageFallback}><Together /></Suspense>} />
              <Route path="lists" element={<Suspense fallback={pageFallback}><ListsIndex /></Suspense>} />
              <Route path="lists/:id" element={<Suspense fallback={pageFallback}><ListPage /></Suspense>} />
              {/* v0.24: TV en vivo se sacó (pedido del usuario); el link viejo va a Inicio. */}
              <Route path="tv" element={<Navigate to="/" replace />} />
              {/* v0.23: Mi lista vive en Vos y el Diario se unificó con el Historial. */}
              <Route path="list" element={<Navigate to="/me" replace />} />
              <Route path="me" element={<Me />} />
              <Route path="history" element={<History />} />
              <Route path="history/year" element={<Suspense fallback={pageFallback}><YearReview /></Suspense>} />
              <Route path="history/diary" element={<Navigate to="/history" replace />} />
              <Route path="history/goals" element={<Suspense fallback={pageFallback}><Goals /></Suspense>} />
              <Route path="calendar" element={<Suspense fallback={pageFallback}><Calendar /></Suspense>} />
              <Route path="settings" element={<Suspense fallback={pageFallback}><Settings /></Suspense>} />
              <Route path="vincular" element={<Suspense fallback={pageFallback}><LinkDevice /></Suspense>} />
              <Route path="settings/catalogs" element={<Suspense fallback={pageFallback}><CatalogManager /></Suspense>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </AuthGate>
      </ErrorBoundary>
    </ViewTransitionRouter>
  )
}
