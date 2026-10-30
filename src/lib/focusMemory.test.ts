import { beforeAll, describe, expect, it } from 'vitest'
import {
  MAX_ENTRIES,
  RETRY_MS,
  RESTORE_QUIET_MS,
  RETRY_NO_ROW_MS,
  STORAGE_KEY,
  needsReveal,
  restoreWaitMs,
  pickMatch,
  recallSnapshot,
  rememberSnapshot,
  selectorFor,
  withinQuiet,
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

describe('pickMatch (el mismo póster en varias filas)', () => {
  const rows = ['Top 10 de hoy', 'Para vos', 'Porque viste Breaking Bad']

  it('vuelve al de la fila guardada, no a la primera copia', () => {
    expect(pickMatch(rows, { row: 'Porque viste Breaking Bad', nth: 2 }, 'ready', false)).toBe(2)
    expect(pickMatch(rows, { row: 'Para vos', nth: 1 }, 'ready', false)).toBe(1)
  })

  it('espera si la fila guardada todavía no está o está cargando', () => {
    expect(pickMatch(['Top 10 de hoy'], { row: 'Netflix', nth: 1 }, 'missing', false)).toBe('wait')
    expect(pickMatch(['Top 10 de hoy'], { row: 'Netflix', nth: 1 }, 'loading', false)).toBe('wait')
    expect(pickMatch([], { row: 'Netflix' }, 'loading', false)).toBe('wait')
  })

  it('si la fila ya cargó sin él, o se acabó la espera, usa el lugar entre los iguales', () => {
    expect(pickMatch(rows, { row: 'Seguir viendo', nth: 1 }, 'ready', false)).toBe(1)
    expect(pickMatch(rows, { row: 'Netflix', nth: 2 }, 'missing', true)).toBe(2)
    expect(pickMatch(['Top 10 de hoy'], { row: 'Netflix', nth: 4 }, 'missing', true)).toBe(0)
  })

  it('sin fila guardada (grilla, ficha): el mismo lugar, o el primero', () => {
    expect(pickMatch([undefined, undefined], { nth: 1 }, 'ready', false)).toBe(1)
    expect(pickMatch([undefined], {}, 'ready', false)).toBe(0)
  })

  it('sin ninguno: espera, y al final se rinde', () => {
    expect(pickMatch([], {}, 'ready', false)).toBe('wait')
    expect(pickMatch([], { row: 'Netflix' }, 'missing', true)).toBe(-1)
  })
})

describe('instantánea con fila y scroll horizontal', () => {
  it('guarda la fila, el lugar y el scroll de la fila', () => {
    const store = fakeStore()
    rememberSnapshot(store, 'k', { focus: 'a[href="/detail/series/tt1"]', scrollY: 900, row: 'Para vos', nth: 1, rowLeft: 2462.4 })
    expect(recallSnapshot(store, 'k')).toEqual({ focus: 'a[href="/detail/series/tt1"]', scrollY: 900, row: 'Para vos', nth: 1, rowLeft: 2462 })
  })

  it('sin foco no guarda nada de la fila', () => {
    const store = fakeStore()
    rememberSnapshot(store, 'k', { scrollY: 10, row: 'Para vos', nth: 1, rowLeft: 40 })
    expect(recallSnapshot(store, 'k')).toEqual({ scrollY: 10 })
  })
})

describe('needsReveal en horizontal (póster fuera de su fila)', () => {
  const row = { left: 0, right: 1280 }
  it('dentro de la fila no hace falta', () => {
    expect(needsReveal({ top: 300, bottom: 600, left: 900, right: 1100 }, 0, 800, row)).toBe(false)
  })
  it('afuera, a la derecha o a la izquierda, sí', () => {
    expect(needsReveal({ top: 300, bottom: 600, left: 3203, right: 3400 }, 0, 800, row)).toBe(true)
    expect(needsReveal({ top: 300, bottom: 600, left: -150, right: 40 }, 0, 800, row)).toBe(true)
  })
})

describe('cuánto esperar al elemento guardado (tv-15)', () => {
  it('en una fila se espera la carga perezosa; fuera de una fila, poco (si no aparece, ya no existe)', () => {
    expect(restoreWaitMs({ row: 'Seguir viendo' })).toBe(RETRY_MS)
    expect(restoreWaitMs({})).toBe(RETRY_NO_ROW_MS)
    expect(RETRY_NO_ROW_MS).toBeLessThan(RETRY_MS)
  })
})

describe('tv-03: el tráiler espera después de restaurar el foco', () => {
  it('poco después de restaurar el foco no se arma; después sí', () => {
    expect(withinQuiet(1000, 1000 + RESTORE_QUIET_MS - 1)).toBe(true)
    expect(withinQuiet(1000, 1000 + RESTORE_QUIET_MS)).toBe(false)
    // Sin restauración previa (el valor inicial) nunca está "recién restaurado".
    expect(withinQuiet(-Infinity, 5)).toBe(false)
  })
})
