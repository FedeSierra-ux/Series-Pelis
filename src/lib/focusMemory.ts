// Memoria de foco y scroll por pantalla (control remoto): al volver con "Atrás", la página aparece
// donde estaba y el foco vuelve al póster o episodio del que saliste, no al "Ver ahora" de arriba.
//
// La parte pura (guardar / recuperar con tope) no toca el DOM, así se puede probar sola.

export interface FocusSnapshot {
  /** Selector CSS del elemento enfocado (o nada si no había foco). */
  focus?: string
  scrollY: number
  /** Fila (`data-row-key`) del elemento: el mismo póster puede estar en varias filas de la pantalla. */
  row?: string
  /** Lugar entre los elementos de la pantalla que coinciden con `focus` (respaldo si la fila no está). */
  nth?: number
  /** Scroll horizontal de la fila. */
  rowLeft?: number
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
  entries[key] = {
    scrollY: Math.max(0, Math.round(snap.scrollY)),
    ...(snap.focus ? { focus: snap.focus } : {}),
    ...(snap.focus && snap.row ? { row: snap.row } : {}),
    ...(snap.focus && snap.nth ? { nth: snap.nth } : {}),
    ...(snap.focus && snap.rowLeft ? { rowLeft: Math.round(snap.rowLeft) } : {}),
  }
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

/** Estado de la fila guardada en la pantalla: no está (todavía), cargando (esqueleto) o con sus tarjetas. */
export type RowState = 'missing' | 'loading' | 'ready'

/**
 * Cuál de los elementos que coinciden con el selector enfocar (`rows[i]` = fila de cada uno), o
 * `'wait'` para seguir esperando. Primero el de la fila guardada: el mismo póster puede estar en
 * "Top 10" y en "Para vos". Si esa fila todavía no está o está cargando, se espera; si ya cargó sin
 * él (o se acabó la espera), el que estaba en el mismo lugar entre los iguales. Sin ninguno, -1. Puro.
 */
export function pickMatch(
  rows: (string | undefined)[],
  snap: Pick<FocusSnapshot, 'row' | 'nth'>,
  rowState: RowState,
  timedOut: boolean,
): number | 'wait' {
  if (snap.row !== undefined) {
    const i = rows.indexOf(snap.row)
    if (i >= 0) return i
    if (rowState !== 'ready' && !timedOut) return 'wait'
  }
  if (rows.length === 0) return timedOut ? -1 : 'wait'
  return Math.min(snap.nth ?? 0, rows.length - 1)
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

function findAll(selector: string): HTMLElement[] {
  // Solo dentro de <main>: el mismo href puede estar también en el menú (ej. "/calendar").
  const scope = document.querySelector(CONTAINER) ?? document
  try {
    return Array.from(scope.querySelectorAll<HTMLElement>(selector)).filter(isVisible)
  } catch {
    return []
  }
}

const ROW = '.row[data-row-key]'

function rowKeyOf(el: Element): string | undefined {
  return el.closest(ROW)?.getAttribute('data-row-key') ?? undefined
}

function rowState(key: string | undefined): RowState {
  if (key === undefined) return 'ready'
  const rows = Array.from(document.querySelectorAll(`${CONTAINER} ${ROW}`)).filter((r) => r.getAttribute('data-row-key') === key)
  if (rows.length === 0) return 'missing'
  return rows.some((r) => r.hasAttribute('data-row-loading')) ? 'loading' : 'ready'
}

/** El elemento guardado en la pantalla actual: `'wait'` si su fila todavía no cargó. */
function locate(selector: string, snap: Pick<FocusSnapshot, 'row' | 'nth'>, timedOut: boolean): HTMLElement | 'wait' | undefined {
  const all = findAll(selector)
  const pick = pickMatch(all.map(rowKeyOf), snap, rowState(snap.row), timedOut)
  return pick === 'wait' ? 'wait' : all[pick]
}

let lastFocus: string | undefined
let lastRow: string | undefined
let lastNth = 0
/** La fila del último foco y su scroll horizontal (al guardar, la pantalla vieja ya no está en el DOM). */
let lastScroller: Element | undefined
let lastRowLeft = 0
let lastScrollY = 0
let listening = false
/** Elemento restaurado en la pantalla actual (la navegación espacial lo prefiere). */
let restored: { selector: string; row?: string; nth?: number } | undefined
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
    lastRow = rowKeyOf(t)
    lastNth = lastFocus ? Math.max(0, findAll(lastFocus).indexOf(t as HTMLElement)) : 0
    lastScroller = t.closest('.row-scroller') ?? undefined
    lastRowLeft = lastScroller?.scrollLeft ?? 0
  })
  window.addEventListener('scroll', () => (lastScrollY = window.scrollY), { passive: true })
  // El scroll de las filas no burbujea: se escucha en captura y solo cuenta el de la fila del foco.
  document.addEventListener(
    'scroll',
    (e) => {
      if (e.target === lastScroller) lastRowLeft = (e.target as Element).scrollLeft
    },
    { capture: true, passive: true },
  )
}

/** Guarda dónde estaba el usuario en la pantalla que se deja. */
export function saveFocus(key: string) {
  const store = storage()
  if (!store) return
  rememberSnapshot(store, key, { focus: lastFocus, scrollY: lastScrollY, row: lastRow, nth: lastNth, rowLeft: lastRowLeft })
}

/** La pantalla nueva arranca de cero: nada restaurado, y el foco guardado ya no cuenta. */
export function resetFocus() {
  cancelPending?.()
  restored = undefined
  lastFocus = undefined
  lastRow = undefined
  lastNth = 0
  lastScroller = undefined
  lastRowLeft = 0
}

/** Elemento restaurado para la pantalla actual, si sigue en pantalla. */
export function restoredElement(): HTMLElement | undefined {
  if (!restored) return undefined
  const el = locate(restored.selector, restored, true)
  return el === 'wait' ? undefined : el
}

/** Lo que se espera a que aparezca el elemento: las filas lejanas cargan cuando se acercan (a veces >5 s). */
export const RETRY_MS = 8000

/**
 * ¿Hay que volver a centrar el elemento? Sí si se sale por abajo o si su parte de arriba queda tapada por lo
 * fijo de arriba (`top` = alto de la portada fija, o 0). Puro, para poder probarlo.
 */
export function needsReveal(
  rect: { top: number; bottom: number; left?: number; right?: number },
  top: number,
  viewportHeight: number,
  /** Lo visible de la fila en x: un póster fuera de ella (scroll horizontal) también hay que traerlo. */
  row?: { left: number; right: number },
): boolean {
  if (rect.top < top || rect.bottom > viewportHeight) return true
  if (!row || rect.left === undefined || rect.right === undefined) return false
  return rect.left < row.left - 1 || rect.right > row.right + 1
}

/** Desde dónde se ve la página: 0, o el alto de lo fijo de arriba si la pantalla lo declara con `scroll-padding-top`. */
function visibleTop(): number {
  return parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
}

/** Lo que apaga la sombra de una portada fija justo debajo de ella (`bh-edge` en discover/browse.css). */
const SHADE_PX = 80

/** ¿Quedó a la vista lo restaurado? Con la fila: su título fuera de la portada fija y su sombra, y el póster dentro de la fila. */
function revealNeeded(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  const top = visibleTop()
  const scroller = el.closest('.row-scroller')
  const head = scroller?.closest('.row')?.querySelector('.row-header')
  const box = {
    top: Math.min(rect.top, head ? head.getBoundingClientRect().top - (top > 0 ? SHADE_PX : 0) : rect.top),
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
  }
  return needsReveal(box, top, window.innerHeight, scroller?.getBoundingClientRect())
}

export interface RestoreOptions {
  /** Cómo traer a la vista lo restaurado (`needed`: no se ve entero). Sin esto, centrado si hace falta. */
  reveal?: (el: HTMLElement, needed: boolean) => void
  /** Qué enfocar si lo guardado no aparece (ej. la primera tarjeta visible en la TV). */
  fallback?: () => HTMLElement | undefined
}

const STOP_EVENTS = ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const

/**
 * Vuelve al scroll y al foco guardados para `key`. Las filas cargan de a poco, así que espera (con
 * requestAnimationFrame, hasta `RETRY_MS`) a que el elemento aparezca en su fila; si el usuario toca algo
 * antes, se deja de esperar. Devuelve `false` si no había nada guardado.
 */
export function restoreFocus(key: string, options: RestoreOptions = {}): boolean {
  cancelPending?.()
  restored = undefined
  const store = storage()
  const snap = store && recallSnapshot(store, key)
  if (!snap) return false
  window.scrollTo(0, snap.scrollY)
  lastScrollY = snap.scrollY
  if (!snap.focus) return true
  const selector = snap.focus
  restored = { selector, row: snap.row, nth: snap.nth }
  const started = performance.now()
  let raf = 0
  const stop = () => {
    cancelAnimationFrame(raf)
    for (const type of STOP_EVENTS) window.removeEventListener(type, onUser, true)
    cancelPending = undefined
  }
  const onUser = () => stop()
  const land = (el: HTMLElement) => {
    // El contenido pudo haber cambiado de alto al cargar: volvemos al scroll guardado y enfocamos.
    window.scrollTo(0, snap.scrollY)
    const scroller = el.closest('.row-scroller')
    if (scroller && snap.rowLeft) scroller.scrollLeft = snap.rowLeft
    el.focus({ preventScroll: true })
    // Lo que tapa una portada fija (`scroll-padding-top`, ver discover/browse.css) no cuenta como visible.
    const needed = revealNeeded(el)
    if (options.reveal) options.reveal(el, needed)
    else if (needed) el.scrollIntoView({ block: 'center', inline: 'center' })
  }
  const tick = () => {
    const timedOut = performance.now() - started >= RETRY_MS
    const el = locate(selector, snap, timedOut)
    if (el && el !== 'wait') {
      stop()
      land(el)
      return
    }
    if (timedOut) {
      stop()
      const other = document.activeElement === document.body || !document.activeElement ? options.fallback?.() : undefined
      if (other) land(other)
      return
    }
    // La página todavía no llegaba al scroll guardado: a medida que crece, se sigue bajando (así cargan las filas de ahí).
    if (window.scrollY < snap.scrollY - 1) window.scrollTo(0, snap.scrollY)
    raf = requestAnimationFrame(tick)
  }
  for (const type of STOP_EVENTS) window.addEventListener(type, onUser, true)
  raf = requestAnimationFrame(tick)
  cancelPending = stop
  return true
}
