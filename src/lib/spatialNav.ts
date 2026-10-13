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
  return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible)
}

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
  for (const el of els) {
    if (el === current) continue
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

export function initSpatialNav(onBack: () => void) {
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

    const els = candidates()
    const from =
      active && active !== document.body ? (active as HTMLElement).getBoundingClientRect() : new DOMRect(0, 0, 0, 0)
    const next = active && active !== document.body ? best(from, dir, els, active) : initialTarget(els)
    if (next) {
      e.preventDefault()
      next.focus({ preventScroll: true })
      // Centrado: el póster del borde no queda cortado ni tapado por la barra de arriba.
      next.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}
