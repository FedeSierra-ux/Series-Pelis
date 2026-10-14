// Señales de corte para `fetch` que andan también en navegadores de TV viejos.
// `AbortSignal.timeout` llegó recién en Chromium 103 y `AbortSignal.any` en el 116: en un webOS 5/6
// (Chromium 68-79) o un Tizen 5.5/6 (Chromium 63-76) no existen y tiran TypeError. Acá se arman con
// `AbortController` + `setTimeout`, que existen desde siempre.

export interface TimeoutSignal {
  signal: AbortSignal
  /** Suelta el temporizador y el listener de `outer` (llamarlo al terminar, haya o no error). */
  clear: () => void
}

/** Error con el mismo nombre que usa el navegador, así `errorText` lo reconoce como "tardó demasiado". */
function timeoutError(): Error {
  try {
    return new DOMException('Se agotó el tiempo de espera', 'TimeoutError')
  } catch {
    const err = new Error('Se agotó el tiempo de espera')
    err.name = 'TimeoutError'
    return err
  }
}

/**
 * Señal que se corta sola a los `ms` milisegundos o cuando se corta `outer` (lo que pase primero).
 * Siempre llamar a `clear()` al terminar el pedido para no dejar temporizadores colgados.
 */
export function timeoutSignal(ms: number, outer?: AbortSignal): TimeoutSignal {
  const ctrl = new AbortController()
  const abort = (reason?: unknown) => {
    if (ctrl.signal.aborted) return
    // `abort(reason)` es de Chromium 98+; en los viejos el argumento se ignora y queda un AbortError.
    ctrl.abort(reason)
  }
  const timer = setTimeout(() => abort(timeoutError()), ms)
  const onOuter = () => abort(outer?.reason)
  if (outer) {
    if (outer.aborted) onOuter()
    else outer.addEventListener('abort', onOuter)
  }
  return {
    signal: ctrl.signal,
    clear: () => {
      clearTimeout(timer)
      outer?.removeEventListener('abort', onOuter)
    },
  }
}

/** `fetch` con corte por tiempo (y opcionalmente por una señal de afuera) que funciona en cualquier navegador. */
export async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit & { timeoutMs: number }): Promise<Response> {
  const { timeoutMs, signal, ...rest } = init
  const t = timeoutSignal(timeoutMs, signal ?? undefined)
  try {
    return await fetch(input, { ...rest, signal: t.signal })
  } finally {
    t.clear()
  }
}

/** ¿El error es porque se cortó el pedido a propósito (no por tiempo ni por la red)? */
export function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError'
}
