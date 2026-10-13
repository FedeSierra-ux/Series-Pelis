import { HttpError } from './cache'

// Los errores del navegador llegan en inglés y con jerga ("Failed to fetch", "signal is aborted without
// reason", "HTTP 503 en https://…"). Esto los pasa a algo que se entienda en la pantalla.

export function errorText(err: unknown): string {
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
