import { useSyncExternalStore } from 'react'

// Login "Código de casa" (v0.17): el aparato entra a una casa y el sitio le da una cookie de sesión
// (HttpOnly: la app nunca ve el token). Ver functions/api/auth/[[path]].ts.
//
// Si el sitio no tiene la base (`DB`) o la app corre en local con Vite, `/api/auth/me` no existe o dice
// `enabled: false`: la app funciona como siempre, sin login ni sincronización.

export interface House {
  id: string
  name: string
  isAdmin: boolean
}

export interface Device {
  id: string
  label: string
  kind: 'tv' | 'web'
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'disabled' }
  | { status: 'out'; needsSetup: boolean }
  /** `offline`: no se pudo preguntar al sitio y se usa lo de la última vez. */
  | { status: 'in'; house: House; device: Device; offline?: boolean }

const API = '/api/auth'
const CACHE_KEY = 'sp-auth'

const listeners = new Set<() => void>()

function setState(next: AuthState) {
  state = next
  if (next.status === 'in' && !next.offline) writeCache({ house: next.house, device: next.device })
  if (next.status === 'out' || next.status === 'disabled') writeCache(undefined)
  listeners.forEach((l) => l())
}

function readCache(): { house: House; device: Device } | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const v = raw ? (JSON.parse(raw) as { house?: House; device?: Device }) : undefined
    return v?.house?.id && v.device?.id ? { house: v.house, device: v.device } : undefined
  } catch {
    return undefined
  }
}

function writeCache(v: { house: House; device: Device } | undefined) {
  try {
    if (v) localStorage.setItem(CACHE_KEY, JSON.stringify(v))
    else localStorage.removeItem(CACHE_KEY)
  } catch {
    // Sin localStorage: sin conexión no se puede abrir la app con la sesión de la última vez.
  }
}

/** Con la sesión de la última vez la app abre enseguida (sin pantalla de carga); `/me` la confirma. */
let state: AuthState = (() => {
  const cached = readCache()
  return cached ? { status: 'in', ...cached, offline: true } : { status: 'loading' }
})()

export const getAuth = () => state

export function subscribeAuth(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribeAuth, getAuth, getAuth)
}

/** La casa de la sesión, si hay login. */
export const currentHouse = (): House | undefined => (state.status === 'in' ? state.house : undefined)

/** ¿Puede cambiar los addons? Sin login (local o sitio sin base), siempre; con login, solo el admin. */
export function canEditAddons(s: AuthState = state): boolean {
  return s.status !== 'in' || s.house.isAdmin
}

export function useCanEditAddons(): boolean {
  return canEditAddons(useAuth())
}

/** Error de la API con el texto del servidor (ya viene en español). */
export class AuthApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API}/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch {
    throw new AuthApiError(0, 'Sin conexión. Revisá internet y probá de nuevo.')
  }
  const isJson = (res.headers.get('Content-Type') ?? '').includes('json')
  const data = isJson ? ((await res.json().catch(() => undefined)) as (T & { error?: string }) | undefined) : undefined
  if (!res.ok || !data) {
    if (res.status === 401 && path !== 'setup') void checkAuth()
    throw new AuthApiError(res.status, data?.error ?? `El sitio respondió ${res.status}`)
  }
  return data
}

interface MeResponse {
  enabled?: boolean
  session?: { house: House; device: Device } | null
  needsSetup?: boolean
}

let checking: Promise<AuthState> | undefined

/** Pregunta al sitio si hay sesión. Se llama al arrancar y cuando algo responde 401. */
export function checkAuth(): Promise<AuthState> {
  checking ??= (async () => {
    try {
      const res = await fetch(`${API}/me`, { headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' })
      // En local (Vite) la ruta no existe y vuelve el index.html (o un 404): sin login.
      const isJson = (res.headers.get('Content-Type') ?? '').includes('json')
      if (res.status === 404 || (res.ok && !isJson)) {
        setState({ status: 'disabled' })
        return state
      }
      const me = (await res.json()) as MeResponse
      if (!res.ok) throw new Error(String(res.status))
      if (me.enabled !== true) setState({ status: 'disabled' })
      else if (me.session) setState({ status: 'in', house: me.session.house, device: me.session.device })
      else setState({ status: 'out', needsSetup: me.needsSetup === true })
    } catch {
      // Sin conexión o la base no responde: con la sesión de la última vez se sigue usando la app.
      const cached = readCache()
      if (cached) setState({ status: 'in', ...cached, offline: true })
      else if (state.status === 'loading') setState({ status: 'disabled' })
    } finally {
      checking = undefined
    }
    return state
  })()
  return checking
}

/** Algo del sitio respondió 401 (sesión cerrada desde otro aparato): se vuelve a preguntar. */
let lastUnauthorized = 0
export function reportUnauthorized() {
  if (state.status !== 'in' || Date.now() - lastUnauthorized < 10_000) return
  lastUnauthorized = Date.now()
  void checkAuth()
}

// ---------- Nombre del aparato ----------

/** Un nombre para reconocer el aparato en la lista ("TV · Chrome", "Celular · Safari"). */
export function deviceLabel(tv: boolean): string {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Silk/.test(ua) ? 'Silk' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  const kind = tv ? 'TV' : /iPhone|Android.+Mobile/.test(ua) ? 'Celular' : /iPad|Android/.test(ua) ? 'Tablet' : 'PC'
  return `${kind} · ${browser}`
}

// ---------- Entrar y salir ----------

type Joined = { ok: true; house: House }

async function afterLogin() {
  await checkAuth()
}

/** El admin entra con la clave del sitio (`ADMIN_KEY`); la primera vez crea su casa. */
export async function setupAdmin(key: string, name: string, tv: boolean) {
  await api<Joined>('setup', { key, name, label: deviceLabel(tv), tv })
  await afterLogin()
}

/** Entrar con el código o el enlace de invitación de una casa. */
export async function joinHouse(code: string, tv: boolean) {
  await api<Joined>('join', { code, label: deviceLabel(tv), tv })
  await afterLogin()
}

export async function logout() {
  try {
    await api('logout', {})
  } finally {
    setState({ status: 'out', needsSetup: false })
    void checkAuth()
  }
}

// ---------- Vincular la TV con un código ----------

export interface PairStart {
  code: string
  poll: string
  expiresAt: number
  interval: number
}

export const pairStart = (tv: boolean) => api<PairStart>('pair/start', { label: deviceLabel(tv), tv })

/** `ok`: ya entró (la cookie vino con la respuesta). */
export async function pairPoll(poll: string): Promise<'pending' | 'ok' | 'expired'> {
  try {
    const r = await api<{ status: 'pending' | 'ok' }>('pair/poll', { poll })
    if (r.status === 'ok') await afterLogin()
    return r.status
  } catch (err) {
    if (err instanceof AuthApiError && err.status === 410) return 'expired'
    throw err
  }
}

export const pairApprove = (code: string) => api<{ ok: true; label: string; house: string }>('pair/approve', { code })

// ---------- Aparatos ----------

export interface DeviceInfo {
  id: string
  label: string
  kind: 'tv' | 'web'
  createdAt: number
  lastSeenAt: number
  current: boolean
}

export const listDevices = (house?: string) => api<{ devices: DeviceInfo[] }>(`devices${house ? `?house=${encodeURIComponent(house)}` : ''}`).then((r) => r.devices)

export async function revokeDevice(id: string, house?: string) {
  await api('devices/revoke', { id, house })
  if (state.status === 'in' && state.device.id === id) setState({ status: 'out', needsSetup: false })
}

// ---------- Casas (solo el admin) ----------

export interface HouseInfo extends House {
  createdAt: number
  devices: number
  hasInvite: boolean
}

export const listHouses = () => api<{ houses: HouseInfo[] }>('houses').then((r) => r.houses)
export const createHouse = (name: string) => api<{ house: House; invite: string }>('houses', { name })
export const rotateInvite = (house: string) => api<{ invite: string }>('houses/invite', { house }).then((r) => r.invite)
export const revokeInvite = (house: string) => api('houses/invite/revoke', { house })
export const renameHouse = (house: string, name: string) => api('houses/rename', { house, name })
export const deleteHouse = (house: string) => api('houses/delete', { house })

/** Enlace para mandar por chat. El código va después de `#`: no llega a los registros del servidor. */
export const inviteLink = (code: string) => `${location.origin}/unirse#${code}`
