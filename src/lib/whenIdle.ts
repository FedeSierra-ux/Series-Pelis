// Correr algo "cuando el navegador no tenga nada mejor que hacer" (v0.36, sistema-05): el tráiler de fondo de
// Películas/Series/ficha monta un iframe de YouTube (~1 MB y mucho JS de terceros) y, con la CPU lenta de una
// TV, eso se cruza con las primeras flechas del usuario. Lógica pura con relojes inyectables para probarla.

export interface WhenIdleOptions {
  /** Tope de espera hasta que el navegador esté ocioso (requestIdleCallback `timeout`); sin él, sin tope. */
  timeoutMs?: number
  /** Esperar a que pasen estos ms sin teclas (modo TV: no se monta nada entre flechas seguidas). 0 = no esperar. */
  quietKeysMs?: number
  /** Inyectables (pruebas). */
  now?: () => number
  lastKeyAt?: () => number
  requestIdle?: (fn: () => void, opts: { timeout: number }) => unknown
  cancelIdle?: (handle: unknown) => void
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

let lastKey = 0
// Se anota al cargar el módulo, en `window` y en captura: cualquier tecla cuenta, aunque otro manejador
// (los avisos de la TV, la navegación con flechas) le corte el paso después.
if (typeof window !== 'undefined') window.addEventListener('keydown', () => (lastKey = Date.now()), { capture: true, passive: true })

/** Corre `fn` en un momento ocioso (o a lo sumo en `timeoutMs`). Devuelve la función que lo cancela. */
export function whenIdle(fn: () => void, opts: WhenIdleOptions = {}): () => void {
  const { timeoutMs = 2000, quietKeysMs = 0 } = opts
  const now = opts.now ?? Date.now
  const keyAt = opts.lastKeyAt ?? (() => lastKey)
  const ric = opts.requestIdle ?? (typeof requestIdleCallback === 'function' ? (f, o) => requestIdleCallback(f, o) : undefined)
  const cic = opts.cancelIdle ?? ((h) => cancelIdleCallback(h as number))
  const setT = opts.setTimer ?? ((f, ms) => setTimeout(f, ms))
  const clearT = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))

  let cancelled = false
  let idle: unknown
  let timer: unknown
  const run = () => {
    if (cancelled) return
    // TV: con una tecla reciente se espera lo que falta de la pausa (cada flecha reinicia la cuenta).
    const wait = quietKeysMs - (now() - keyAt())
    if (quietKeysMs > 0 && keyAt() > 0 && wait > 0) {
      timer = setT(run, wait)
      return
    }
    fn()
  }
  // Safari no tiene requestIdleCallback: un temporizador corto hace de "ocioso".
  if (ric) idle = ric(run, { timeout: timeoutMs })
  else timer = setT(run, 200)
  return () => {
    cancelled = true
    if (idle !== undefined) cic(idle)
    if (timer !== undefined) clearT(timer)
  }
}
