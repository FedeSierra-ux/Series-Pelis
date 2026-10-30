import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMPACT_BAR_QUERY, COARSE_POINTER_QUERY, NARROW_QUERY, PHONE_LANDSCAPE_QUERY, REDUCED_MOTION_QUERY, TINY_BAR_QUERY, TOUCH_QUERY, WIDE_PAGE_QUERY, WIDE_QUERY } from './mediaQueries'

// `useMediaQuery` es un `useSyncExternalStore`: se mockea para ver qué le pasa (suscripción, valor del primer
// render y valor del servidor) sin necesitar un DOM.
const uses = vi.hoisted(() => [] as { subscribe: (cb: () => void) => () => void; getSnapshot: () => boolean; getServerSnapshot?: () => boolean }[])
vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  useSyncExternalStore: (subscribe: (cb: () => void) => () => void, getSnapshot: () => boolean, getServerSnapshot?: () => boolean) => {
    uses.push({ subscribe, getSnapshot, getServerSnapshot })
    return (getServerSnapshot ?? getSnapshot)()
  },
}))

const { matchesNow, prefersReducedMotion, subscribeMedia, useMediaQuery } = await import('./media')

interface FakeMql {
  matches: boolean
  addEventListener?: ReturnType<typeof vi.fn>
  removeEventListener?: ReturnType<typeof vi.fn>
  addListener?: ReturnType<typeof vi.fn>
  removeListener?: ReturnType<typeof vi.fn>
}

function stubMatchMedia(table: Record<string, boolean>, extra: Partial<FakeMql> = {}) {
  const lists: Record<string, FakeMql> = {}
  const fn = vi.fn((q: string) => (lists[q] ??= { matches: !!table[q], addEventListener: vi.fn(), removeEventListener: vi.fn(), ...extra }))
  vi.stubGlobal('matchMedia', fn)
  return { fn, lists }
}

afterEach(() => {
  vi.unstubAllGlobals()
  uses.length = 0
})

describe('matchesNow', () => {
  it('lee el valor actual de la consulta', () => {
    stubMatchMedia({ [NARROW_QUERY]: true })
    expect(matchesNow(NARROW_QUERY)).toBe(true)
    expect(matchesNow(WIDE_QUERY)).toBe(false)
  })

  it('da false sin matchMedia (node, servidor) o si tira', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(matchesNow(NARROW_QUERY)).toBe(false)
    vi.stubGlobal('matchMedia', () => {
      throw new Error('consulta rota')
    })
    expect(matchesNow('(??)')).toBe(false)
  })

  it('prefersReducedMotion es la consulta de reducir movimiento', () => {
    const { fn } = stubMatchMedia({ [REDUCED_MOTION_QUERY]: true })
    expect(prefersReducedMotion()).toBe(true)
    expect(fn).toHaveBeenCalledWith(REDUCED_MOTION_QUERY)
  })
})

describe('subscribeMedia', () => {
  it('escucha "change" y la limpieza saca el mismo oyente', () => {
    const { lists } = stubMatchMedia({})
    const cb = vi.fn()
    const off = subscribeMedia(NARROW_QUERY, cb)
    const mq = lists[NARROW_QUERY]
    expect(mq.addEventListener).toHaveBeenCalledWith('change', cb)
    expect(mq.removeEventListener).not.toHaveBeenCalled()
    off()
    expect(mq.removeEventListener).toHaveBeenCalledWith('change', cb)
  })

  it('en navegadores de TV viejos (solo addListener) usa addListener/removeListener', () => {
    const { lists } = stubMatchMedia({}, { addEventListener: undefined, removeEventListener: undefined, addListener: vi.fn(), removeListener: vi.fn() })
    const cb = vi.fn()
    const off = subscribeMedia(NARROW_QUERY, cb)
    const mq = lists[NARROW_QUERY]
    expect(mq.addListener).toHaveBeenCalledWith(cb)
    off()
    expect(mq.removeListener).toHaveBeenCalledWith(cb)
  })

  it('sin matchMedia (o con una consulta rota) no se suscribe a nada y la limpieza no tira', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(() => subscribeMedia(NARROW_QUERY, () => {})()).not.toThrow()
    vi.stubGlobal('matchMedia', () => {
      throw new Error('consulta rota')
    })
    expect(() => subscribeMedia('(??)', () => {})()).not.toThrow()
  })
})

describe('useMediaQuery', () => {
  it('el primer render ya trae el valor real (no arranca en false y corrige después)', () => {
    stubMatchMedia({ [NARROW_QUERY]: true })
    // En el cliente React usa `getSnapshot` en el primer render; el valor del servidor es solo para renderToString.
    useMediaQuery(NARROW_QUERY)
    const [use] = uses
    expect(use.getSnapshot()).toBe(true)
    expect(use.getServerSnapshot?.()).toBe(false)
  })

  it('el valor se vuelve a leer en cada cambio (gira el celular)', () => {
    const { lists } = stubMatchMedia({ [PHONE_LANDSCAPE_QUERY]: false })
    useMediaQuery(PHONE_LANDSCAPE_QUERY)
    const [use] = uses
    expect(use.getSnapshot()).toBe(false)
    lists[PHONE_LANDSCAPE_QUERY].matches = true
    expect(use.getSnapshot()).toBe(true)
  })

  it('se suscribe a la consulta y devuelve la limpieza', () => {
    const { lists } = stubMatchMedia({})
    useMediaQuery(TOUCH_QUERY)
    const [use] = uses
    const onChange = vi.fn()
    const off = use.subscribe(onChange)
    expect(lists[TOUCH_QUERY].addEventListener).toHaveBeenCalledWith('change', onChange)
    off()
    expect(lists[TOUCH_QUERY].removeEventListener).toHaveBeenCalledWith('change', onChange)
  })

  it('sin matchMedia da false', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(useMediaQuery(NARROW_QUERY)).toBe(false)
    expect(uses[0].getSnapshot()).toBe(false)
  })
})

describe('consultas con nombre', () => {
  it('los cortes de ancho siguen siendo los del CSS', () => {
    expect(NARROW_QUERY).toBe('(max-width: 760px)')
    expect(WIDE_PAGE_QUERY).toBe('(min-width: 761px)')
    expect(WIDE_QUERY).toBe('(min-width: 1024px)')
    expect(COMPACT_BAR_QUERY).toBe(`${NARROW_QUERY} and (pointer: coarse)`)
    expect(TINY_BAR_QUERY).toBe('(max-width: 359px) and (pointer: coarse)')
    expect(PHONE_LANDSCAPE_QUERY).toBe('(pointer: coarse) and (max-height: 500px)')
    expect(TOUCH_QUERY).toBe('(hover: none) and (pointer: coarse)')
    expect(COARSE_POINTER_QUERY).toBe('(pointer: coarse)')
    expect(REDUCED_MOTION_QUERY).toBe('(prefers-reduced-motion: reduce)')
  })

  it('nadie más define estas consultas a mano en el código (un solo lugar)', () => {
    const sources = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!./mediaQueries.ts'], { query: '?raw', import: 'default', eager: true })
    const literal = /['"`]\((?:max-width: 760px|min-width: 761px|min-width: 1024px|prefers-reduced-motion: reduce|hover: none\) and \(pointer: coarse|pointer: coarse)\b/
    const bad = Object.entries(sources)
      .filter(([, text]) => literal.test(text))
      .map(([file]) => file)
    expect(bad).toEqual([])
  })

  it('el código no tiene otra implementación de matchMedia + suscripción', () => {
    const sources = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!./media.ts'], { query: '?raw', import: 'default', eager: true })
    const bad = Object.entries(sources)
      .filter(([, text]) => /addEventListener\(\s*['"]change['"]/.test(text) && /matchMedia\(/.test(text))
      .map(([file]) => file)
    expect(bad).toEqual([])
  })
})
