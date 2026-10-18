import { describe, expect, it } from 'vitest'
import {
  arrangeCatalogs,
  DEFAULT_CATALOG_PREFS,
  interleaveMetas,
  mergeRows,
  moveRow,
  normalizePrefs,
  renameRow,
  rowShape,
  setRowHidden,
  setRowShape,
  splitLeadingVirtual,
  splitMerge,
  visibleRows,
  FORYOU_ROW_KEY,
  TRENDING_WEEK_ROW_KEY,
  type CatalogPrefs,
  type CatalogSource,
} from './catalogPrefs'
import type { CatalogDef, InstalledAddon } from './types'

const addon = (id: string, catalogs: CatalogDef[]): InstalledAddon => ({
  transportUrl: `https://${id}.example/manifest.json`,
  manifest: { id, version: '1.0.0', name: id.toUpperCase(), resources: ['catalog'], types: ['movie', 'series'], catalogs },
})

const a = addon('a', [
  { type: 'movie', id: 'top', name: 'Popular' },
  { type: 'series', id: 'top', name: 'Popular' },
])
const b = addon('b', [
  { type: 'movie', id: 'new', name: 'New' },
  { type: 'series', id: 'trending', name: 'Trending' },
])
const sources: CatalogSource[] = [a, b].flatMap((ad) => ad.manifest.catalogs.map((catalog) => ({ addon: ad, catalog })))
const label = (s: CatalogSource) => `${s.catalog.name} ${s.catalog.type} (${s.addon.manifest.name})`
const keys = (prefs: Partial<CatalogPrefs>) => arrangeCatalogs(sources, prefs, label).map((r) => r.key)

describe('arrangeCatalogs', () => {
  it('sin preferencias respeta el orden de los addons', () => {
    const rows = arrangeCatalogs(sources, DEFAULT_CATALOG_PREFS, label)
    expect(rows.map((r) => r.key)).toEqual(['cat:a|movie|top', 'cat:a|series|top', 'cat:b|movie|new', 'cat:b|series|trending'])
    expect(rows[0]).toMatchObject({ name: 'Popular movie (A)', renamed: false, hidden: false, merged: false, type: 'movie' })
  })

  it('aplica el orden guardado y deja al final las filas nuevas', () => {
    expect(keys({ order: ['cat:b|movie|new', 'cat:a|movie|top'] })).toEqual([
      'cat:b|movie|new',
      'cat:a|movie|top',
      'cat:a|series|top',
      'cat:b|series|trending',
    ])
  })

  it('ignora claves de catálogos que ya no existen', () => {
    expect(keys({ order: ['cat:zzz|movie|x', 'cat:b|series|trending'] })[0]).toBe('cat:b|series|trending')
  })

  it('renombra y oculta', () => {
    const rows = arrangeCatalogs(sources, { names: { 'cat:a|movie|top': 'Lo más visto' }, hidden: { 'cat:b|movie|new': true } }, label)
    expect(rows[0]).toMatchObject({ name: 'Lo más visto', defaultName: 'Popular movie (A)', renamed: true })
    expect(rows.find((r) => r.key === 'cat:b|movie|new')?.hidden).toBe(true)
    expect(visibleRows(rows).map((r) => r.key)).not.toContain('cat:b|movie|new')
  })

  it('las fusiones van en el lugar de su primer catálogo y juntan las fuentes', () => {
    const prefs: Partial<CatalogPrefs> = { merges: [{ id: 'x', type: 'movie', members: ['b|movie|new', 'a|movie|top'] }] }
    const rows = arrangeCatalogs(sources, prefs, label)
    expect(rows.map((r) => r.key)).toEqual(['merge:x', 'cat:a|series|top', 'cat:b|series|trending'])
    expect(rows[0].merged).toBe(true)
    expect(rows[0].sources.map((s) => s.addon.manifest.id)).toEqual(['b', 'a'])
    expect(rows[0].name).toBe('New movie (B) + Popular movie (A)')
  })

  it('una fusión con un addon desinstalado sigue mostrando el que queda', () => {
    const rows = arrangeCatalogs(sources, { merges: [{ id: 'x', type: 'movie', members: ['a|movie|top', 'gone|movie|top'] }] }, label)
    expect(rows[0]).toMatchObject({ key: 'merge:x', merged: true })
    expect(rows[0].sources).toHaveLength(1)
  })

  it('normaliza preferencias viejas o rotas', () => {
    expect(normalizePrefs(undefined)).toEqual(DEFAULT_CATALOG_PREFS)
    expect(normalizePrefs({ order: 'x' as unknown as string[] }).order).toEqual([])
  })
})

describe('moveRow', () => {
  const all = keys({})

  it('sube y baja una fila', () => {
    const p = moveRow(DEFAULT_CATALOG_PREFS, all, 'cat:b|movie|new', -1)
    expect(keys(p)).toEqual(['cat:a|movie|top', 'cat:b|movie|new', 'cat:a|series|top', 'cat:b|series|trending'])
  })

  it('no hace nada en los bordes', () => {
    expect(moveRow(DEFAULT_CATALOG_PREFS, all, 'cat:a|movie|top', -1)).toBe(DEFAULT_CATALOG_PREFS)
    expect(moveRow(DEFAULT_CATALOG_PREFS, all, 'cat:b|series|trending', 1)).toBe(DEFAULT_CATALOG_PREFS)
  })

  it('con un filtro intercambia con la vecina de la vista', () => {
    const series = all.filter((k) => k.includes('|series|'))
    const p = moveRow(DEFAULT_CATALOG_PREFS, all, 'cat:b|series|trending', -1, series)
    expect(keys(p)).toEqual(['cat:a|movie|top', 'cat:b|series|trending', 'cat:b|movie|new', 'cat:a|series|top'])
  })
})

describe('renameRow / setRowHidden', () => {
  it('nombre vacío vuelve al original', () => {
    const p = renameRow(renameRow(DEFAULT_CATALOG_PREFS, 'k', '  Mío  '), 'k', ' ')
    expect(p.names).toEqual({})
    expect(renameRow(DEFAULT_CATALOG_PREFS, 'k', '  Mío  ').names).toEqual({ k: 'Mío' })
  })

  it('mostrar borra la marca', () => {
    expect(setRowHidden(setRowHidden(DEFAULT_CATALOG_PREFS, 'k', true), 'k', false).hidden).toEqual({})
  })
})

describe('mergeRows / splitMerge', () => {
  it('fusiona dos filas del mismo tipo en el lugar de la primera', () => {
    const rows = arrangeCatalogs(sources, DEFAULT_CATALOG_PREFS, label)
    const { prefs, key } = mergeRows(DEFAULT_CATALOG_PREFS, rows, 'cat:b|movie|new', 'cat:a|movie|top', 'm1')
    expect(key).toBe('merge:m1')
    expect(prefs.merges).toEqual([{ id: 'm1', type: 'movie', members: ['b|movie|new', 'a|movie|top'] }])
    expect(keys(prefs)).toEqual(['cat:a|series|top', 'merge:m1', 'cat:b|series|trending'])
  })

  it('no fusiona tipos distintos', () => {
    const rows = arrangeCatalogs(sources, DEFAULT_CATALOG_PREFS, label)
    expect(mergeRows(DEFAULT_CATALOG_PREFS, rows, 'cat:a|movie|top', 'cat:a|series|top').key).toBeUndefined()
  })

  it('fusionar con una fusión la aplana y conserva el nombre propio', () => {
    let prefs: CatalogPrefs = renameRow(DEFAULT_CATALOG_PREFS, 'cat:a|series|top', 'Series')
    let rows = arrangeCatalogs(sources, prefs, label)
    prefs = mergeRows(prefs, rows, 'cat:a|series|top', 'cat:b|series|trending', 'm1').prefs
    rows = arrangeCatalogs(sources, prefs, label)
    expect(rows.find((r) => r.key === 'merge:m1')?.name).toBe('Series')
    const extra = addon('c', [{ type: 'series', id: 'x', name: 'X' }])
    const more = [...sources, { addon: extra, catalog: extra.manifest.catalogs[0] }]
    rows = arrangeCatalogs(more, prefs, label)
    prefs = mergeRows(prefs, rows, 'cat:c|series|x', 'merge:m1', 'm2').prefs
    expect(prefs.merges).toEqual([{ id: 'm2', type: 'series', members: ['c|series|x', 'a|series|top', 'b|series|trending'] }])
  })

  it('separar devuelve los catálogos al mismo lugar', () => {
    let rows = arrangeCatalogs(sources, DEFAULT_CATALOG_PREFS, label)
    const merged = mergeRows(DEFAULT_CATALOG_PREFS, rows, 'cat:a|movie|top', 'cat:b|movie|new', 'm1').prefs
    rows = arrangeCatalogs(sources, merged, label)
    const split = splitMerge(merged, rows, 'merge:m1')
    expect(split.merges).toEqual([])
    expect(keys(split)).toEqual(['cat:a|movie|top', 'cat:b|movie|new', 'cat:a|series|top', 'cat:b|series|trending'])
  })
})

describe('forma de las filas (U10)', () => {
  it('de fábrica: TMDB apaisada, addons y Mi lista con póster', () => {
    expect(rowShape(DEFAULT_CATALOG_PREFS, FORYOU_ROW_KEY)).toBe('landscape')
    expect(rowShape(DEFAULT_CATALOG_PREFS, TRENDING_WEEK_ROW_KEY)).toBe('landscape')
    expect(rowShape(DEFAULT_CATALOG_PREFS, 'cat:a|movie|top')).toBe('poster')
    expect(rowShape(DEFAULT_CATALOG_PREFS, 'home:watchlist')).toBe('poster')
    // Prefs viejas sin el campo.
    expect(rowShape({ order: [] }, FORYOU_ROW_KEY)).toBe('landscape')
    expect(normalizePrefs({ order: [] }).shapes).toEqual({})
  })

  it('solo guarda lo que difiere de fábrica', () => {
    const p = setRowShape(DEFAULT_CATALOG_PREFS, 'cat:a|movie|top', 'landscape')
    expect(p.shapes).toEqual({ 'cat:a|movie|top': 'landscape' })
    expect(setRowShape(p, 'cat:a|movie|top', 'poster').shapes).toEqual({})
    expect(setRowShape(DEFAULT_CATALOG_PREFS, FORYOU_ROW_KEY, 'poster').shapes).toEqual({ [FORYOU_ROW_KEY]: 'poster' })
    expect(rowShape({ shapes: { x: 'raro' as never } }, 'x')).toBe('poster')
  })

  it('fusionar conserva la forma de la primera y no pierde las demás', () => {
    let prefs = setRowShape(DEFAULT_CATALOG_PREFS, 'cat:a|movie|top', 'landscape')
    prefs = setRowShape(prefs, 'cat:a|series|top', 'landscape')
    const rows = arrangeCatalogs(sources, prefs, label)
    const merged = mergeRows(prefs, rows, 'cat:a|movie|top', 'cat:b|movie|new', 'm1').prefs
    expect(merged.shapes).toEqual({ 'merge:m1': 'landscape', 'cat:a|series|top': 'landscape' })
    const split = splitMerge(merged, arrangeCatalogs(sources, merged, label), 'merge:m1')
    expect(split.shapes).toEqual({ 'cat:a|series|top': 'landscape' })
  })
})

describe('interleaveMetas', () => {
  it('intercala sin repetir', () => {
    const m = (id: string) => ({ id, type: 'movie', name: id })
    expect(interleaveMetas([[m('1'), m('2'), m('3')], [m('2'), m('4')], []]).map((x) => x.id)).toEqual(['1', '2', '4', '3'])
  })
})

describe('filas propias de Inicio', () => {
  // Desde la v0.22.5 Inicio no tiene ninguna; se prueba con la "Mi lista" de antes.
  const WATCHLIST_ROW_KEY = 'home:watchlist'
  const arrange = (prefs: Partial<CatalogPrefs>) => arrangeCatalogs(sources, prefs, label, [{ key: WATCHLIST_ROW_KEY, name: 'Mi lista' }])

  it('de entrada va arriba de los catálogos (después de "Seguir viendo")', () => {
    const rows = arrange(DEFAULT_CATALOG_PREFS)
    expect(rows[0]).toMatchObject({ key: WATCHLIST_ROW_KEY, name: 'Mi lista', virtual: true, type: 'home', sources: [] })
    const { lead, rest } = splitLeadingVirtual(rows)
    expect(lead.map((r) => r.key)).toEqual([WATCHLIST_ROW_KEY])
    expect(rest.every((r) => !r.virtual)).toBe(true)
  })

  it('con un orden guardado de antes (sin la fila nueva) también queda arriba', () => {
    expect(arrange({ order: ['cat:b|movie|new', 'cat:a|movie|top'] }).map((r) => r.key).slice(0, 3)).toEqual([
      WATCHLIST_ROW_KEY,
      'cat:b|movie|new',
      'cat:a|movie|top',
    ])
  })

  it('se mueve, se oculta y se renombra como cualquier fila', () => {
    const rows = arrange(DEFAULT_CATALOG_PREFS)
    const keys = rows.map((r) => r.key)
    const moved = moveRow(normalizePrefs(DEFAULT_CATALOG_PREFS), keys, WATCHLIST_ROW_KEY, 1)
    const after = arrange(moved)
    expect(after.map((r) => r.key).slice(0, 2)).toEqual(['cat:a|movie|top', WATCHLIST_ROW_KEY])
    // Ya no está primera: va en su lugar entre los catálogos.
    expect(splitLeadingVirtual(after).lead).toEqual([])
    expect(splitLeadingVirtual(after).rest[1].key).toBe(WATCHLIST_ROW_KEY)

    const hidden = arrange(setRowHidden(DEFAULT_CATALOG_PREFS, WATCHLIST_ROW_KEY, true))
    expect(visibleRows(hidden).map((r) => r.key)).not.toContain(WATCHLIST_ROW_KEY)
    expect(arrange(renameRow(DEFAULT_CATALOG_PREFS, WATCHLIST_ROW_KEY, 'Para ver'))[0].name).toBe('Para ver')
  })

  it('Descubrir (sin filas propias) no la ve', () => {
    expect(arrangeCatalogs(sources, DEFAULT_CATALOG_PREFS, label).some((r) => r.virtual)).toBe(false)
  })
})
