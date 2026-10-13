import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Layout } from './components/Layout'
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
const Person = lazy(() => import('./pages/Person').then((m) => ({ default: m.Person })))
const CatalogManager = lazy(() => import('./pages/CatalogManager').then((m) => ({ default: m.CatalogManager })))

const pageFallback = <div className="page"><div className="spinner" /></div>

function SpatialNav() {
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => initSpatialNav(() => location.pathname !== '/' && navigate(-1)), [navigate, location.pathname])
  return null
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  return null
}

export function App() {
  return (
    <BrowserRouter>
      <SpatialNav />
      <ScrollToTop />
      <Routes>
        <Route
          path="/watch/:type/:id"
          element={
            <Suspense fallback={<div className="player"><div className="player-spinner" /></div>}>
              <Player />
            </Suspense>
          }
        />
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="discover/:type" element={<Discover />} />
          <Route path="search" element={<Search />} />
          <Route path="detail/:type/:id" element={<Detail />} />
          <Route path="person/:id" element={<Suspense fallback={pageFallback}><Person /></Suspense>} />
          <Route path="list" element={<MyList />} />
          <Route path="history" element={<History />} />
          <Route path="history/year" element={<Suspense fallback={pageFallback}><YearReview /></Suspense>} />
          <Route path="calendar" element={<Suspense fallback={pageFallback}><Calendar /></Suspense>} />
          <Route path="settings" element={<Settings />} />
          <Route path="settings/catalogs" element={<Suspense fallback={pageFallback}><CatalogManager /></Suspense>} />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
