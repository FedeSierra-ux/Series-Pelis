import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { hydrateStores } from './lib/store'
import { initTheme, preloadThemeFonts } from './lib/theme'
import './styles.css'
import './theme2.css'

preloadThemeFonts()

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
