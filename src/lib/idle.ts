// Temporizador de inactividad (para el protector de pantalla). Lógica pura con reloj inyectable:
// se prueba con timers falsos de vitest.

export interface IdleTimerOptions {
  /** Milisegundos sin actividad; 0 = apagado. */
  timeoutMs: number
  onIdle: () => void
  /** Se consulta al vencer: si devuelve false (ej. video reproduciéndose) vuelve a esperar. */
  canIdle?: () => boolean
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export class IdleTimer {
  private last: number
  private handle: unknown
  private idle = false
  private stopped = false
  private readonly now: () => number
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void

  constructor(private opts: IdleTimerOptions) {
    this.now = opts.now ?? Date.now
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
    this.last = this.now()
    this.arm(opts.timeoutMs)
  }

  get isIdle() {
    return this.idle
  }

  /** Hubo actividad: reinicia la cuenta. Devuelve true si estaba inactivo (para cerrar el protector). */
  activity(): boolean {
    const was = this.idle
    this.idle = false
    this.last = this.now()
    this.arm(this.opts.timeoutMs)
    return was
  }

  setTimeoutMs(ms: number) {
    this.opts = { ...this.opts, timeoutMs: ms }
    this.activity()
  }

  stop() {
    this.stopped = true
    if (this.handle !== undefined) this.clearTimer(this.handle)
    this.handle = undefined
  }

  private arm(ms: number) {
    if (this.handle !== undefined) this.clearTimer(this.handle)
    this.handle = undefined
    if (this.stopped || ms <= 0) return
    this.handle = this.setTimer(() => this.fire(), ms)
  }

  private fire() {
    this.handle = undefined
    if (this.stopped || this.idle) return
    const left = this.opts.timeoutMs - (this.now() - this.last)
    // Por si el timer se disparó antes (pestaña en segundo plano, reloj ajustado).
    if (left > 50) return this.arm(left)
    if (this.opts.canIdle && !this.opts.canIdle()) {
      this.last = this.now()
      return this.arm(this.opts.timeoutMs)
    }
    this.idle = true
    this.opts.onIdle()
  }
}

/** Opciones del ajuste, en minutos (0 = apagado). */
export const SCREENSAVER_OPTIONS = [0, 2, 5, 10] as const
export type ScreensaverMinutes = (typeof SCREENSAVER_OPTIONS)[number]
