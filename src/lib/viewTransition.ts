// Transiciones entre pantallas (v0.14, U3) con la View Transitions API: un fundido corto entre páginas y el
// póster tocado que "vuela" a la imagen de la ficha. Sin soporte (TVs viejas, Firefox viejo) o con
// "reducir movimiento" todo queda como antes: un corte seco.

/** Clase que le da `view-transition-name: sp-poster` (ver components/view-transitions.css). */
export const SHARED_CLASS = 'vt-shared'

export interface RouteLike {
  pathname: string
}

/** Rutas sin transición: el reproductor (video y pantalla completa) no se fotografía. */
const NO_TRANSITION = /^\/watch\//

/** ¿Animar este cambio de pantalla? Solo si cambia la ruta (no por `?q=` o `?season=`). */
export function shouldAnimate(from: RouteLike, to: RouteLike, env: { supported: boolean; reducedMotion: boolean }): boolean {
  if (!env.supported || env.reducedMotion) return false
  if (from.pathname === to.pathname) return false
  return !NO_TRANSITION.test(from.pathname) && !NO_TRANSITION.test(to.pathname)
}

export const isDetail = (pathname: string) => pathname.startsWith('/detail/')

/** Id del título de una ruta `/detail/:type/:id` (el router lo guarda codificado en la URL). */
export function detailIdOf(pathname: string): string | undefined {
  const m = /^\/detail\/[^/]+\/([^/?#]+)/.exec(pathname)
  if (!m) return undefined
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

/**
 * Qué transición compartida corresponde: ida (de un póster a la ficha), vuelta (de la ficha al póster) o
 * ninguna. Entre dos fichas (recomendados) también es "ida": el póster tocado vuela a la ficha nueva.
 */
export function sharedKind(from: RouteLike, to: RouteLike, tappedPoster: boolean): 'enter' | 'back' | undefined {
  if (isDetail(to.pathname) && tappedPoster) return 'enter'
  if (isDetail(from.pathname) && !isDetail(to.pathname)) return 'back'
  return undefined
}

// ---------- Navegador ----------

type DocWithVT = Document & { startViewTransition?: (cb: () => Promise<void> | void) => { finished: Promise<void> } }

export function viewTransitionsSupported(): boolean {
  return typeof document !== 'undefined' && typeof (document as DocWithVT).startViewTransition === 'function'
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function startViewTransition(update: () => Promise<void>): { finished: Promise<void> } | undefined {
  const start = (document as DocWithVT).startViewTransition
  if (typeof start !== 'function') return undefined
  return start.call(document, update)
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Espera (con tope) a que aparezca un elemento: la ficha a veces pinta el póster un instante después. */
export async function waitFor<T extends Element>(find: () => T | null | undefined, maxMs: number): Promise<T | undefined> {
  const until = performance.now() + maxMs
  for (;;) {
    const el = find()
    if (el) return el
    if (performance.now() >= until) return undefined
    // Con setTimeout y no requestAnimationFrame: durante la transición el navegador no pinta y rAF no corre
    // (la espera se colgaba hasta el tope de 4 s del navegador).
    await sleep(16)
  }
}

/** Espera a que la imagen esté lista para pintar (con tope, para no congelar la pantalla). */
export async function imageReady(img: HTMLImageElement, maxMs: number): Promise<void> {
  if (img.complete && img.naturalWidth > 0) return
  await Promise.race([img.decode().catch(() => {}), sleep(maxMs)])
}

/** Le saca la marca a todo menos a `keep` (dos elementos con el mismo nombre cancelan la transición). */
export function clearShared(keep?: Element) {
  document.querySelectorAll(`.${SHARED_CLASS}`).forEach((el) => el !== keep && el.classList.remove(SHARED_CLASS))
}

let tapped: { img: HTMLImageElement; at: number } | undefined

/** El último póster tocado (clic, toque o OK del control), si fue recién. */
export function takeTappedPoster(maxAgeMs = 1000): HTMLImageElement | undefined {
  const t = tapped
  tapped = undefined
  if (!t || performance.now() - t.at > maxAgeMs || !t.img.isConnected) return undefined
  return t.img
}

/** Escucha los clics en pósters (fase de captura, antes de que el router navegue). Devuelve cómo dejar de escuchar. */
export function trackPosterTaps(): () => void {
  const onClick = (e: MouseEvent) => {
    const card = (e.target as Element | null)?.closest?.('a.poster-card')
    const img = card?.querySelector<HTMLImageElement>('img')
    tapped = img ? { img, at: performance.now() } : undefined
  }
  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}

/** Póster de la grilla que corresponde a un título (para la vuelta desde la ficha). */
export function posterFor(id: string): HTMLImageElement | undefined {
  const sel = `a.poster-card[data-focus-id="${CSS.escape(id)}"] img`
  const img = document.querySelector<HTMLImageElement>(sel)
  if (!img) return undefined
  // Solo si se ve: volar hacia algo fuera de la pantalla queda raro.
  const r = img.getBoundingClientRect()
  return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth ? img : undefined
}
