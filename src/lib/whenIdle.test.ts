import { describe, expect, it } from 'vitest'
import { whenIdle } from './whenIdle'

/** Relojes falsos: `idleQueue` hace de requestIdleCallback, `timers` de setTimeout; `t` es la hora. */
function fakes() {
  const state = {
    t: 1000,
    key: 0,
    idleQueue: [] as { fn: () => void; opts: { timeout: number }; id: number }[],
    timers: [] as { fn: () => void; at: number; id: number }[],
    next: 1,
  }
  return {
    state,
    opts: {
      now: () => state.t,
      lastKeyAt: () => state.key,
      requestIdle: (fn: () => void, opts: { timeout: number }) => {
        const id = state.next++
        state.idleQueue.push({ fn, opts, id })
        return id
      },
      cancelIdle: (h: unknown) => {
        state.idleQueue = state.idleQueue.filter((q) => q.id !== h)
      },
      setTimer: (fn: () => void, ms: number) => {
        const id = state.next++
        state.timers.push({ fn, at: state.t + ms, id })
        return id
      },
      clearTimer: (h: unknown) => {
        state.timers = state.timers.filter((q) => q.id !== h)
      },
    },
    runIdle() {
      const q = state.idleQueue.shift()
      q?.fn()
    },
    advance(ms: number) {
      state.t += ms
      const due = state.timers.filter((x) => x.at <= state.t)
      state.timers = state.timers.filter((x) => x.at > state.t)
      due.forEach((x) => x.fn())
    },
  }
}

describe('whenIdle', () => {
  it('corre cuando el navegador queda ocioso y pasa el tope como timeout', () => {
    const f = fakes()
    let n = 0
    whenIdle(() => n++, { ...f.opts, timeoutMs: 2000 })
    expect(n).toBe(0)
    expect(f.state.idleQueue[0].opts.timeout).toBe(2000)
    f.runIdle()
    expect(n).toBe(1)
  })

  it('cancelar antes de tiempo no corre nada', () => {
    const f = fakes()
    let n = 0
    const cancel = whenIdle(() => n++, f.opts)
    cancel()
    f.runIdle()
    expect(n).toBe(0)
    expect(f.state.idleQueue).toHaveLength(0)
  })

  it('sin requestIdleCallback usa un temporizador corto', () => {
    const f = fakes()
    let n = 0
    whenIdle(() => n++, { ...f.opts, requestIdle: undefined as never })
    // Con `requestIdle` indefinido el helper cae al del entorno; en node no existe y debe usar el temporizador.
    if (typeof requestIdleCallback === 'function') return
    expect(f.state.timers).toHaveLength(1)
    f.advance(200)
    expect(n).toBe(1)
  })

  it('en la TV espera a que pasen quietKeysMs sin teclas, y cada tecla reinicia la cuenta', () => {
    const f = fakes()
    let n = 0
    f.state.key = f.state.t - 200 // tecla hace 200 ms
    whenIdle(() => n++, { ...f.opts, quietKeysMs: 1000 })
    f.runIdle()
    expect(n).toBe(0) // faltan 800 ms
    f.advance(500)
    expect(n).toBe(0)
    f.state.key = f.state.t // otra tecla: vuelve a esperar 1000 ms
    f.advance(300) // vence el temporizador viejo: la tecla fue hace 300 ms, faltan 700
    expect(n).toBe(0)
    f.advance(600)
    expect(n).toBe(0)
    f.advance(200) // 1100 ms desde la última tecla
    expect(n).toBe(1)
  })

  it('sin teclas previas corre enseguida aunque quietKeysMs esté puesto', () => {
    const f = fakes()
    let n = 0
    whenIdle(() => n++, { ...f.opts, quietKeysMs: 1000 })
    f.runIdle()
    expect(n).toBe(1)
  })

  it('cancelar durante la espera de teclas frena el temporizador', () => {
    const f = fakes()
    let n = 0
    f.state.key = f.state.t - 100
    const cancel = whenIdle(() => n++, { ...f.opts, quietKeysMs: 1000 })
    f.runIdle()
    cancel()
    f.advance(5000)
    expect(n).toBe(0)
  })
})
