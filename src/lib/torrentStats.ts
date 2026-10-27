// v0.31.1: lo que se ve mientras carga un torrent ("Conectando con el torrent…"), como Stremio: peers, seeds,
// velocidad y cuánto se bajó, más el estado de la red para saber si está cargando o no llega nada. Lógica pura: la
// pantalla (`pages/player/StremioPrepare.tsx`) solo pide `/<infoHash>/stats.json` y dibuja lo que sale de acá.
//
// Sirve con el motor de la app de Windows (todos los campos) y con Stremio Service (solo peers, velocidad y bajado:
// los demás campos no los tiene, y lo que falta no se muestra).

import { formatSpeed } from './stremioServer'

/** `/<infoHash>/stats.json`, ya limpio. Lo que el servidor no informa queda `undefined`. */
export interface TorrentStats {
  /** Peers conectados. */
  peers: number
  /** Peers encontrados (trackers + DHT), conectados o no. */
  found?: number
  /** De los conectados, cuántos tienen el torrent entero (se sabe recién con la metadata). */
  seeds?: number
  /** Seeds y leechers de todo el enjambre según los trackers. */
  swarmSeeds?: number
  swarmLeechers?: number
  /** Bytes por segundo. */
  speed: number
  /** Bytes bajados. */
  downloaded?: number
  /** Nodos de la DHT que responden (0 = la DHT no llega a la red). */
  dhtNodes?: number
  /** Trackers del torrent y cuántos contestaron. */
  trackers?: number
  trackersOk?: number
  /** El cliente de torrents del motor se cayó (mensaje del error). */
  engineError?: string
}

const count = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined)

/** `stats.json` del motor de Windows o de Stremio Service → `TorrentStats`. Cualquier otra cosa: 0 peers, 0 B/s. */
export function parseTorrentStats(raw: unknown): TorrentStats {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const stats: TorrentStats = { peers: count(s.peers) ?? 0, speed: count(s.downloadSpeed) ?? 0 }
  // Stremio Service llama `swarmSize` a los encontrados.
  const found = count(s.found) ?? count(s.swarmSize)
  if (found !== undefined) stats.found = Math.max(found, stats.peers)
  const fields = ['seeds', 'swarmSeeds', 'swarmLeechers', 'downloaded', 'dhtNodes', 'trackers', 'trackersOk'] as const
  for (const f of fields) {
    const v = count(s[f])
    if (v !== undefined) stats[f] = v
  }
  if (typeof s.engineError === 'string' && s.engineError.trim()) stats.engineError = s.engineError.trim().slice(0, 140)
  return stats
}

/** Seeds que informa el addon en el texto de la fuente (Torrentio: "👤 123"). */
export function addonSeeders(stream: { name?: string; title?: string; description?: string } | undefined): number | undefined {
  if (!stream) return undefined
  const text = [stream.title, stream.description, stream.name].filter(Boolean).join('\n')
  const m = /👤\s*([\d.,]+)/u.exec(text)
  if (!m) return undefined
  const n = Number(m[1].replace(/[.,]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

/** Bytes → "850 KB" / "14 MB" / "1,2 GB". */
export function formatBytes(bytes: number): string {
  const b = Math.max(0, bytes)
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`
  if (b < 1024 * 1024 * 1024) return `${Math.round(b / (1024 * 1024))} MB`
  return `${(b / (1024 * 1024 * 1024)).toLocaleString('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} GB`
}

/** Desde cuándo, sin peers, se explica qué pasa (antes, buscar es normal). */
export const STATS_HINT_AFTER_MS = 15_000

export interface StatsRow {
  label: string
  value: string
}

export interface StatsView {
  rows: StatsRow[]
  /** Explicación cuando no conecta (solo pasado `STATS_HINT_AFTER_MS` y sin peers). */
  hint?: string
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es-AR')} ${n === 1 ? one : many}`

/**
 * Qué mostrar: filas Peers / Seeds / Velocidad / Bajado / Red (solo las que se saben) y, si pasado un rato no hay
 * nadie, por qué. `addonSeeds` es lo que dijo el addon de esa fuente (para comparar con lo que ve el motor).
 */
export function statsView(stats: TorrentStats | undefined, opts: { addonSeeds?: number; elapsedMs: number }): StatsView {
  const rows: StatsRow[] = []
  if (!stats) {
    if (opts.addonSeeds !== undefined) rows.push({ label: 'Seeds', value: `${opts.addonSeeds.toLocaleString('es-AR')} según el addon` })
    return { rows }
  }

  const peers = [plural(stats.peers, 'conectado', 'conectados')]
  if (stats.found !== undefined && stats.found > stats.peers) peers.push(plural(stats.found, 'encontrado', 'encontrados'))
  rows.push({ label: 'Peers', value: peers.join(' · ') })

  const seeds: string[] = []
  if (stats.seeds !== undefined && stats.peers > 0) seeds.push(plural(stats.seeds, 'conectado', 'conectados'))
  if (stats.swarmSeeds !== undefined) seeds.push(`${stats.swarmSeeds.toLocaleString('es-AR')} en total`)
  else if (opts.addonSeeds !== undefined) seeds.push(`${opts.addonSeeds.toLocaleString('es-AR')} según el addon`)
  if (seeds.length) rows.push({ label: 'Seeds', value: seeds.join(' · ') })

  rows.push({ label: 'Velocidad', value: formatSpeed(stats.speed) })
  if (stats.downloaded !== undefined && stats.downloaded > 0) rows.push({ label: 'Bajado', value: formatBytes(stats.downloaded) })

  const net: string[] = []
  if (stats.dhtNodes !== undefined) net.push(plural(stats.dhtNodes, 'nodo DHT', 'nodos DHT'))
  if (stats.trackers !== undefined && stats.trackers > 0) net.push(`${stats.trackersOk ?? 0} de ${plural(stats.trackers, 'tracker', 'trackers')}`)
  if (net.length) rows.push({ label: 'Red', value: net.join(' · ') })

  return { rows, hint: statsHint(stats, opts.elapsedMs) }
}

function statsHint(stats: TorrentStats, elapsedMs: number): string | undefined {
  if (stats.engineError) return `El motor de torrents falló (${stats.engineError}). Volvé atrás y probá de nuevo.`
  if (stats.peers > 0 || elapsedMs < STATS_HINT_AFTER_MS) return undefined
  // Solo con lo que informa el motor de la app de Windows (Stremio Service no dice nada de esto).
  const netKnown = stats.dhtNodes !== undefined && stats.trackersOk !== undefined
  if (netKnown && stats.dhtNodes === 0 && stats.trackersOk === 0) {
    return 'No llega nada de la red de torrents. Puede ser el firewall de Windows o el antivirus bloqueando a Flix.'
  }
  if (stats.found !== undefined && stats.found > 0) return 'Hay gente compartiéndolo, pero todavía nadie acepta la conexión.'
  if (netKnown) return 'La red responde, pero nadie está compartiendo este torrent ahora. Probá con otra fuente.'
  return undefined
}
