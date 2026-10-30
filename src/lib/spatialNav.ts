// Navegación con las flechas del control remoto (Fire TV, Android TV, navegador de la TV).
// Busca el elemento enfocable más cercano en la dirección pedida y le pasa el foco.

import { restoredElement } from './focusMemory'

export type Dir = 'up' | 'down' | 'left' | 'right'

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])

// `summary`: el título de un <details> ("Soy el administrador" en el Login, las secciones de Ajustes en el celular).
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, summary, [tabindex]:not([tabindex="-1"])'

function isVisible(el: HTMLElement) {
  // Sin getComputedStyle a propósito: con cientos de pósters en pantalla es lo que más cuesta.
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

function candidates(): HTMLElement[] {
  const scope = document.querySelector<HTMLElement>('[data-nav-scope]') ?? document.body
  // `data-nav-skip`: solo para el mouse (las flechas ‹ › de las filas).
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('data-nav-skip') && isVisible(el))
}

const RAIL = '.t2-rail'
const inRail = (el: Element | null) => !!el?.closest(RAIL)

/**
 * Sin nada enfocado (recién se entró a la pantalla), la primera flecha va al contenido: primero lo
 * marcado con `data-autofocus` (el "Ver ahora" de la portada, el stream recomendado, el episodio
 * elegido) y si no hay, lo primero de <main>. Antes caía en el logo o en el riel del menú.
 */
function initialTarget(els: HTMLElement[]): HTMLElement | undefined {
  if (document.querySelector('[data-nav-scope]')) return els[0]
  const main = document.querySelector('main')
  if (!main) return els[0]
  // Al volver con "Atrás", el póster o episodio del que saliste tiene prioridad.
  const restored = restoredElement()
  if (restored && els.includes(restored)) return restored
  const marked = Array.from(main.querySelectorAll<HTMLElement>('[data-autofocus]')).find(isVisible)
  return marked ?? els.find((el) => main.contains(el)) ?? els[0]
}

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/** Separación entre dos tramos (0 si se superponen). */
function gap(a1: number, a2: number, b1: number, b2: number) {
  return Math.max(0, b1 - a2, a1 - b2)
}

/**
 * Puntaje de un candidato para moverse de `from` a `to` en `dir` (menos es mejor); `undefined` si no
 * sirve. El avance se mide entre centros; el desvío lateral, como la separación entre los dos
 * rectángulos (0 si se superponen en ese eje): una fila de fuentes a todo el ancho debajo de una pestaña
 * angosta gana sobre un botón angosto alineado con la pestaña pero más lejos (antes, de centro a centro,
 * la fila ancha quedaba "desviada" y no se podía llegar). El desvío entre centros solo desempata.
 * Con ← / → y `view` (lo visible de la ventana, en y), lo que no comparte ninguna altura con el origen
 * tiene que estar a la vista: si no, desde un episodio sin nada a la derecha el foco saltaba a la
 * portada, fuera de la pantalla y arriba de todo.
 */
export function navScore(from: Box, to: Box, dir: Dir, view?: { top: number; bottom: number }): number | undefined {
  // Tiene que estar del lado correcto (con una tolerancia chica para elementos superpuestos).
  const ok =
    dir === 'right' ? to.left >= from.right - 4 :
    dir === 'left' ? to.right <= from.left + 4 :
    dir === 'down' ? to.top >= from.bottom - 4 :
    to.bottom <= from.top + 4
  if (!ok) return undefined
  const horizontal = dir === 'left' || dir === 'right'
  const cross = horizontal ? gap(from.top, from.bottom, to.top, to.bottom) : gap(from.left, from.right, to.left, to.right)
  if (horizontal && view && cross > 0 && (to.bottom <= view.top || to.top >= view.bottom)) return undefined
  const fc = { x: (from.left + from.right) / 2, y: (from.top + from.bottom) / 2 }
  const tc = { x: (to.left + to.right) / 2, y: (to.top + to.bottom) / 2 }
  const main = horizontal ? Math.abs(tc.x - fc.x) : Math.abs(tc.y - fc.y)
  const centerCross = horizontal ? Math.abs(tc.y - fc.y) : Math.abs(tc.x - fc.x)
  // Penalizamos el desvío lateral para que se mueva "en línea".
  return main + cross * 2.5 + centerCross * 0.05
}

function best(from: DOMRect, dir: Dir, els: HTMLElement[], current: Element | null): HTMLElement | undefined {
  let winner: HTMLElement | undefined
  let winnerScore = Infinity
  const vertical = dir === 'up' || dir === 'down'
  const fromRail = inRail(current)
  const view = { top: 0, bottom: window.innerHeight }
  const fromScroller = current?.closest('.row-scroller')
  const clips = new Map<Element, DOMRect>()
  for (const el of els) {
    if (el === current) continue
    // ↑ / ↓ nunca cruzan entre el riel y la página: sin nada abajo, el foco se queda (antes saltaba al riel).
    if (vertical && inRail(el) !== fromRail) continue
    const r = el.getBoundingClientRect()
    // Lo que una fila recorta (scroll horizontal) no se ve: desde afuera de esa fila no cuenta (antes → desde
    // "Tu año" caía en el "Quitar" de una tarjeta escondida de Seguir viendo, y OK la borraba). Dentro de la
    // misma fila sí, así se sigue avanzando y la fila se corre.
    const scroller = el.closest('.row-scroller')
    if (scroller && scroller !== fromScroller) {
      let clip = clips.get(scroller)
      if (!clip) clips.set(scroller, (clip = scroller.getBoundingClientRect()))
      if (r.right <= clip.left + 1 || r.left >= clip.right - 1) continue
    }
    const score = navScore(from, r, dir, view)
    if (score !== undefined && score < winnerScore) {
      winnerScore = score
      winner = el
    }
  }
  return winner
}

/**
 * Zonas de la pantalla (`data-nav-zone`, o el índice lateral de Ajustes): ↑ / ↓ se quedan en la zona
 * donde está el foco y recién la dejan si no queda nada en esa dirección (antes ↓ desde el contenido de
 * Ajustes caía en el índice). ← / → pasan de una a otra; → desde el índice de Ajustes va a la sección
 * marcada, no a lo que quede más cerca.
 */
const ZONE = '[data-nav-zone], .settings-index'
const zoneOf = (el: Element | null) => el?.closest(ZONE) ?? null

function move(from: DOMRect, dir: Dir, els: HTMLElement[], current: Element): HTMLElement | undefined {
  const zone = zoneOf(current)
  if (dir === 'up' || dir === 'down') {
    const same = els.filter((el) => zoneOf(el) === zone)
    // tv-17: el índice de Ajustes no se escapa con ↑ / ↓ al contenido (como el riel): para cambiar de zona, ← / →.
    if (zone?.classList.contains('settings-index')) return best(from, dir, same, current)
    if (same.length < els.length) return best(from, dir, same, current) ?? best(from, dir, els, current)
  }
  // tv-06: → desde el riel en Ajustes entra por el índice (la sección marcada), no por lo que quede más cerca en vertical.
  if (dir === 'right' && inRail(current)) {
    const index = els.filter((el) => el.closest('.settings-index'))
    const entry = index.find((el) => el.getAttribute('aria-current') === 'true') ?? index[0]
    if (entry) return entry
  }
  if (dir === 'right' && zone?.classList.contains('settings-index')) {
    const id = zone.querySelector('[aria-current="true"]')?.getAttribute('href')?.slice(1)
    const section = id ? document.getElementById(id) : null
    if (section) {
      const inside = els.filter((el) => section.contains(el))
      const shown = inside.find((el) => {
        const r = el.getBoundingClientRect()
        return r.top >= 0 && r.bottom <= window.innerHeight
      })
      if (shown ?? inside[0]) return shown ?? inside[0]
    }
  }
  return best(from, dir, els, current)
}

/**
 * `data-nav-<dirección>` en el elemento enfocado: un selector con el destino de esa flecha (el primero que se ve).
 * Sin atributo, o sin destino a la vista, no hace nada y sigue la geometría.
 */
function navOverride(active: Element | null, dir: Dir, els: HTMLElement[]): HTMLElement | undefined {
  const selector = active?.getAttribute(`data-nav-${dir}`)
  if (!selector) return undefined
  try {
    return Array.from(document.querySelectorAll<HTMLElement>(selector)).find((el) => el !== active && els.includes(el))
  } catch {
    return undefined
  }
}

function isTextInput(el: Element | null) {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return true
  return el instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button', 'submit'].includes(el.type)
}

/**
 * ← / → dentro de un campo de texto mueven el cursor; recién cuando está en el borde (al final con →,
 * al principio con ←) pasan al botón de al lado, como el "Agregar" de la URL del addon.
 */
function caretAtEdge(el: HTMLInputElement | HTMLTextAreaElement, dir: 'left' | 'right') {
  const { selectionStart: start, selectionEnd: end } = el
  // Algunos tipos no exponen el cursor: en email las flechas siguen siendo del campo; en number ← / →
  // no hacen nada adentro, así que salen (si no, el campo de la meta atrapaba el foco).
  if (start === null || end === null) return el.type === 'number'
  if (start !== end) return false
  return dir === 'right' ? end === el.value.length : start === 0
}

/**
 * ← / → dentro de una fila se quedan en la fila: al final no saltan a otra fila de más arriba o más
 * abajo (en la TV quedaría tapada por el fondo que sigue al foco). Desde la primera tarjeta, ← va al riel.
 */
function rowPool(els: HTMLElement[], active: Element, dir: Dir): HTMLElement[] {
  if (dir !== 'left' && dir !== 'right') return els
  const scroller = active.closest('.row-scroller')
  if (!scroller) return els
  const same = els.filter((el) => scroller.contains(el))
  return dir === 'right' ? same : [...same, ...els.filter((el) => inRail(el))]
}

// ---------- Modo TV: foco anclado (U31) ----------

export const isTv = () => document.documentElement.hasAttribute('data-tv')
/** Teclas mantenidas en la TV: como mucho un paso cada tanto (si no, el scroll queda atrás del foco). */
const REPEAT_MS = 80
/** Altura fija de la fila enfocada en las pantallas sin fondo que sigue al foco (fracción de la ventana). */
const ROW_ANCHOR = 0.2
/** Aire arriba de una línea de la grilla anclada (anillo de foco + escala de la tarjeta). */
const GRID_GAP = 28

/**
 * Altura (px desde arriba) donde queda la fila enfocada en la TV: justo debajo del fondo que sigue al
 * foco si la pantalla lo tiene (`[data-focus-billboard]`), o a una altura fija.
 */
export function rowAnchorY(viewportH: number, billboardH: number | undefined): number {
  return billboardH && billboardH > 0 ? Math.round(billboardH) : Math.round(viewportH * ROW_ANCHOR)
}

/**
 * Cuánto mover una fila horizontal para que la tarjeta quede en la primera columna (pegada al margen):
 * el foco queda fijo a la izquierda y se corre el contenido. Nunca negativo ni más allá del final.
 */
export function anchoredScrollLeft(o: { scrollLeft: number; itemLeft: number; scrollerLeft: number; padding: number; maxScroll: number }): number {
  const target = o.scrollLeft + (o.itemLeft - o.scrollerLeft) - o.padding
  return Math.max(0, Math.min(o.maxScroll, Math.round(target)))
}

function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Desde dónde se ve la página: 0, o lo que tapa una portada fija (`scroll-padding-top`, ver discover/browse.css). */
export function visibleTop(): number {
  return parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
}

/**
 * Dónde queda el título de la fila debajo de la portada fija (PC). La sombra `bh-edge` (discover/browse.css)
 * llega a ~28 px (10 px + 18 de difuminado): el título queda justo afuera. v0.26 (explorar-01): con 32 px, lo
 * de la fila anterior (nombre y año, ~60 px arriba del título) queda tapado por la portada.
 */
export const ROW_HEAD_GAP = 32

/**
 * Scroll vertical para una tarjeta de una fila debajo de una portada fija (PC): el título de la fila pegado
 * debajo de la portada (como en la TV), así no asoma la fila anterior; si la tarjeta no entra, gana la
 * tarjeta entera. Puro, para poder probarlo.
 */
export function rowRevealTop(o: { scrollY: number; viewTop: number; viewH: number; cardTop: number; cardBottom: number; headTop: number }): number {
  const keepHead = o.scrollY + o.headTop - o.viewTop - ROW_HEAD_GAP
  const keepCard = o.scrollY + o.cardBottom - o.viewH
  return Math.max(0, Math.round(Math.max(keepHead, keepCard)))
}

/** Lleva a la vista el elemento recién enfocado. En la TV, anclado; si no, centrado como siempre. */
function reveal(el: HTMLElement, instant: boolean) {
  if (!isTv()) {
    const behavior: ScrollBehavior = instant ? 'auto' : 'smooth'
    const scroller = el.closest<HTMLElement>('.row-scroller')
    const row = scroller?.closest<HTMLElement>('.row')
    const viewTop = visibleTop()
    if (!scroller || !row || viewTop <= 0) {
      // Centrado: el póster del borde no queda cortado ni tapado por la barra de arriba.
      el.scrollIntoView({ block: 'center', inline: 'center', behavior })
      return
    }
    // Debajo de la portada fija de Películas/Series: el título de la fila pegado debajo de la portada.
    const item = (el.closest('.row-scroller > *') as HTMLElement | null) ?? el
    const ir = item.getBoundingClientRect()
    const sr = scroller.getBoundingClientRect()
    const maxLeft = scroller.scrollWidth - scroller.clientWidth
    const left = Math.max(0, Math.min(maxLeft, Math.round(scroller.scrollLeft + ir.left + ir.width / 2 - (sr.left + scroller.clientWidth / 2))))
    if (Math.abs(left - scroller.scrollLeft) > 1) scroller.scrollTo({ left, behavior })
    const head = row.querySelector('.row-header') ?? row
    const top = rowRevealTop({
      scrollY: window.scrollY,
      viewTop,
      viewH: window.innerHeight,
      cardTop: ir.top,
      cardBottom: ir.bottom,
      headTop: head.getBoundingClientRect().top,
    })
    if (Math.abs(top - window.scrollY) > 1) window.scrollTo({ top, behavior })
    return
  }
  const behavior = revealBehavior({ instant, reduced: reducedMotion(), tv: true, ownScroller: false })
  const scroller = el.closest<HTMLElement>('.row-scroller')
  if (scroller) {
    const item = (el.closest('.row-scroller > *') as HTMLElement | null) ?? el
    const left = anchoredScrollLeft({
      scrollLeft: scroller.scrollLeft,
      itemLeft: item.getBoundingClientRect().left,
      scrollerLeft: scroller.getBoundingClientRect().left,
      padding: parseFloat(getComputedStyle(scroller).paddingLeft) || 0,
      maxScroll: scroller.scrollWidth - scroller.clientWidth,
    })
    if (Math.abs(left - scroller.scrollLeft) > 1) scroller.scrollTo({ left, behavior })
  }
  // En vertical, la fila (o la línea de la grilla) siempre a la misma altura.
  const box = scroller ? (scroller.closest<HTMLElement>('.row') ?? scroller) : el.closest<HTMLElement>('.grid > *')
  if (box) {
    const bb = document.querySelector<HTMLElement>('[data-focus-billboard]')
    // En la grilla no hay título de fila arriba: un margen para que el anillo de foco no quede tapado.
    const anchor = rowAnchorY(window.innerHeight, bb?.offsetHeight) + (scroller ? 0 : GRID_GAP)
    const top = Math.max(0, Math.round(window.scrollY + box.getBoundingClientRect().top - anchor))
    if (Math.abs(top - window.scrollY) > 1) window.scrollTo({ top, behavior })
    return
  }
  // Un contenedor con scroll horizontal propio (los géneros de la grilla): sin animación, si no con pulsaciones
  // rápidas el foco se adelantaba al scroll suave y quedaba fuera de la pantalla (tv-10).
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: revealBehavior({ instant, reduced: reducedMotion(), tv: true, ownScroller: inOwnHorizontalScroller(el) }) })
}

/**
 * Cómo desplazar al enfocar en la TV. Puro, para poder probarlo: sin animación con la tecla mantenida
 * (`instant`), con "reducir movimiento" o dentro de un contenedor con scroll horizontal propio (tv-10).
 */
export function revealBehavior(o: { instant: boolean; reduced: boolean; tv: boolean; ownScroller: boolean }): ScrollBehavior {
  return o.instant || o.reduced || (o.tv && o.ownScroller) ? 'auto' : 'smooth'
}

/** ¿Está dentro de algo que se desplaza en horizontal por su cuenta (que no es una fila de pósters)? */
function inOwnHorizontalScroller(el: HTMLElement): boolean {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    if (node.scrollWidth <= node.clientWidth + 1) continue
    const overflow = getComputedStyle(node).overflowX
    if (overflow === 'auto' || overflow === 'scroll') return true
  }
  return false
}

/**
 * Lo restaurado por la memoria de foco al volver (sin animación). En la TV una fila o grilla vuelve
 * siempre anclada debajo de la portada que sigue al foco, como al moverse con las flechas; lo demás, y
 * todo en PC, solo si no se ve entero (`needed`).
 */
export function revealRestored(el: HTMLElement, needed: boolean) {
  if (needed || (isTv() && el.closest('.row-scroller, .grid'))) reveal(el, true)
  if (isTv() && el.closest('.row-scroller, .grid')) keepAnchored(el)
}

/** Cuánto se vuelve a anclar una fila restaurada mientras las de arriba terminan de cargar (tv-05). */
export const KEEP_ANCHOR_MS = 2500
let stopKeepAnchored: (() => void) | undefined

/**
 * tv-05: al volver con Atrás las filas de arriba todavía son esqueletos y, al cargar, crecen unos píxeles (22 px
 * cada una): la fila quedaba corrida respecto de cuando se llega con las flechas y el título del póster, cortado
 * contra el borde. Mientras la página cambia de alto (un tiempo acotado), se vuelve a anclar la fila; si el usuario
 * toca algo, mueve el foco o se va el elemento, se deja de hacer.
 */
function keepAnchored(el: HTMLElement) {
  stopKeepAnchored?.()
  if (typeof ResizeObserver === 'undefined') return
  const events = ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const
  let timer: ReturnType<typeof setTimeout> | undefined
  const ro = new ResizeObserver(() => {
    if (!el.isConnected || document.activeElement !== el) return stop()
    reveal(el, true)
  })
  function stop() {
    ro.disconnect()
    clearTimeout(timer)
    for (const type of events) window.removeEventListener(type, stop, true)
    if (stopKeepAnchored === stop) stopKeepAnchored = undefined
  }
  stopKeepAnchored = stop
  ro.observe(document.body)
  timer = setTimeout(stop, KEEP_ANCHOR_MS)
  for (const type of events) window.addEventListener(type, stop, true)
}

/** En la TV, si lo guardado no aparece, la primera tarjeta a la vista (si no, las flechas arrancan de cero). */
export function firstVisibleCard(): HTMLElement | undefined {
  if (!isTv()) return undefined
  const cards = document.querySelectorAll<HTMLElement>('main .row-scroller a[href], main .grid a[href]')
  return Array.from(cards).find((c) => {
    const r = c.getBoundingClientRect()
    return r.width > 0 && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth
  })
}

/**
 * Enfoca lo primero de la pantalla (lo marcado con `data-autofocus` o lo primero de <main>), por
 * ejemplo al cerrar la guía de la TV, que si no deja el foco en <body>. Devuelve si encontró algo.
 */
export function focusInitialTarget(keepScroll = false): boolean {
  const target = initialTarget(candidates())
  if (!target) return false
  target.focus({ preventScroll: true })
  // `keepScroll`: al entrar a una pantalla recién cargada no se mueve nada si el botón ya se ve entero.
  if (!keepScroll || !fullyVisible(target)) reveal(target, true)
  return true
}

/** Lo que enfocaría la primera flecha (lo marcado con `data-autofocus` o lo primero de <main>), sin enfocarlo. */
export function initialFocusElement(): HTMLElement | undefined {
  return initialTarget(candidates())
}

function fullyVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  return r.top >= visibleTop() && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth
}

/** Hasta cuándo se espera lo marcado con `data-autofocus` antes de conformarse con lo primero de <main>. */
export const INITIAL_FOCUS_MARKED_MS = 1500
/** Cuánto se espera como mucho a que la pantalla nueva tenga algo para enfocar. */
export const INITIAL_FOCUS_MAX_MS = 6000

/**
 * Qué hacer en cada cuadro mientras se espera el foco inicial de una pantalla nueva (tv-04). Puro. Lo marcado
 * gana apenas aparece; lo primero de <main> recién pasados `INITIAL_FOCUS_MARKED_MS` (la portada de Inicio tarda
 * más que un "Ver todo" de una fila); pasados `INITIAL_FOCUS_MAX_MS`, se deja de esperar.
 */
export function initialPick(o: { marked: boolean; any: boolean; elapsed: number }): 'marked' | 'any' | 'wait' | 'stop' {
  if (o.marked) return 'marked'
  if (o.elapsed >= INITIAL_FOCUS_MAX_MS) return 'stop'
  if (o.any && o.elapsed >= INITIAL_FOCUS_MARKED_MS) return 'any'
  return 'wait'
}

const USER_EVENTS = ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const

/**
 * En la TV, al entrar a una pantalla nueva (PUSH / REPLACE) no quedaba nada marcado hasta la primera flecha y OK
 * no hacía nada (tv-04). Espera (con requestAnimationFrame) a que la pantalla tenga algo para enfocar y lo enfoca
 * si para entonces el foco sigue en <body>; si el usuario toca algo antes, si algo ya tomó el foco, con una capa
 * modal abierta o en el reproductor, no hace nada. Devuelve la función para cancelar (al cambiar de pantalla).
 */
export function focusInitialWhenReady(): () => void {
  if (!isTv()) return () => {}
  const started = performance.now()
  let raf = 0
  const stop = () => {
    cancelAnimationFrame(raf)
    for (const type of USER_EVENTS) window.removeEventListener(type, stop, true)
  }
  const tick = () => {
    const active = document.activeElement
    if ((active && active !== document.body) || document.querySelector('[data-nav-disabled], [data-nav-scope]')) {
      stop()
      return
    }
    const els = candidates()
    const main = document.querySelector('main')
    const marked = main ? Array.from(main.querySelectorAll<HTMLElement>('[data-autofocus]')).some((el) => els.includes(el)) : false
    const any = main ? els.some((el) => main.contains(el)) : els.length > 0
    const pick = initialPick({ marked, any, elapsed: performance.now() - started })
    if (pick === 'wait') {
      raf = requestAnimationFrame(tick)
      return
    }
    stop()
    if (pick !== 'stop') focusInitialTarget(true)
  }
  for (const type of USER_EVENTS) window.addEventListener(type, stop, true)
  raf = requestAnimationFrame(tick)
  return stop
}

/**
 * tv-02: el control remoto manda Enter (OK) y una casilla o un radio nativos solo cambian con Espacio. En la TV,
 * OK sobre uno de ellos lo cambia (con `click()`). Puro, para poder probarlo. Fuera de la TV, nada cambia.
 */
export function enterTogglesCheck(o: { tv: boolean; key: string; repeat?: boolean; tag?: string; type?: string }): boolean {
  return o.tv && o.key === 'Enter' && !o.repeat && o.tag === 'INPUT' && (o.type === 'checkbox' || o.type === 'radio')
}

/**
 * tv-12: ↑ / ↓ sin destino no hacen el scroll de 40 px del navegador cuando el foco está anclado a algo: en una
 * capa modal (`data-nav-scope`), en el riel, con una portada fija (`data-focus-billboard`, la grilla), en las
 * filas de Películas/Series o en el índice de Ajustes (tv-17). En el resto de las páginas el scroll nativo sigue (sirve para leer). Puro.
 */
export function blocksPageScroll(o: { vertical: boolean; inScope: boolean; inRail: boolean; hasBillboard: boolean; inBrowseRow: boolean; inIndex?: boolean }): boolean {
  return o.vertical && (o.inScope || o.inRail || o.hasBillboard || o.inBrowseRow || !!o.inIndex)
}

// ---------- "Atrás" en escalera (U1) ----------

/** Pantallas con "Atrás" en escalera: Inicio, Películas, Series y Vos (donde está Mi lista desde la v0.23). */
export function ladderApplies(pathname: string): boolean {
  return pathname === '/' || pathname === '/me' || /^\/discover\/[^/]+\/?$/.test(pathname)
}

export type BackStep = 'top' | 'rail' | 'leave'

/**
 * Qué hace "Atrás": desde la página, primero vuelve arriba (portada o primer botón); ya arriba, pasa
 * al riel; desde el riel (o sin riel, como en el celular), lo de siempre (`leave`).
 */
export function backStep(s: { inRail: boolean; atTop: boolean; railAvailable: boolean }): BackStep {
  if (s.inRail) return 'leave'
  if (!s.atTop) return 'top'
  return s.railAvailable ? 'rail' : 'leave'
}

/** Lo de arriba de la pantalla: el botón principal de la portada o lo primero de <main>. */
function topTarget(els: HTMLElement[]): HTMLElement | undefined {
  const main = document.querySelector('main')
  if (!main) return undefined
  const marked = Array.from(main.querySelectorAll<HTMLElement>('[data-autofocus]')).find(isVisible)
  return marked ?? els.find((el) => main.contains(el))
}

function railTarget(els: HTMLElement[]): HTMLElement | undefined {
  const rail = els.filter((el) => inRail(el))
  return rail.find((el) => el.classList.contains('active') || el.getAttribute('aria-current') === 'page') ?? rail[0]
}

/**
 * "Atrás" en escalera. Devuelve `true` si lo resolvió (subió o pasó al riel); `false` para que se haga
 * lo de siempre (volver a la pantalla anterior, o nada en Inicio).
 */
export function ladderBack(pathname: string): boolean {
  if (!ladderApplies(pathname) || document.querySelector('[data-nav-scope]')) return false
  const els = candidates()
  const active = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : undefined
  const top = topTarget(els)
  const rail = railTarget(els)
  const atTop = window.scrollY <= 8 && (!active || active === top || !top)
  const step = backStep({ inRail: inRail(active ?? null), atTop, railAvailable: !!rail })
  if (step === 'top') {
    const instant = isTv() || reducedMotion()
    if (top) top.focus({ preventScroll: true })
    else active?.blur()
    window.scrollTo({ top: 0, behavior: instant ? 'auto' : 'smooth' })
    return true
  }
  if (step === 'rail' && rail) {
    rail.focus({ preventScroll: true })
    return true
  }
  return false
}

export function initSpatialNav(onBack: () => void) {
  let lastMove = 0
  const handler = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    // El reproductor maneja sus propias teclas.
    if (document.querySelector('[data-nav-disabled]')) return

    const active = document.activeElement
    if (BACK_KEYS.has(e.key)) {
      if (e.key === 'Backspace' && isTextInput(active)) return
      // Un <select> nativo o un campo de texto: "Atrás" lo suelta, no se va de la página.
      if (active instanceof HTMLSelectElement || (e.key === 'Escape' && isTextInput(active))) {
        e.preventDefault()
        ;(active as HTMLElement).blur()
        return
      }
      e.preventDefault()
      onBack()
      return
    }

    // OK sobre una casilla nativa en la TV la cambia (Enter solo no lo hace; ver `enterTogglesCheck`).
    if (active instanceof HTMLInputElement && enterTogglesCheck({ tv: isTv(), key: e.key, repeat: e.repeat, tag: active.tagName, type: active.type })) {
      e.preventDefault()
      active.click()
      return
    }

    const dir = KEYS[e.key]
    if (!dir) return
    if ((dir === 'left' || dir === 'right') && isTextInput(active) && !caretAtEdge(active as HTMLInputElement, dir)) return
    if (active instanceof HTMLSelectElement) return
    // Dentro de una lista desplegada (el Picker) las flechas las maneja la lista.
    if (active?.closest('[role="listbox"]')) return

    // Flecha mantenida en la TV: un paso cada REPEAT_MS como mucho (el resto se descarta).
    const now = performance.now()
    if (e.repeat && isTv() && now - lastMove < REPEAT_MS) {
      e.preventDefault()
      return
    }

    const els = candidates()
    const from =
      active && active !== document.body ? (active as HTMLElement).getBoundingClientRect() : new DOMRect(0, 0, 0, 0)
    let next = active && active !== document.body ? move(from, dir, rowPool(els, active, dir), active) : initialTarget(els)
    // De la página al riel se entra siempre por el ítem activo ("Inicio"), no por el más cercano
    // (desde las filas de abajo era "Ajustes"), como en Netflix o Google TV.
    if (next && inRail(next) && !inRail(active)) next = railTarget(els) ?? next
    // Salir hacia la izquierda de un panel que dice a dónde volver (`data-nav-left`, un selector): las
    // fuentes de un episodio vuelven al episodio elegido, no al ✓ que quede más cerca.
    const back = dir === 'left' && active instanceof Element ? active.closest<HTMLElement>('[data-nav-left]') : null
    if (back && next && !back.contains(next)) {
      const target = document.querySelector<HTMLElement>(back.dataset.navLeft ?? '')
      if (target && els.includes(target)) next = target
    }
    // Un elemento puede decir a dónde va una flecha (`data-nav-up`, `data-nav-right`…: un selector): el ✓ de un episodio
    // va a la fuente recomendada, el primer episodio vuelve a la temporada elegida. Si el destino no se ve, manda la geometría.
    const forced = navOverride(active, dir, els)
    if (forced) next = forced
    if (next) {
      e.preventDefault()
      lastMove = now
      next.focus({ preventScroll: true })
      // Con la tecla mantenida, sin animación: el scroll suave quedaba atrás del foco.
      reveal(next, e.repeat)
    } else if (
      blocksPageScroll({
        vertical: dir === 'up' || dir === 'down',
        inScope: !!document.querySelector('[data-nav-scope]'),
        inRail: inRail(active),
        hasBillboard: !!document.querySelector('[data-focus-billboard]'),
        // Películas/Series: en la última fila, ↓ no hace el scroll de 40 px del navegador (el título de la
        // fila se metía debajo de la portada fija y asomaba la anterior).
        inBrowseRow: !!active?.closest('.page.browse .row-scroller'),
        inIndex: !!active?.closest('.settings-index'),
      })
    ) {
      e.preventDefault()
    }
  }
  window.addEventListener('keydown', handler)
  const stopTabReveal = initTabReveal()
  return () => {
    window.removeEventListener('keydown', handler)
    stopTabReveal()
  }
}

/**
 * Tab / Shift+Tab del teclado debajo de la portada fija de Películas/Series (PC): el navegador lleva la tarjeta a
 * la vista a su manera y, al volver a la fila de arriba, el título quedaba tapado por la portada. Después de ese
 * scroll, la fila se acomoda igual que con las flechas (`reveal`, sin animación como el del navegador). Solo con
 * Tab (las flechas ya lo hacen y el mouse no mueve la página), nunca en la TV ni sin portada fija
 * (`visibleTop()` en 0: celular, pantallas bajas y el resto de las páginas).
 */
function initTabReveal() {
  let tabbing = false
  const onKey = (e: KeyboardEvent) => {
    tabbing = e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey
  }
  const onPointer = () => {
    tabbing = false
  }
  const onFocusIn = (e: FocusEvent) => {
    if (!tabbing) return
    tabbing = false
    const el = e.target
    if (!(el instanceof HTMLElement) || isTv() || !el.closest('.row-scroller') || visibleTop() <= 0) return
    // En el cuadro siguiente: el scroll del navegador por el foco llega después de este evento.
    requestAnimationFrame(() => {
      if (document.activeElement === el) reveal(el, true)
    })
  }
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('pointerdown', onPointer, true)
  document.addEventListener('focusin', onFocusIn)
  return () => {
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('pointerdown', onPointer, true)
    document.removeEventListener('focusin', onFocusIn)
  }
}
