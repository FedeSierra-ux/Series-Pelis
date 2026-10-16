// Actualizar la app de Android TV sola (v0.21): el APK mira GitHub Releases al abrir, baja la versión nueva,
// revisa que esté firmada con la misma llave y abre el instalador de Android. Solo falta tocar "Instalar".
// Acá queda el estado para el aviso (components/AppUpdateToast.tsx) y Ajustes → App de TV.

import { useSyncExternalStore } from 'react'
import { listenNative, nativeUpdateCheck, nativeUpdateInstall, type NativeUpdateInfo } from './native'

export type AppUpdateState =
  | { step: 'idle' }
  | { step: 'checking' }
  | { step: 'none'; info: NativeUpdateInfo }
  | { step: 'available'; info: NativeUpdateInfo }
  | { step: 'downloading'; info: NativeUpdateInfo; progress: number }
  | { step: 'verifying'; info: NativeUpdateInfo }
  | { step: 'permission'; info: NativeUpdateInfo }
  | { step: 'installer'; info: NativeUpdateInfo }
  | { step: 'error'; message: string; info?: NativeUpdateInfo }

let state: AppUpdateState = { step: 'idle' }
const subs = new Set<() => void>()

function set(next: AppUpdateState) {
  state = next
  for (const fn of subs) fn()
}

export const appUpdateState = () => state

export function useAppUpdate(): AppUpdateState {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    () => state,
    () => state,
  )
}

const infoOf = (s: AppUpdateState) => ('info' in s ? s.info : undefined)
const busy = (s: AppUpdateState) => s.step === 'checking' || s.step === 'downloading' || s.step === 'verifying'

let listening = false

function listen() {
  if (listening) return
  listening = true
  listenNative('update', (e) => {
    const info = infoOf(state) ?? { available: true, current: '' }
    switch (e.state) {
      case 'downloading':
        set({ step: 'downloading', info, progress: Math.max(0, Math.min(1, e.progress)) })
        break
      case 'verifying':
      case 'permission':
      case 'installer':
        set({ step: e.state, info })
        break
      case 'error':
        set({ step: 'error', message: e.message, info })
        break
    }
  })
}

/** ¿Hay versión nueva? Sin `force`, el APK usa lo que averiguó en las últimas 6 h. Fuera de la app, nada. */
export async function checkAppUpdate(force = false): Promise<void> {
  if (busy(state)) return
  listen()
  const before = state
  set({ step: 'checking' })
  try {
    const info = await nativeUpdateCheck(force)
    if (!info) {
      set(before)
      return
    }
    if (info.error) set({ step: 'error', message: info.error, info })
    else set(info.available ? { step: 'available', info } : { step: 'none', info })
  } catch {
    set({ step: 'error', message: 'No se pudo buscar la actualización' })
  }
}

export async function installAppUpdate(): Promise<void> {
  if (busy(state)) return
  listen()
  const info = infoOf(state)
  set({ step: 'downloading', info: info ?? { available: true, current: '' }, progress: 0 })
  try {
    await nativeUpdateInstall()
  } catch {
    set({ step: 'error', message: 'No se pudo bajar la actualización', info })
  }
}

// "Después" en el aviso: no vuelve a salir por esa versión hasta mañana.
const LATER_KEY = 'sp-app-update-later'
const LATER_MS = 24 * 60 * 60 * 1000

export function postponeAppUpdate(version: string | undefined, now = Date.now()) {
  try {
    localStorage.setItem(LATER_KEY, JSON.stringify({ v: version ?? '', at: now }))
  } catch {
    // Sin localStorage: vuelve a salir la próxima vez que se abra.
  }
}

export function appUpdatePostponed(version: string | undefined, now = Date.now()): boolean {
  try {
    const raw = JSON.parse(localStorage.getItem(LATER_KEY) ?? 'null') as { v?: string; at?: number } | null
    return !!raw && raw.v === (version ?? '') && typeof raw.at === 'number' && now - raw.at < LATER_MS
  } catch {
    return false
  }
}

/** Solo para los tests. */
export function resetAppUpdate() {
  state = { step: 'idle' }
  listening = false
}

/** "2,4 MB" / "48 MB". */
export function formatSize(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return ''
  const mb = bytes / (1024 * 1024)
  return `${mb.toLocaleString('es-AR', { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`
}
