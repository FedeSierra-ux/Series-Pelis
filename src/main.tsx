import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { hydrateStores } from './lib/store'
import { initTheme, preloadThemeFonts } from './lib/theme'
import './styles.css'
import './theme2.css'

preloadThemeFonts()

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
// "Seguir viendo" y los addons aparezcan en el primer render.
hydrateStores().finally(() => {
  initTheme()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
