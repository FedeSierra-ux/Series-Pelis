// @ts-check
// Tamaño y lugar de la ventana entre aperturas, en <userData>/window-state.json. Si la pantalla donde estaba ya no
// existe (se desenchufó el monitor), vuelve al tamaño de fábrica centrada.
import fs from 'node:fs'
import path from 'node:path'
import { screen } from 'electron'

export const DEFAULT_WIDTH = 1280
export const DEFAULT_HEIGHT = 800

/** @typedef {{ x?: number, y?: number, width: number, height: number, maximized: boolean }} WindowState */

/** @param {string} dir @returns {WindowState} */
export function loadWindowState(dir) {
  /** @type {WindowState} */
  const fallback = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, maximized: false }
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'window-state.json'), 'utf8'))
    const num = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v)
    if (!num(raw.width) || !num(raw.height)) return fallback
    /** @type {WindowState} */
    const st = { width: Math.round(raw.width), height: Math.round(raw.height), maximized: raw.maximized === true }
    if (num(raw.x) && num(raw.y)) {
      const bounds = { x: Math.round(raw.x), y: Math.round(raw.y), width: st.width, height: st.height }
      // Tiene que verse al menos un pedazo de la barra de título en alguna pantalla.
      const area = screen.getDisplayMatching(bounds).workArea
      const visible =
        bounds.x < area.x + area.width - 80 && bounds.x + bounds.width > area.x + 80 && bounds.y >= area.y - 10 && bounds.y < area.y + area.height - 40
      if (visible) Object.assign(st, { x: bounds.x, y: bounds.y })
    }
    return st
  } catch {
    return fallback
  }
}

/**
 * Guarda el estado al moverla, cambiarla de tamaño o cerrarla (con un respiro, para no escribir a cada píxel).
 * @param {import('electron').BrowserWindow} win
 * @param {string} dir
 */
export function trackWindowState(win, dir) {
  /** @type {NodeJS.Timeout | undefined} */
  let timer
  const save = () => {
    clearTimeout(timer)
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return
    // Maximizada: se guarda el tamaño "normal" para cuando la desmaximicen.
    const b = win.getNormalBounds()
    const st = { x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() }
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'window-state.json'), JSON.stringify(st))
    } catch {
      // Si no se puede guardar, la próxima abre con el tamaño de fábrica.
    }
  }
  const later = () => {
    clearTimeout(timer)
    timer = setTimeout(save, 500)
  }
  win.on('resize', later)
  win.on('move', later)
  win.on('maximize', save)
  win.on('unmaximize', save)
  win.on('close', save)
}
