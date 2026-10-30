// Hay un solo diseño (el que antes era el "Tema 2"). `data-theme="2"` va fijo en el <html> de
// index.html y todo src/theme2.css cuelga de ese atributo, por encima de la base de styles.css.
//
// Las fuentes (Sora y DM Sans, empaquetadas: andan sin conexión) se importan de forma estática en main.tsx:
// entran en el CSS inicial. Hasta la v0.35 se pedían con `import()` después de arrancar la app y el texto
// esperaba ~1 s con la fuente del sistema antes del cambio (cascada de 4 niveles).

let cleaned = false

/** Borra el espejo de localStorage que usaba el arranque cuando había selector de tema. */
export function dropThemeMirror() {
  if (cleaned) return
  cleaned = true
  try {
    localStorage.removeItem('sp-theme')
  } catch {
    // localStorage bloqueado: no importa.
  }
}
