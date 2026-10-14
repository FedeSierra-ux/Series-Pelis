import { HttpError } from './cache'

// Los errores del navegador llegan en inglés y con jerga ("Failed to fetch", "signal is aborted without
// reason", "HTTP 503 en https://…"). Esto los pasa a algo que se entienda en la pantalla.

/** `true` cuando el navegador dice que no hay conexión (en Node o sin `navigator`, se asume que hay). */
export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/** Error al cargar una parte de la app que todavía no se descargó (chunk de `import()` que falló). */
export function isChunkLoadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '')
  return /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|failed to load module script/i.test(
    message,
  )
}

const OFFLINE_TEXT = 'Sin conexión: revisá internet y probá de nuevo.'

export function errorText(err: unknown): string {
  // Sin internet, cualquier pedido que no llegó a un servidor es eso, no "el servidor puede estar caído".
  if (isOffline() && !(err instanceof HttpError)) return OFFLINE_TEXT
  if (err instanceof HttpError) {
    if (err.status === 404) return 'No se encontró (el servidor respondió 404).'
    if (err.status === 401 || err.status === 403) return 'El servidor rechazó el pedido: puede que la URL o la cuenta del addon ya no sean válidas.'
    if (err.status === 429) return 'Demasiados pedidos seguidos. Esperá un rato y probá de nuevo.'
    if (err.status >= 500) return 'El servidor tiene un problema ahora. Probá de nuevo en un rato.'
    return `El servidor respondió con un error (${err.status}).`
  }
  const name = err instanceof Error ? err.name : ''
  const message = err instanceof Error ? err.message : String(err ?? '')
  if (name === 'AbortError' || name === 'TimeoutError' || /abort|timed? ?out/i.test(message)) {
    return 'Tardó demasiado en responder. Probá de nuevo en un rato.'
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return 'No se pudo conectar: revisá la conexión, o el servidor puede estar caído o no permitir el acceso.'
  }
  if (err instanceof SyntaxError || /unexpected token|not valid json|json\.parse/i.test(message)) {
    return 'La respuesta no tiene el formato esperado.'
  }
  return message || 'Error desconocido.'
}

const PLAIN_HOST = /^(localhost|[\w-]+(\.[\w-]+)+|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i

/**
 * Por qué una URL de manifest (ya limpiada por `normalizeManifestUrl`) no sirve, o `undefined` si parece bien.
 * Antes "hola" se convertía en `https://hola/manifest.json` y el error decía "No se pudo conectar…".
 */
export function addonUrlProblem(url: string): string | undefined {
  const bad = 'La URL no es válida: pegá la dirección del manifest del addon (https://…/manifest.json).'
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return bad
    if (!PLAIN_HOST.test(u.hostname)) return bad
    return undefined
  } catch {
    return bad
  }
}

/**
 * Error al importar una copia desde un archivo (auditoría de uso #7). `errorText` habla de "la respuesta"
 * de un servidor; acá el problema es el archivo que eligió el usuario.
 */
export function importErrorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? '')
  if (err instanceof SyntaxError || /unexpected (token|end)|not valid json|json\.parse|unterminated/i.test(message)) {
    return 'El archivo no es una copia válida: está incompleto o no es un JSON. Volvé a descargar la copia en el otro dispositivo.'
  }
  if (err instanceof DOMException || /could not be read|notreadable|permission/i.test(message)) {
    return 'No se pudo leer el archivo. Probá elegirlo de nuevo.'
  }
  return message || 'El archivo no se pudo importar.'
}
