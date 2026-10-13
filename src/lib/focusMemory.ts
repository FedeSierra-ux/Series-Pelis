// Memoria de foco y scroll por pantalla (control remoto): al volver con "Atrás", la página aparece
// donde estaba y el foco vuelve al póster o episodio del que saliste, no al "Ver ahora" de arriba.
//
// La parte pura (guardar / recuperar con tope) no toca el DOM, así se puede probar sola.

export interface FocusSnapshot {
  /** Selector CSS del elemento enfocado (o nada si no había foco). */
  focus?: string
  scrollY: number
}

export interface SnapshotStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const STORAGE_KEY = 'sp-focus-memory'
/** Pantallas que se recuerdan (las más viejas se descartan). */
export const MAX_ENTRIES = 30

type Entries = Record<string, FocusSnapshot>

function readAll(store: SnapshotStore): Entries {
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Entries) : {}
  } catch {
    return {}
  }
}

function writeAll(store: SnapshotStore, entries: Entries) {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Sin espacio o sin sessionStorage (modo privado): la app sigue sin memoria de foco.
  }
}

/** Guarda la instantánea de una pantalla. Si se pasa el tope, se descartan las más antiguas. */
export function rememberSnapshot(store: SnapshotStore, key: string, snap: FocusSnapshot) {
  const entries = readAll(store)
  // Volver a guardar la misma clave la deja como la más nueva (el orden de las claves es el de inserción).
  delete entries[key]
  entries[key] = { scrollY: Math.max(0, Math.round(snap.scrollY)), ...(snap.focus ? { focus: snap.focus } : {}) }
  const keys = Object.keys(entries)
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete entries[old]
  writeAll(store, entries)
}

export function recallSnapshot(store: SnapshotStore, key: string): FocusSnapshot | undefined {
  const snap = readAll(store)[key]
  if (!snap || typeof snap.scrollY !== 'number') return undefined
  return snap
}

/** Lo que identifica a un elemento enfocable, sacado de sus atributos. */
export interface FocusIdentity {
  focusId?: string | null
  href?: string | null
  id?: string | null
  dataId?: string | null
}

function quote(value: string) {
  return JSON.stringify(value)
}

/**
 * Selector estable para volver a encontrar el elemento: primero `data-focus-id`, después el `href`
 * del enlace (los pósters), el `id` o `data-id`. Sin nada de eso, no hay selector.
 */
export function selectorFor(identity: FocusIdentity): string | undefined {
  if (identity.focusId) return `[data-focus-id=${quote(identity.focusId)}]`
  if (identity.href) return `a[href=${quote(identity.href)}]`
  if (identity.id) return `[id=${quote(identity.id)}]`
  if (identity.dataId) return `[data-id=${quote(identity.dataId)}]`
  return undefined
}

// ---------- Parte con DOM ----------

const CONTAINER = 'main'

/** Selector del elemento: identidad estable o, si no tiene, su posición dentro de <main>. */
export function describeElement(el: Element): string | undefined {
  const stable = selectorFor({
    focusId: el.getAttribute('data-focus-id'),
    href: el instanceof HTMLAnchorElement ? el.getAttribute('href') : null,
    id: el.id,
    dataId: el.getAttribute('data-id'),
  })
  if (stable) return stable
  // Camino por posición (ej. el botón de un episodio): sirve mientras la lista sea la misma.
  const path: string[] = []
  let node: Element | null = el
  while (node && node.tagName.toLowerCase() !== CONTAINER && node !== document.body && path.length < 12) {
    const parent: Element | null = node.parentElement
    if (!parent) return undefined
    const index = Array.prototype.indexOf.call(parent.children, node) + 1
    path.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`)
    node = parent
  }
  if (!node || node.tagName.toLowerCase() !== CONTAINER) return undefined
  return `${CONTAINER} > ${path.join(' > ')}`
}

function isVisible(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

function find(selector: string): HTMLElement | undefined {
  // Solo dentro de <main>: el mismo href puede estar también en el menú (ej. "/calendar").
  const scope = document.querySelector(CONTAINER) ?? document
  try {
    return Array.from(scope.querySelectorAll<HTMLElement>(selector)).find(isVisible)
  } catch {
    return undefined
  }
}

let lastFocus: string | undefined
let lastScrollY = 0
let listening = false
/** Selector del elemento restaurado en la pantalla actual (la navegación espacial lo prefiere). */
let restored: string | undefined
let cancelPending: (() => void) | undefined

function storage(): SnapshotStore | undefined {
  try {
    return window.sessionStorage
  } catch {
    return undefined
  }
}

/** Sigue el foco y el scroll mientras se usa la página (barato: solo guarda un string y un número). */
export function trackFocus() {
  if (listening || typeof window === 'undefined') return
  listening = true
  lastScrollY = window.scrollY
  document.addEventListener('focusin', (e) => {
    const t = e.target
    if (!(t instanceof Element) || !t.closest(CONTAINER)) return
    lastFocus = describeElement(t)
  })
  window.addEventListener('scroll', () => (lastScrollY = window.scrollY), { passive: true })
}

/** Guarda dónde estaba el usuario en la pantalla que se deja. */
export function saveFocus(key: string) {
  const store = storage()
  if (!store) return
  rememberSnapshot(store, key, { focus: lastFocus, scrollY: lastScrollY })
}

/** La pantalla nueva arranca de cero: nada restaurado, y el foco guardado ya no cuenta. */
export function resetFocus() {
  cancelPending?.()
  restored = undefined
  lastFocus = undefined
}

/** Elemento restaurado para la pantalla actual, si sigue en pantalla. */
export function restoredElement(): HTMLElement | undefined {
  return restored ? find(restored) : undefined
}

const RETRY_MS = 2000

/**
 * Vuelve al scroll y al foco guardados para `key`. Las filas cargan de a poco, así que espera (con
 * requestAnimationFrame, hasta ~2 s) a que el elemento aparezca. Devuelve `false` si no había nada guardado.
 */
export function restoreFocus(key: string): boolean {
  cancelPending?.()
  restored = undefined
  const store = storage()
  const snap = store && recallSnapshot(store, key)
  if (!snap) return false
  window.scrollTo(0, snap.scrollY)
  lastScrollY = snap.scrollY
  if (!snap.focus) return true
  const selector = snap.focus
  restored = selector
  const started = performance.now()
  let raf = 0
  const tick = () => {
    const el = find(selector)
    if (el) {
      cancelPending = undefined
      // El contenido pudo haber cambiado de alto al cargar: volvemos al scroll guardado y enfocamos.
      window.scrollTo(0, snap.scrollY)
      el.focus({ preventScroll: true })
      const r = el.getBoundingClientRect()
      if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'center', inline: 'center' })
      lastFocus = selector
      return
    }
    if (performance.now() - started < RETRY_MS) raf = requestAnimationFrame(tick)
    else cancelPending = undefined
  }
  raf = requestAnimationFrame(tick)
  cancelPending = () => cancelAnimationFrame(raf)
  return true
}
