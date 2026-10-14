// Navegación con las flechas del control remoto (Fire TV, Android TV, navegador de la TV).
// Busca el elemento enfocable más cercano en la dirección pedida y le pasa el foco.

import { restoredElement } from './focusMemory'

type Dir = 'up' | 'down' | 'left' | 'right'

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'

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

function center(r: DOMRect) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

function best(from: DOMRect, dir: Dir, els: HTMLElement[], current: Element | null): HTMLElement | undefined {
  const c = center(from)
  let winner: HTMLElement | undefined
  let winnerScore = Infinity
  const vertical = dir === 'up' || dir === 'down'
  const fromRail = inRail(current)
  for (const el of els) {
    if (el === current) continue
    // ↑ / ↓ nunca cruzan entre el riel y la página: sin nada abajo, el foco se queda (antes saltaba al riel).
    if (vertical && inRail(el) !== fromRail) continue
    const r = el.getBoundingClientRect()
    const t = center(r)
    const dx = t.x - c.x
    const dy = t.y - c.y
    // Tiene que estar del lado correcto (con una tolerancia chica para elementos superpuestos).
    const ok =
      dir === 'right' ? r.left >= from.right - 4 :
      dir === 'left' ? r.right <= from.left + 4 :
      dir === 'down' ? r.top >= from.bottom - 4 :
      r.bottom <= from.top + 4
    if (!ok) continue
    const main = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy)
    const cross = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx)
    // Penalizamos el desvío lateral para que se mueva "en línea".
    const score = main + cross * 2.5
    if (score < winnerScore) {
      winnerScore = score
      winner = el
    }
  }
  return winner
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
  // Algunos tipos (email, number) no exponen el cursor: ahí las flechas siguen siendo del campo.
  if (start === null || end === null || start !== end) return false
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

const isTv = () => document.documentElement.hasAttribute('data-tv')
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

/** Lleva a la vista el elemento recién enfocado. En la TV, anclado; si no, centrado como siempre. */
function reveal(el: HTMLElement, instant: boolean) {
  if (!isTv()) {
    // Centrado: el póster del borde no queda cortado ni tapado por la barra de arriba.
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: instant ? 'auto' : 'smooth' })
    return
  }
  const behavior: ScrollBehavior = instant || reducedMotion() ? 'auto' : 'smooth'
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
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior })
}

/**
 * Enfoca lo primero de la pantalla (lo marcado con `data-autofocus` o lo primero de <main>), por
 * ejemplo al cerrar la guía de la TV, que si no deja el foco en <body>. Devuelve si encontró algo.
 */
export function focusInitialTarget(): boolean {
  const target = initialTarget(candidates())
  if (!target) return false
  target.focus({ preventScroll: true })
  reveal(target, true)
  return true
}

// ---------- "Atrás" en escalera (U1) ----------

/** Pantallas con "Atrás" en escalera: Inicio, Películas, Series y Mi lista. */
export function ladderApplies(pathname: string): boolean {
  return pathname === '/' || pathname === '/list' || /^\/discover\/[^/]+\/?$/.test(pathname)
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
    const next = active && active !== document.body ? best(from, dir, rowPool(els, active, dir), active) : initialTarget(els)
    if (next) {
      e.preventDefault()
      lastMove = now
      next.focus({ preventScroll: true })
      // Con la tecla mantenida, sin animación: el scroll suave quedaba atrás del foco.
      reveal(next, e.repeat)
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}
