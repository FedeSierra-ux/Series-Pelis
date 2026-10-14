// Sincronización entre pestañas de los datos del usuario (auditoría #2).
//
// Antes cada pestaña (o la PWA instalada y una pestaña del navegador) guardaba su copia entera del
// progreso cada 5 s: la que escribía última borraba lo que había hecho la otra (posiciones, "visto",
// diario, ajustes). Ahora:
//   1. Cada escritura guarda solo lo que cambió (un "parche"), mezclado con lo que haya en IndexedDB en
//      la misma transacción: lo de la otra pestaña no se pisa.
//   2. Después avisa por BroadcastChannel (o el evento `storage` en navegadores sin él) y las otras
//      pestañas releen esa clave.

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Qué cambió entre dos versiones de un valor guardado. */
export type Patch =
  | { kind: 'replace'; value: unknown }
  | { kind: 'merge'; set: Record<string, unknown>; del: string[]; nested: Record<string, Patch> }

/**
 * Parche de `prev` a `next`. Con `depth` 1 se compara clave por clave (cada entrada del progreso, cada
 * ajuste); con 2 también un nivel más adentro (las entradas del diario). Las listas se reemplazan enteras.
 */
export function diffPatch(prev: unknown, next: unknown, depth: number): Patch {
  if (depth <= 0 || !isPlain(prev) || !isPlain(next)) return { kind: 'replace', value: next }
  const set: Record<string, unknown> = {}
  const nested: Record<string, Patch> = {}
  const del: string[] = []
  for (const [k, v] of Object.entries(next)) {
    if (Object.is(prev[k], v) && k in prev) continue
    if (depth > 1 && isPlain(prev[k]) && isPlain(v)) nested[k] = diffPatch(prev[k], v, depth - 1)
    else set[k] = v
  }
  for (const k of Object.keys(prev)) if (!(k in next)) del.push(k)
  return { kind: 'merge', set, del, nested }
}

/** Para un mismo id cambiado en las dos pestañas: cuál queda (por defecto, el de esta pestaña). */
export type Resolver = (key: string, ours: unknown, theirs: unknown) => unknown

/** Aplica el parche sobre lo guardado. `fallback` es el valor completo de esta pestaña, por si lo guardado está roto. */
export function applyPatch(stored: unknown, patch: Patch, fallback: unknown, resolve?: Resolver): unknown {
  if (patch.kind === 'replace') return patch.value
  if (!isPlain(stored)) return fallback
  const out: Record<string, unknown> = { ...stored }
  for (const [k, v] of Object.entries(patch.set)) out[k] = resolve && k in stored ? resolve(k, v, stored[k]) : v
  for (const k of patch.del) delete out[k]
  for (const [k, p] of Object.entries(patch.nested)) {
    out[k] = applyPatch(stored[k], p, isPlain(fallback) ? fallback[k] : undefined)
  }
  return out
}

/** Progreso: si las dos pestañas tocaron el mismo video, gana el guardado más nuevo (`updatedAt`). */
export const newestUpdate: Resolver = (_key, ours, theirs) => {
  const a = isPlain(ours) && typeof ours.updatedAt === 'number' ? ours.updatedAt : 0
  const b = isPlain(theirs) && typeof theirs.updatedAt === 'number' ? theirs.updatedAt : 0
  return b > a ? theirs : ours
}

// ---------- Aviso entre pestañas ----------

const CHANNEL = 'sp-store'
const STORAGE_KEY = 'sp-store-sync'
const handlers = new Map<string, () => void>()
let started = false
let channel: BroadcastChannel | undefined

function deliver(data: unknown) {
  if (isPlain(data) && typeof data.key === 'string') handlers.get(data.key)?.()
}

function start() {
  if (started) return
  started = true
  try {
    if (typeof BroadcastChannel === 'function') {
      channel = new BroadcastChannel(CHANNEL)
      channel.onmessage = (e: MessageEvent) => deliver(e.data)
      // En Node (tests) el canal no tiene que mantener vivo el proceso.
      ;(channel as unknown as { unref?: () => void }).unref?.()
      return
    }
  } catch {
    channel = undefined
  }
  // Safari < 15.4 y navegadores de TV viejos: el evento `storage` llega a las otras pestañas.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      try {
        deliver(JSON.parse(e.newValue))
      } catch {
        // Valor ajeno: se ignora.
      }
    })
  }
}

/** Cuando otra pestaña guarde `key`, llama a `fn`. */
export function onRemoteChange(key: string, fn: () => void) {
  start()
  handlers.set(key, fn)
}

/** Avisa a las otras pestañas que `key` cambió en IndexedDB. */
export function announce(key: string) {
  start()
  try {
    if (channel) channel.postMessage({ key })
    else if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify({ key, t: Date.now(), r: Math.random() }))
  } catch {
    // Sin canal ni localStorage: cada pestaña sigue sola, pero las escrituras ya no se pisan (se mezclan).
  }
}
