import { beforeAll, describe, expect, it } from 'vitest'
import {
  MAX_ENTRIES,
  STORAGE_KEY,
  needsReveal,
  recallSnapshot,
  rememberSnapshot,
  selectorFor,
  type SnapshotStore,
} from './focusMemory'

function fakeStore(): SnapshotStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  }
}

describe('rememberSnapshot / recallSnapshot', () => {
  it('guarda y recupera el foco y el scroll de una pantalla', () => {
    const store = fakeStore()
    rememberSnapshot(store, 'abc', { focus: 'a[href="/detail/movie/tt1"]', scrollY: 320.6 })
    expect(recallSnapshot(store, 'abc')).toEqual({ focus: 'a[href="/detail/movie/tt1"]', scrollY: 321 })
  })

  it('sin foco guarda solo el scroll', () => {
    const store = fakeStore()
    rememberSnapshot(store, 'k', { scrollY: 10 })
    expect(recallSnapshot(store, 'k')).toEqual({ scrollY: 10 })
  })

  it('devuelve nada para una pantalla desconocida o un storage roto', () => {
    const store = fakeStore()
    expect(recallSnapshot(store, 'nope')).toBeUndefined()
    store.data.set(STORAGE_KEY, '{no es json')
    expect(recallSnapshot(store, 'nope')).toBeUndefined()
    store.data.set(STORAGE_KEY, '[1,2]')
    expect(recallSnapshot(store, 'nope')).toBeUndefined()
  })

  it('volver a guardar la misma clave la reemplaza', () => {
    const store = fakeStore()
    rememberSnapshot(store, 'k', { focus: 'a', scrollY: 1 })
    rememberSnapshot(store, 'k', { scrollY: 2 })
    expect(recallSnapshot(store, 'k')).toEqual({ scrollY: 2 })
  })

  it('con más de 30 pantallas descarta las más antiguas', () => {
    const store = fakeStore()
    for (let i = 0; i < MAX_ENTRIES + 5; i++) rememberSnapshot(store, `k${i}`, { scrollY: i })
    const entries = JSON.parse(store.data.get(STORAGE_KEY)!)
    expect(Object.keys(entries)).toHaveLength(MAX_ENTRIES)
    expect(recallSnapshot(store, 'k0')).toBeUndefined()
    expect(recallSnapshot(store, 'k4')).toBeUndefined()
    expect(recallSnapshot(store, 'k5')).toEqual({ scrollY: 5 })
    expect(recallSnapshot(store, `k${MAX_ENTRIES + 4}`)).toEqual({ scrollY: MAX_ENTRIES + 4 })
  })

  it('tocar una clave vieja la vuelve reciente y no se descarta', () => {
    const store = fakeStore()
    for (let i = 0; i < MAX_ENTRIES; i++) rememberSnapshot(store, `k${i}`, { scrollY: i })
    rememberSnapshot(store, 'k0', { scrollY: 99 })
    rememberSnapshot(store, 'nueva', { scrollY: 0 })
    expect(recallSnapshot(store, 'k0')).toEqual({ scrollY: 99 })
    expect(recallSnapshot(store, 'k1')).toBeUndefined()
  })

  it('no explota si el storage falla al escribir', () => {
    const store: SnapshotStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded')
      },
    }
    expect(() => rememberSnapshot(store, 'k', { scrollY: 0 })).not.toThrow()
  })
})

describe('selectorFor', () => {
  it('prefiere data-focus-id, después href, id y data-id', () => {
    expect(selectorFor({ focusId: 'tt1:1:2', href: '/x' })).toBe('[data-focus-id="tt1:1:2"]')
    expect(selectorFor({ href: '/detail/movie/tt0133093', id: 'x' })).toBe('a[href="/detail/movie/tt0133093"]')
    expect(selectorFor({ id: 'play' })).toBe('[id="play"]')
    expect(selectorFor({ dataId: 'ep-3' })).toBe('[data-id="ep-3"]')
    expect(selectorFor({})).toBeUndefined()
  })

  it('escapa comillas en el valor', () => {
    expect(selectorFor({ href: '/a"b' })).toBe('a[href="/a\\"b"]')
  })
})

describe('needsReveal (póster debajo de la portada fija)', () => {
  it('sin nada fijo arriba, solo se recentra lo que se sale de la ventana', () => {
    expect(needsReveal({ top: 10, bottom: 300 }, 0, 900)).toBe(false)
    expect(needsReveal({ top: -5, bottom: 300 }, 0, 900)).toBe(true)
    expect(needsReveal({ top: 700, bottom: 950 }, 0, 900)).toBe(true)
  })

  it('un póster con la parte de arriba tapada por la portada se recentra (antes volvía tapado)', () => {
    // 1440×900: la portada termina en 380 y el póster del Top 10 quedaba en 285.
    expect(needsReveal({ top: 285, bottom: 600 }, 380, 900)).toBe(true)
    expect(needsReveal({ top: 400, bottom: 700 }, 380, 900)).toBe(false)
  })
})

describe('browse.css: la portada fija no cuenta como lugar visible', () => {
  // Con `?raw` vitest devuelve vacío para los .css: se lee el archivo (con `node:fs`, como `d1.testutil.ts`).
  let browseCss = ''
  beforeAll(async () => {
    const mod = 'node:fs'
    const { readFileSync } = (await import(/* @vite-ignore */ mod)) as { readFileSync: (p: URL, enc: 'utf8') => string }
    browseCss = readFileSync(new URL('../pages/discover/browse.css', import.meta.url), 'utf8')
  })
  // Si cambia el alto de `.browse-hero`, `scroll-padding-top` tiene que seguirlo: si no, las flechas, Tab y
  // "Atrás" vuelven a dejar los pósters tapados por la portada.
  it('`scroll-padding-top` usa el mismo alto que `.browse-hero`, solo donde la portada es fija', () => {
    const hero = /\.browse-hero \{[^}]*height: var\(--billboard-h\);[^}]*min-height: 300px;/.test(browseCss)
    expect(hero).toBe(true)
    const padding = browseCss.match(
      /@media \(min-width: 761px\) and \(min-height: 561px\) \{\s*html:has\(\.browse-hero\) \{\s*scroll-padding-top: ([^;]+);/,
    )
    expect(padding?.[1]).toBe('calc(max(300px, var(--billboard-h)) * var(--ui-zoom, 1))')
    // Los cortes del media query coinciden con donde la portada deja de ser fija.
    expect(browseCss).toContain('@media (max-height: 560px)')
    expect(browseCss).toContain('@media (max-width: 760px)')
  })
})
