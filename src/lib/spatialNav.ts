// Navegación con las flechas del control remoto (Fire TV, Android TV, navegador de la TV).
// Busca el elemento enfocable más cercano en la dirección pedida y le pasa el foco.

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

export function initSpatialNav(onBack: () => void) {
  const handler = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    // El reproductor maneja sus propias teclas.
    if (document.querySelector('[data-nav-disabled]')) return

    const active = document.activeElement
    if (BACK_KEYS.has(e.key)) {
      if (e.key === 'Backspace' && isTextInput(active)) return
      if (e.key === 'Escape' && isTextInput(active)) {
        ;(active as HTMLElement).blur()
        return
      }
      e.preventDefault()
      onBack()
      return
    }

    const dir = KEYS[e.key]
    if (!dir) return
    if (isTextInput(active) && (dir === 'left' || dir === 'right')) return
    if (active instanceof HTMLSelectElement) return

    const els = candidates()
    const from =
      active && active !== document.body ? (active as HTMLElement).getBoundingClientRect() : new DOMRect(0, 0, 0, 0)
    const next = active && active !== document.body ? best(from, dir, els, active) : els[0]
    if (next) {
      e.preventDefault()
      next.focus({ preventScroll: true })
      next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}
