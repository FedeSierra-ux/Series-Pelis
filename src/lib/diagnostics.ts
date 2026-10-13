import { useSyncExternalStore } from 'react'
import { errorText, isChunkLoadError, isOffline } from './errors'
import { currentPlatform, resolveTvMode } from './platform'
import { settingsStore } from './store'

// Informes de errores (opt-in). En una TV no se puede copiar el detalle de un error ni sacarle una foto
// legible: la app arma un informe sin datos sensibles y lo manda a /api/report (functions/api/report),
// donde el dueño del sitio lo lee. Se manda SOLO el host de los addons y de los streams (la URL del manifest
// puede traer la key del debrid) y toda URL que aparezca en un mensaje se reduce a su host.
//
// - `probeReportServer()` pregunta una vez si el sitio tiene activados los informes (marca en localStorage).
// - `buildReport()` arma el JSON sanitizado; `sendReport()` lo manda, o lo deja en cola si no hay conexión.
// - `initDiagnostics()` engancha los errores globales (solo con el ajuste `sendReports` activo).

export type ReportKind = 'player' | 'addon' | 'app' | 'manual'
export type SendResult = 'sent' | 'queued' | 'failed' | 'disabled'

export interface ReportExtra {
  /** URLs de manifest o hosts de los addons involucrados: se guardan solo los hosts. */
  addons?: string[]
  /** El stream que falló: se guarda solo el host y el tipo (hls, mp4, mkv…). */
  stream?: { url?: string; type?: string }
  /** Comentario del usuario (hasta 500 caracteres). */
  comment?: string
  /** Datos sueltos (nombre del addon, título, etc.). Las URLs se reducen al host. */
  context?: Record<string, string | undefined>
  /** Ruta actual; por defecto `location.pathname`. */
  route?: string
}

export interface Report {
  kind: ReportKind
  message: string
  name?: string
  stack?: string
  route: string
  version: string
  platform: { ua: string; os: string; tv: boolean }
  theme: string
  addons: string[]
  stream?: { host: string; type: string }
  comment?: string
  context?: Record<string, string>
  installId: string
  /** Cuándo pasó (ISO), por si se manda desde la cola más tarde. */
  at: string
}

export const MAX_REPORT_BYTES = 16 * 1024
export const MAX_COMMENT = 500
const MAX_QUEUE = 10
const ENDPOINT = '/api/report'
const SERVER_FLAG = 'sp-report-server'
const INSTALL_KEY = 'sp-install-id'
const QUEUE_KEY = 'sp-report-queue'
const SEND_TIMEOUT_MS = 10_000

// ---------- localStorage con red de seguridad (modo privado, cuota llena, Node) ----------

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Sin localStorage seguimos igual, solo que sin recordar nada.
  }
}

// ---------- ¿El sitio acepta informes? ----------

let enabled = read(SERVER_FLAG) === '1'
const listeners = new Set<() => void>()

function setEnabled(value: boolean) {
  if (enabled === value) return
  enabled = value
  write(SERVER_FLAG, value ? '1' : '0')
  listeners.forEach((l) => l())
}

/** Marca guardada de la última vez (no espera al servidor). */
export function reportsEnabled(): boolean {
  return enabled
}

export function useReportsEnabled(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    reportsEnabled,
    () => false,
  )
}

/** Pregunta a /api/report/_status si el sitio tiene el KV de informes y guarda la respuesta. */
export async function probeReportServer(): Promise<boolean> {
  try {
    const res = await fetch(`${ENDPOINT}/_status`, { headers: { Accept: 'application/json' } })
    // En local sin el stub de Vite volvería el index.html: eso cuenta como "no".
    const body = res.ok && (res.headers.get('Content-Type') ?? '').includes('json') ? ((await res.json()) as { enabled?: unknown }) : undefined
    setEnabled(body?.enabled === true)
  } catch {
    // Sin conexión: queda lo de la última vez.
  }
  return enabled
}

// ---------- Id anónimo de instalación ----------

const ID_SHAPE = /^[a-z0-9-]{8,64}$/

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    // Contextos sin crypto seguro (http:// en una TV vieja).
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Id al azar de esta instalación, para agrupar los informes de una misma casa sin saber quién es.
 * Se genera al activar la opción (o al mandar el primer informe) y se guarda en localStorage.
 */
export function installId(): string {
  const stored = read(INSTALL_KEY)
  if (stored && ID_SHAPE.test(stored)) return stored
  const id = randomId()
  write(INSTALL_KEY, id)
  return id
}

// ---------- Sanitización ----------

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i
const URL_IN_TEXT = /[a-z][a-z0-9+.-]*:\/\/[^\s'"<>()[\]]+/gi

/** Solo el host de una URL (o el host tal cual si ya lo era); '' si no es ninguna de las dos. */
export function hostOf(value: string | undefined | null): string {
  const v = (value ?? '').trim()
  if (!v) return ''
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return new URL(v).host.toLowerCase()
  } catch {
    return ''
  }
  return HOST.test(v) ? v.toLowerCase() : ''
}

/** Reemplaza cada URL del texto por su host (los mensajes de HttpError traen la URL del addon). */
export function scrubUrls(text: string): string {
  return text.replace(URL_IN_TEXT, (m) => hostOf(m) || '[url]')
}

const cut = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s)

function bytes(report: Report): number {
  return new TextEncoder().encode(JSON.stringify(report)).length
}

/** Si el informe pasa los 16 kB, se recorta primero el stack, después el contexto y el mensaje. */
function fit(report: Report): Report {
  if (bytes(report) <= MAX_REPORT_BYTES) return report
  const r = { ...report }
  delete r.stack
  if (bytes(r) <= MAX_REPORT_BYTES) return r
  delete r.context
  if (bytes(r) <= MAX_REPORT_BYTES) return r
  r.message = cut(r.message, 500)
  r.comment = r.comment && cut(r.comment, 200)
  r.platform = { ...r.platform, ua: cut(r.platform.ua, 100) }
  r.addons = r.addons.slice(0, 5)
  return r
}

function currentRoute(): string {
  try {
    return typeof location !== 'undefined' ? location.pathname : ''
  } catch {
    return ''
  }
}

function appVersion(): string {
  try {
    return __APP_VERSION__
  } catch {
    return ''
  }
}

/** Arma el informe listo para mandar: sin URLs completas, sin query de la ruta, con tope de tamaño. */
export function buildReport(kind: ReportKind, err: unknown, extra: ReportExtra = {}): Report {
  const error = err instanceof Error ? err : undefined
  const rawMessage = err === undefined || err === null ? '' : errorText(err)
  const original = error ? `${error.name}: ${error.message}` : typeof err === 'string' ? err : ''
  // Texto en español (lo que vio el usuario) y, si difiere, el mensaje original (lo que sirve para buscar).
  const message = scrubUrls(rawMessage && original && rawMessage !== original ? `${rawMessage} [${original}]` : rawMessage || original)
  const platform = currentPlatform()
  const settings = settingsStore.get()
  const report: Report = {
    kind,
    message: cut(message, 1000) || (kind === 'manual' ? 'Informe manual' : 'Error sin mensaje'),
    route: cut((extra.route ?? currentRoute()).split(/[?#]/)[0], 300),
    version: appVersion(),
    platform: {
      ua: cut(typeof navigator !== 'undefined' ? navigator.userAgent : '', 300),
      os: platform.os,
      tv: resolveTvMode(settings.tvMode, platform.tv),
    },
    theme: settings.theme,
    addons: [...new Set((extra.addons ?? []).map(hostOf).filter(Boolean))].slice(0, 20),
    installId: installId(),
    at: new Date().toISOString(),
  }
  if (error?.name && error.name !== 'Error') report.name = cut(error.name, 100)
  if (error?.stack) report.stack = cut(scrubUrls(error.stack), 2000)
  const streamHost = hostOf(extra.stream?.url)
  if (streamHost) report.stream = { host: streamHost, type: cut(extra.stream?.type ?? '', 20) }
  const comment = (extra.comment ?? '').trim()
  if (comment) report.comment = scrubUrls(cut(comment, MAX_COMMENT))
  if (extra.context) {
    const context: Record<string, string> = {}
    for (const [k, v] of Object.entries(extra.context).slice(0, 20)) {
      if (typeof v === 'string' && v && k.length <= 40) context[k] = scrubUrls(cut(v, 300))
    }
    if (Object.keys(context).length) report.context = context
  }
  return fit(report)
}

// ---------- Cola sin conexión ----------

function readQueue(): Report[] {
  try {
    const parsed = JSON.parse(read(QUEUE_KEY) ?? '[]') as unknown
    return Array.isArray(parsed) ? (parsed as Report[]) : []
  } catch {
    return []
  }
}

function writeQueue(queue: Report[]) {
  write(QUEUE_KEY, queue.length ? JSON.stringify(queue) : null)
}

function enqueue(report: Report) {
  const queue = readQueue()
  queue.push(report)
  writeQueue(queue.slice(-MAX_QUEUE))
}

/** Cuántos informes esperan a que vuelva la conexión. */
export function queuedCount(): number {
  return readQueue().length
}

/** `true` si pudo mandarlo (200) o si el servidor lo rechazó de forma definitiva; `false` si hay que reintentar. */
async function postReport(report: Report): Promise<{ done: boolean; result: SendResult }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS)
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(report),
      signal: ctrl.signal,
      keepalive: true,
    })
    if (res.ok) return { done: true, result: 'sent' }
    if (res.status === 503) {
      // El sitio no tiene el KV: dejamos de ofrecerlo hasta la próxima consulta a _status.
      setEnabled(false)
      return { done: true, result: 'disabled' }
    }
    // 400/403/413/429: reintentar no cambia nada.
    if (res.status >= 400 && res.status < 500) return { done: true, result: 'failed' }
    return { done: false, result: 'failed' }
  } catch {
    return { done: false, result: 'failed' }
  } finally {
    clearTimeout(timer)
  }
}

let flushing: Promise<void> | undefined

/** Manda lo que quedó en la cola, en orden; para en el primero que no sale. */
export function flushQueue(): Promise<void> {
  if (flushing) return flushing
  flushing = (async () => {
    let queue = readQueue()
    while (queue.length && !isOffline()) {
      const { done } = await postReport(queue[0])
      if (!done) break
      queue = queue.slice(1)
      writeQueue(queue)
    }
  })().finally(() => {
    flushing = undefined
  })
  return flushing
}

/** Manda un informe ya armado. Sin conexión (o si la red falla) queda en cola y se reintenta al volver `online`. */
export async function sendBuiltReport(report: Report): Promise<SendResult> {
  if (!enabled) return 'disabled'
  if (isOffline()) {
    enqueue(report)
    return 'queued'
  }
  const { done, result } = await postReport(report)
  if (done) return result
  enqueue(report)
  return 'queued'
}

/** Arma y manda. `comment` y demás van en `extra`. */
export function sendReport(kind: ReportKind, err: unknown, extra: ReportExtra = {}): Promise<SendResult> {
  return sendBuiltReport(buildReport(kind, err, extra))
}

// ---------- Errores globales ----------

const seen = new Set<string>()

/** Errores que no vale la pena mandar: cross-origin sin datos, partes de la app viejas (se recarga sola). */
function ignorable(err: unknown, message: string): boolean {
  if (isChunkLoadError(err) || isChunkLoadError(message)) return true
  return /^Script error\.?$/.test(message.trim())
}

/** Un error global por mensaje y sesión, solo con el ajuste activo y el sitio preparado. */
export function reportGlobalError(err: unknown, fallbackMessage = ''): void {
  if (!enabled || !settingsStore.get().sendReports) return
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? fallbackMessage)
  if (!message || ignorable(err, message)) return
  const key = `app:${message}`
  if (seen.has(key)) return
  seen.add(key)
  void sendReport('app', err ?? fallbackMessage)
}

let installed = false

/**
 * Engancha `error` y `unhandledrejection` de la ventana y el reintento de la cola al volver la conexión.
 * Se llama una vez desde main.tsx.
 */
export function initDiagnostics(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (event) => {
    reportGlobalError(event.error ?? event.message, event.message)
  })
  window.addEventListener('unhandledrejection', (event) => {
    reportGlobalError(event.reason, 'Promesa rechazada sin motivo')
  })
  window.addEventListener('online', () => {
    void flushQueue()
  })
  if (enabled && !isOffline()) void flushQueue()
}
