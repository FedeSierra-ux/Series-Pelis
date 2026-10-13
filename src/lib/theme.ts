import { settingsStore, useStore, type Settings } from './store'

// Tema 1 (clásico) o Tema 2 (nuevo). El tema se marca con `data-theme="2"` en <html> y todo el
// CSS del Tema 2 (src/theme2.css) cuelga de ese atributo: con Tema 1 no cambia nada.
// Además de IndexedDB lo copiamos en localStorage: el script de index.html lo lee antes de
// pintar, así no hay un parpadeo del Tema 1 al abrir la app con el Tema 2.

export type ThemeId = Settings['theme']

/** Clave del espejo en localStorage (la lee el script en línea de index.html). */
export const THEME_STORAGE_KEY = 'sp-theme'

/** Cualquier valor raro (copias viejas, localStorage tocado a mano) vuelve al Tema 1. */
export function normalizeTheme(value: unknown): ThemeId {
  return value === '2' || value === 2 ? '2' : '1'
}

let fontsRequested = false

/** Sora y DM Sans van empaquetadas (andan sin conexión) y solo se descargan con el Tema 2. */
export function loadTheme2Fonts() {
  if (fontsRequested) return
  fontsRequested = true
  Promise.all([
    import('@fontsource/dm-sans/latin-400.css'),
    import('@fontsource/dm-sans/latin-500.css'),
    import('@fontsource/dm-sans/latin-700.css'),
    import('@fontsource/sora/latin-700.css'),
    import('@fontsource/sora/latin-800.css'),
  ]).catch(() => {
    // Sin las fuentes se usa la del sistema; se reintenta la próxima vez que se aplique el tema.
    fontsRequested = false
  })
}

export function applyTheme(value: unknown) {
  const theme = normalizeTheme(value)
  const root = document.documentElement
  if (theme === '2') {
    root.dataset.theme = '2'
    loadTheme2Fonts()
  } else {
    delete root.dataset.theme
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // localStorage bloqueado: solo se pierde el arranque sin parpadeo.
  }
}

/** Si el script de index.html ya puso el Tema 2, pedimos las fuentes enseguida (antes de leer IndexedDB). */
export function preloadThemeFonts() {
  if (document.documentElement.dataset.theme === '2') loadTheme2Fonts()
}

/** Aplica el tema guardado y lo vuelve a aplicar cada vez que cambia en Ajustes. */
export function initTheme() {
  let current = normalizeTheme(settingsStore.get().theme)
  applyTheme(current)
  return settingsStore.subscribe(() => {
    const next = normalizeTheme(settingsStore.get().theme)
    if (next === current) return
    current = next
    applyTheme(next)
  })
}

export function useTheme(): ThemeId {
  return normalizeTheme(useStore(settingsStore).theme)
}
