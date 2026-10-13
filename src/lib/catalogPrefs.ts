import type { CatalogDef, InstalledAddon, MetaPreview } from './types'

// Gestor de catálogos: el usuario puede renombrar, ocultar, reordenar y fusionar las filas
// que salen en Inicio y Descubrir. Acá solo hay lógica pura (sin stores), para poder testearla.

export interface CatalogSource {
  addon: InstalledAddon
  catalog: CatalogDef
}

/** Dos o más catálogos del mismo tipo que se muestran como una sola fila. */
export interface CatalogMerge {
  /** Sin el prefijo `merge:`. */
  id: string
  type: string
  /** Claves de catálogo (`catalogId`). */
  members: string[]
}

export interface CatalogPrefs {
  /** Orden elegido de las filas (claves de fila). Las que no están van al final, en el orden natural. */
  order: string[]
  hidden: Record<string, boolean>
  /** Nombre propio de cada fila. */
  names: Record<string, string>
  merges: CatalogMerge[]
}

export const DEFAULT_CATALOG_PREFS: CatalogPrefs = { order: [], hidden: {}, names: {}, merges: [] }

export interface CatalogRowDef {
  /** `cat:<addon>|<tipo>|<catálogo>` o `merge:<id>` */
  key: string
  type: string
  /** Nombre a mostrar (el propio si lo renombró). */
  name: string
  /** Nombre que tendría sin renombrar. */
  defaultName: string
  renamed: boolean
  hidden: boolean
  merged: boolean
  sources: CatalogSource[]
}

/**
 * Clave estable de un catálogo. Usa el id del manifest (no la URL) para que sobreviva a
 * reconfigurar el addon, que cambia la URL pero no el id.
 */
export const catalogId = (addon: InstalledAddon, catalog: CatalogDef) => `${addon.manifest.id}|${catalog.type}|${catalog.id}`

export const singleRowKey = (addon: InstalledAddon, catalog: CatalogDef) => `cat:${catalogId(addon, catalog)}`
export const mergeRowKey = (id: string) => `merge:${id}`

/** Prefs guardadas (o importadas de una copia vieja) con todos los campos. */
export function normalizePrefs(p: Partial<CatalogPrefs> | undefined): CatalogPrefs {
  return {
    order: Array.isArray(p?.order) ? p.order : [],
    hidden: p?.hidden && typeof p.hidden === 'object' ? p.hidden : {},
    names: p?.names && typeof p.names === 'object' ? p.names : {},
    merges: Array.isArray(p?.merges) ? p.merges.filter((m) => m && Array.isArray(m.members)) : [],
  }
}

/**
 * Arma las filas a partir de los catálogos disponibles (en el orden de los addons) y las
 * preferencias. Devuelve también las ocultas (con `hidden: true`) para el gestor.
 */
export function arrangeCatalogs(
  sources: CatalogSource[],
  rawPrefs: Partial<CatalogPrefs> | undefined,
  label: (s: CatalogSource) => string,
): CatalogRowDef[] {
  const prefs = normalizePrefs(rawPrefs)
  const byId = new Map<string, CatalogSource>()
  for (const s of sources) if (!byId.has(catalogId(s.addon, s.catalog))) byId.set(catalogId(s.addon, s.catalog), s)

  const owner = new Map<string, CatalogMerge>()
  for (const m of prefs.merges) for (const id of m.members) if (!owner.has(id)) owner.set(id, m)

  const natural: CatalogRowDef[] = []
  const placed = new Set<string>()
  for (const [id, s] of byId) {
    const merge = owner.get(id)
    if (merge) {
      const key = mergeRowKey(merge.id)
      if (placed.has(key)) continue
      placed.add(key)
      const members = merge.members.map((m) => byId.get(m)).filter((x): x is CatalogSource => !!x)
      const defaultName = members.map(label).join(' + ')
      natural.push(row(key, merge.type, defaultName, members, true, prefs))
    } else {
      const key = `cat:${id}`
      natural.push(row(key, s.catalog.type, label(s), [s], false, prefs))
    }
  }

  const index = new Map(prefs.order.map((k, i) => [k, i]))
  const known = natural.filter((r) => index.has(r.key)).sort((a, b) => index.get(a.key)! - index.get(b.key)!)
  const unknown = natural.filter((r) => !index.has(r.key))
  return [...known, ...unknown]
}

function row(key: string, type: string, defaultName: string, sources: CatalogSource[], merged: boolean, prefs: CatalogPrefs): CatalogRowDef {
  const custom = prefs.names[key]?.trim()
  return {
    key,
    type,
    name: custom || defaultName,
    defaultName,
    renamed: !!custom,
    hidden: !!prefs.hidden[key],
    merged,
    sources,
  }
}

export const visibleRows = (rows: CatalogRowDef[]) => rows.filter((r) => !r.hidden)

/**
 * Sube o baja una fila. `viewKeys` es lo que ve el usuario (por ejemplo solo las series):
 * se intercambia con la vecina dentro de esa vista, aunque en el orden total haya otras en el medio.
 */
export function moveRow(prefs: CatalogPrefs, rowKeys: string[], key: string, delta: -1 | 1, viewKeys = rowKeys): CatalogPrefs {
  const view = viewKeys.indexOf(key)
  const neighbor = viewKeys[view + delta]
  if (view < 0 || !neighbor) return prefs
  const order = [...rowKeys]
  const i = order.indexOf(key)
  const j = order.indexOf(neighbor)
  if (i < 0 || j < 0) return prefs
  ;[order[i], order[j]] = [order[j], order[i]]
  return { ...prefs, order }
}

export function setRowHidden(prefs: CatalogPrefs, key: string, hidden: boolean): CatalogPrefs {
  const next = { ...prefs.hidden }
  if (hidden) next[key] = true
  else delete next[key]
  return { ...prefs, hidden: next }
}

export function renameRow(prefs: CatalogPrefs, key: string, name: string): CatalogPrefs {
  const next = { ...prefs.names }
  if (name.trim()) next[key] = name.trim()
  else delete next[key]
  return { ...prefs, names: next }
}

const membersOf = (prefs: CatalogPrefs, key: string): string[] =>
  key.startsWith('merge:') ? (prefs.merges.find((m) => mergeRowKey(m.id) === key)?.members ?? []) : [key.slice('cat:'.length)]

/**
 * Fusiona la fila `b` dentro de `a` (tienen que ser del mismo tipo). Si alguna ya era una
 * fusión se aplana. La fila nueva queda en el lugar de `a`, con su nombre propio si tenía.
 */
export function mergeRows(
  prefs: CatalogPrefs,
  rows: CatalogRowDef[],
  a: string,
  b: string,
  newId: string = Date.now().toString(36),
): { prefs: CatalogPrefs; key?: string } {
  const ra = rows.find((r) => r.key === a)
  const rb = rows.find((r) => r.key === b)
  if (!ra || !rb || a === b || ra.type !== rb.type) return { prefs }
  const members = [...new Set([...membersOf(prefs, a), ...membersOf(prefs, b)])]
  const key = mergeRowKey(newId)
  const merges = [
    ...prefs.merges.filter((m) => mergeRowKey(m.id) !== a && mergeRowKey(m.id) !== b),
    { id: newId, type: ra.type, members },
  ]
  const order = rows.map((r) => r.key).flatMap((k) => (k === a ? [key] : k === b ? [] : [k]))
  const names = { ...prefs.names }
  if (names[a]) names[key] = names[a]
  delete names[a]
  delete names[b]
  const hidden = { ...prefs.hidden }
  delete hidden[a]
  delete hidden[b]
  return { prefs: { order, hidden, names, merges }, key }
}

/** Deshace una fusión: los catálogos vuelven a ser filas sueltas en el mismo lugar. */
export function splitMerge(prefs: CatalogPrefs, rows: CatalogRowDef[], key: string): CatalogPrefs {
  const merge = prefs.merges.find((m) => mergeRowKey(m.id) === key)
  if (!merge) return prefs
  const singles = merge.members.map((m) => `cat:${m}`)
  const order = rows.map((r) => r.key).flatMap((k) => (k === key ? singles : [k]))
  const names = { ...prefs.names }
  delete names[key]
  const hidden = { ...prefs.hidden }
  delete hidden[key]
  return { order, hidden, names, merges: prefs.merges.filter((m) => m !== merge) }
}

/** Intercala los resultados de varios catálogos (uno de cada uno) sin repetir títulos. */
export function interleaveMetas(lists: MetaPreview[][]): MetaPreview[] {
  const out: MetaPreview[] = []
  const seen = new Set<string>()
  const longest = Math.max(0, ...lists.map((l) => l.length))
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const m = list[i]
      if (m && !seen.has(m.id)) {
        seen.add(m.id)
        out.push(m)
      }
    }
  }
  return out
}
