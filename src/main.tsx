import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { checkAuth } from './lib/auth'
import { initCloudSync } from './lib/cloudSync'
import { initDiagnostics, probeReportServer } from './lib/diagnostics'
import { loadLocalTitles } from './lib/localTitlesStore'
import { initNative } from './lib/native'
import { hydrateStores } from './lib/store'
import { initProfileWatch } from './lib/profileSwitch'
import { watchProfileChange } from './lib/profiles'
import { probeServerTmdb } from './lib/tmdb'
import { dropThemeMirror } from './lib/theme'
import { syncTvAttr } from './lib/tv'
// Fuentes empaquetadas, estáticas (v0.36, sistema-04): van en el CSS inicial y no en una cascada de `import()`.
// Los mismos pesos que antes: DM Sans 400/500/700 y Sora 700/800.
import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-700.css'
import '@fontsource/sora/latin-700.css'
import '@fontsource/sora/latin-800.css'
import './styles.css'
import './a11y.css'

// App de Android TV: el botón Atrás del control llega por acá (en el navegador no hace nada).
initNative()
dropThemeMirror()
// ¿El sitio trae TMDB (secreto en Cloudflare)? En paralelo: no frena el arranque.
void probeServerTmdb()
// ¿El sitio acepta informes de errores (KV REPORTS en Cloudflare)? Igual: en paralelo.
void probeReportServer()

// Después de publicar una versión nueva, las partes viejas de la app ya no existen en el servidor
// y abrir el reproductor o una página fallaba. Recargamos una sola vez para traer la versión nueva.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('sp-reload-at') || 0)
    if (Date.now() - last < 30_000) return
    sessionStorage.setItem('sp-reload-at', String(Date.now()))
  } catch {
    return
  }
  event.preventDefault()
  location.reload()
})

// Leemos los datos guardados antes de pintar (tarda unos milisegundos) para que
// "Seguir viendo" y los addons aparezcan en el primer render. Los nombres en español (v0.28) también: así no
// aparece el original y enseguida cambia.
Promise.all([hydrateStores(), loadLocalTitles()]).finally(() => {
  // Errores globales → informe (solo si el ajuste está activo) y reintento de los que quedaron en cola.
  initDiagnostics()
  // `data-tv` en <html>: letras y controles grandes para mirar desde el sillón.
  syncTvAttr()
  // Login "Código de casa" (v0.17): pregunta si hay sesión y, con sesión, sincroniza con la casa.
  // Sin la base en el sitio (o en local con Vite) no hace nada.
  void checkAuth()
  initCloudSync()
  // Perfiles (v0.18): si otra pestaña cambia de perfil, esta recarga; si borran un perfil, se van sus datos.
  watchProfileChange()
  initProfileWatch()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
