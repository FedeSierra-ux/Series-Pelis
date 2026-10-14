// Hay un solo diseño (el que antes era el "Tema 2"). `data-theme="2"` va fijo en el <html> de
// index.html y todo src/theme2.css cuelga de ese atributo, por encima de la base de styles.css.

let fontsRequested = false

/** Sora y DM Sans van empaquetadas (andan sin conexión). */
export function loadThemeFonts() {
  if (fontsRequested) return
  fontsRequested = true
  // El selector de tema ya no existe: borramos el espejo que usaba el arranque.
  try {
    localStorage.removeItem('sp-theme')
  } catch {
    // localStorage bloqueado: no importa.
  }
  Promise.all([
    import('@fontsource/dm-sans/latin-400.css'),
    import('@fontsource/dm-sans/latin-500.css'),
    import('@fontsource/dm-sans/latin-700.css'),
    import('@fontsource/sora/latin-700.css'),
    import('@fontsource/sora/latin-800.css'),
  ]).catch(() => {
    // Sin las fuentes se usa la del sistema.
    fontsRequested = false
  })
}
