// Lógica pura de la sincronización con la casa (v0.17), sin red ni IndexedDB, para poder probarla.
// El motor que la usa está en cloudSync.ts y el servidor en functions/api/sync.ts.
//
// Cada store se parte en filas (clave → valor). La "sombra" es el último valor de cada fila que ya está
// contado (subido o bajado); lo que cambió respecto de ella queda "pendiente" con la hora del cambio.
// Al bajar, por cada fila gana la más nueva: si lo pendiente de acá es más nuevo, se sube; si no, se aplica.

export type SyncScope = 'global' | 'house' | 'profile'

export interface SyncAdapter<T = unknown> {
  scope: SyncScope
  /** Nombre del store en el servidor (único entre todos los alcances). */
  name: string
  get(): T
  set(fn: (prev: T) => T): void
  subscribe(listener: () => void): () => void
  /** Filas del estado actual. */
  toItems(state: T): Record<string, unknown>
  /** Aplica filas que llegaron del servidor (`null` = borrada). Lo inválido se ignora. */
  apply(state: T, changes: Record<string, unknown | null>): T
  /** Hora propia de una fila (ej. `updatedAt`): en la primera sincronización decide quién gana. */
  time?(value: unknown): number | undefined
}

export interface Pending {
  /** JSON del valor; `null` si se borró. */
  v: string | null
  u: number
}

export interface SyncState {
  /** La casa de estos datos: si el aparato entra a otra, se empieza de cero. */
  house: string
  /** Hasta dónde se bajó (cursor del servidor). */
  cursor: string
  /** Ya se bajó todo una vez: desde ahí los cambios llevan la hora en que se hicieron. */
  synced: boolean
  shadow: Record<string, Record<string, string>>
  pending: Record<string, Record<string, Pending>>
  /** v0.18: lo del perfil va en un estado aparte. Un estado de la v0.17 no lo tiene (ver `splitState`). */
  split?: boolean
}

export interface ServerItem {
  s: SyncScope
  t: string
  k: string
  v: string | null
  u: number
  d?: 1
}

export const emptyState = (house: string): SyncState => ({ house, cursor: '', synced: false, shadow: {}, pending: {} })

/**
 * Parte un estado de la v0.17 (todo junto) en dos: devuelve uno nuevo con los stores `names` (los del perfil),
 * con el mismo cursor, y los saca del original, que queda marcado `split`. Así no se baja ni se sube nada de nuevo.
 */
export function splitState(state: SyncState, names: readonly string[]): SyncState {
  const out: SyncState = { house: state.house, cursor: state.cursor, synced: state.synced, shadow: {}, pending: {}, split: true }
  for (const n of names) {
    if (state.shadow[n]) out.shadow[n] = state.shadow[n]
    if (state.pending[n]) out.pending[n] = state.pending[n]
    delete state.shadow[n]
    delete state.pending[n]
  }
  state.split = true
  return out
}

/**
 * Anota como pendiente lo que cambió en los stores desde la última vez. `canPush` dice qué alcances puede
 * cambiar este aparato (los addons, solo el admin): lo demás no se anota y lo del servidor manda.
 * Devuelve cuántas filas cambiaron.
 */
export function capture(state: SyncState, adapters: SyncAdapter[], now: number, canPush: (scope: SyncScope) => boolean): number {
  let changed = 0
  for (const a of adapters) {
    if (!canPush(a.scope)) continue
    const items = a.toItems(a.get())
    const shadow = (state.shadow[a.name] ??= {})
    const pending = (state.pending[a.name] ??= {})
    for (const [k, value] of Object.entries(items)) {
      if (value === undefined) continue
      const json = JSON.stringify(value)
      if (shadow[k] === json) continue
      shadow[k] = json
      // La primera vez, lo de acá lleva su propia hora (o 0): así lo más nuevo de cada lado queda.
      pending[k] = { v: json, u: state.synced ? now : Math.max(0, a.time?.(value) ?? 0) }
      changed++
    }
    for (const k of Object.keys(shadow)) {
      if (items[k] !== undefined) continue
      delete shadow[k]
      pending[k] = { v: null, u: now }
      changed++
    }
  }
  return changed
}

/**
 * Aplica filas bajadas del servidor. Lo pendiente de acá más nuevo se deja (se va a subir); en un empate
 * gana el servidor. Devuelve cuántas filas se aplicaron.
 */
export function applyItems(state: SyncState, adapters: SyncAdapter[], items: ServerItem[]): number {
  const byName = new Map(adapters.map((a) => [a.name, a]))
  const changes = new Map<SyncAdapter, Record<string, unknown | null>>()
  for (const it of items) {
    const a = byName.get(it.t)
    if (!a || a.scope !== it.s) continue
    const pending = state.pending[a.name]
    const mine = pending?.[it.k]
    if (mine && mine.u > it.u) continue
    if (mine) delete pending[it.k]
    const v = it.d ? null : it.v
    const shadow = (state.shadow[a.name] ??= {})
    if (v === (shadow[it.k] ?? null)) continue
    let value: unknown = null
    if (v !== null) {
      try {
        value = JSON.parse(v)
      } catch {
        continue
      }
    }
    let rows = changes.get(a)
    if (!rows) changes.set(a, (rows = {}))
    rows[it.k] = value
  }
  let applied = 0
  for (const [a, rows] of changes) {
    a.set((prev) => a.apply(prev, rows))
    // La sombra queda con lo que el store tiene ahora (normalizado), así no se vuelve a subir.
    const now = a.toItems(a.get())
    const shadow = state.shadow[a.name]
    for (const k of Object.keys(rows)) {
      if (now[k] === undefined) delete shadow[k]
      else shadow[k] = JSON.stringify(now[k])
      applied++
    }
  }
  return applied
}

/**
 * Lo que este aparato no puede cambiar (los addons, si no es el admin) vuelve a lo último que mandó el
 * servidor: así una copia importada o un addon agregado a mano no quedan distintos al resto de las casas.
 * Devuelve cuántas filas se corrigieron.
 */
export function enforceReadOnly(state: SyncState, adapters: SyncAdapter[], canPush: (scope: SyncScope) => boolean): number {
  let fixed = 0
  for (const a of adapters) {
    if (canPush(a.scope)) continue
    const shadow = state.shadow[a.name]
    if (!shadow || !Object.keys(shadow).length) continue
    const items = a.toItems(a.get())
    const rows: Record<string, unknown> = {}
    for (const [k, json] of Object.entries(shadow)) {
      if (JSON.stringify(items[k]) !== json) rows[k] = JSON.parse(json)
    }
    const n = Object.keys(rows).length
    if (!n) continue
    a.set((prev) => a.apply(prev, rows))
    fixed += n
  }
  return fixed
}

export interface Outgoing {
  s: SyncScope
  t: string
  k: string
  v: string | null
  u: number
  d?: 1
  /** Lo pendiente que se manda (para sacarlo solo si no cambió mientras tanto). */
  ref: Pending
}

/** Lo pendiente en tandas (filas y tamaño), en el formato del servidor. */
export function outgoing(state: SyncState, adapters: SyncAdapter[], maxItems = 200, maxBytes = 400_000): Outgoing[][] {
  const batches: Outgoing[][] = []
  let cur: Outgoing[] = []
  let bytes = 0
  for (const a of adapters) {
    for (const [k, p] of Object.entries(state.pending[a.name] ?? {})) {
      const size = (p.v?.length ?? 0) + k.length + 40
      if (cur.length && (cur.length >= maxItems || bytes + size > maxBytes)) {
        batches.push(cur)
        cur = []
        bytes = 0
      }
      cur.push({ s: a.scope, t: a.name, k, v: p.v, u: p.u, ...(p.v === null ? { d: 1 as const } : {}), ref: p })
      bytes += size
    }
  }
  if (cur.length) batches.push(cur)
  return batches
}

/** Saca de pendientes lo que ya se subió (si no volvió a cambiar mientras tanto). */
export function markSent(state: SyncState, sent: Outgoing[]) {
  for (const o of sent) {
    const pending = state.pending[o.t]
    if (pending?.[o.k] === o.ref) delete pending[o.k]
  }
}

export const pendingCount = (state: SyncState) => Object.values(state.pending).reduce((n, p) => n + Object.keys(p).length, 0)

// ---------- Adaptadores de los stores ----------

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

interface StoreLike<T> {
  get(): T
  set(fn: (prev: T) => T): void
  subscribe(listener: () => void): () => void
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Un store `{ id: objeto }`: cada entrada es una fila. `timeField` es su hora propia. */
export function recordAdapter<E>(scope: SyncScope, name: string, store: StoreLike<Record<string, E>>, timeField: string): SyncAdapter<Record<string, E>> {
  return {
    scope,
    name,
    get: store.get,
    set: (fn) => store.set(fn),
    subscribe: store.subscribe,
    toItems: (s) => s,
    apply: (s, changes) => patchRecord(s, changes, (v): v is E => isPlain(v)),
    time: (v) => (isPlain(v) ? num(v[timeField]) : undefined),
  }
}

function patchRecord<E>(s: Record<string, E>, changes: Record<string, unknown | null>, valid: (v: unknown) => v is E): Record<string, E> {
  const out = { ...s }
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) delete out[k]
    else if (valid(v)) out[k] = v
  }
  return out
}

/** Algunos campos de un objeto de ajustes: cada campo es una fila. Lo que no tenga el mismo tipo se ignora. */
export function fieldsAdapter<S extends object>(scope: SyncScope, name: string, store: StoreLike<S>, fields: readonly (keyof S & string)[]): SyncAdapter<S> {
  return {
    scope,
    name,
    get: store.get,
    set: (fn) => store.set(fn),
    subscribe: store.subscribe,
    toItems: (s) => Object.fromEntries(fields.map((f) => [f, s[f]])),
    apply: (s, changes) => {
      const out = { ...s } as Record<string, unknown>
      for (const [k, v] of Object.entries(changes)) {
        if (!(fields as readonly string[]).includes(k) || v === null) continue
        const cur = out[k]
        if (typeof v !== typeof cur || Array.isArray(v) !== Array.isArray(cur)) continue
        // Los objetos (estilo de subtítulos, reglas de fuentes) se completan con lo de acá: un campo nuevo no se pierde.
        out[k] = isPlain(cur) && isPlain(v) ? { ...cur, ...v } : v
      }
      return out as S
    },
  }
}
