import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWithTimeout, isAbortError, timeoutSignal } from './abort'
import { errorText } from './errors'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('timeoutSignal (auditoría #9)', () => {
  it('se corta solo a los ms indicados, con un error que errorText entiende como "tardó demasiado"', () => {
    vi.useFakeTimers()
    const t = timeoutSignal(1000)
    expect(t.signal.aborted).toBe(false)
    vi.advanceTimersByTime(999)
    expect(t.signal.aborted).toBe(false)
    vi.advanceTimersByTime(1)
    expect(t.signal.aborted).toBe(true)
    expect(errorText(t.signal.reason)).toMatch(/Tardó demasiado/)
  })

  it('se corta cuando se corta la señal de afuera (también si ya venía cortada)', () => {
    const outer = new AbortController()
    const t = timeoutSignal(60_000, outer.signal)
    outer.abort()
    expect(t.signal.aborted).toBe(true)
    t.clear()
    const already = new AbortController()
    already.abort()
    expect(timeoutSignal(60_000, already.signal).signal.aborted).toBe(true)
  })

  it('clear() suelta el temporizador: después ya no se corta', () => {
    vi.useFakeTimers()
    const t = timeoutSignal(100)
    t.clear()
    vi.advanceTimersByTime(1000)
    expect(t.signal.aborted).toBe(false)
  })

  it('anda en navegadores sin AbortSignal.timeout ni abort(reason) (TVs viejas)', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('AbortSignal', Object.assign(function () {}, { timeout: undefined }))
    // fetch que solo termina si lo cortan.
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))))
    const p = fetchWithTimeout('https://x.example', { timeoutMs: 4000 })
    vi.advanceTimersByTime(4000)
    await expect(p).rejects.toSatisfy(isAbortError)
  })
})

// `AbortSignal.timeout` no existe en webOS 5/6 ni Tizen 5.5/6: tiene que pasar siempre por lib/abort.ts.
const SOURCES = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!./abort.ts'], { query: '?raw', import: 'default', eager: true })

describe('sin AbortSignal.timeout ni AbortSignal.any en el código de la app', () => {
  it('se usa timeoutSignal / fetchWithTimeout', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50)
    const bad = Object.entries(SOURCES).flatMap(([file, text]) =>
      text
        .split('\n')
        .map((line, i) => (/AbortSignal\.(timeout|any)\(/.test(line) ? `${file}:${i + 1}` : ''))
        .filter(Boolean),
    )
    expect(bad).toEqual([])
  })
})
