import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appUpdatePostponed, appUpdateState, checkAppUpdate, formatSize, installAppUpdate, postponeAppUpdate, resetAppUpdate } from './appUpdate'
import { resetNativeInfo } from './native'

type Listener = (e: unknown) => void

function fakePlugin(over: Record<string, unknown> = {}) {
  const listeners: Record<string, Listener[]> = {}
  const plugin = {
    getInfo: vi.fn(async () => ({ tv: true, version: '0.20.0', update: true })),
    updateCheck: vi.fn(async () => ({ available: true, current: '0.20.0', latest: '0.21.0', size: 30 * 1024 * 1024 })),
    updateInstall: vi.fn(async () => {}),
    addListener: vi.fn((event: string, fn: Listener) => {
      ;(listeners[event] ??= []).push(fn)
      return { remove: () => {} }
    }),
    ...over,
  }
  vi.stubGlobal('window', { Capacitor: { isNativePlatform: () => true, Plugins: { SpNative: plugin } } })
  return { plugin, emit: (event: string, e: unknown) => listeners[event]?.forEach((fn) => fn(e)) }
}

describe('appUpdate', () => {
  beforeEach(() => {
    const data = new Map<string, string>()
    vi.stubGlobal('window', {})
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => data.set(k, v),
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    resetAppUpdate()
    resetNativeInfo()
  })

  it('fuera de la app no hace nada', async () => {
    await checkAppUpdate()
    expect(appUpdateState().step).toBe('idle')
  })

  it('avisa, baja y sigue los pasos que manda Android', async () => {
    const { plugin, emit } = fakePlugin()
    await checkAppUpdate()
    expect(appUpdateState()).toMatchObject({ step: 'available', info: { latest: '0.21.0' } })
    await installAppUpdate()
    expect(plugin.updateInstall).toHaveBeenCalledOnce()
    emit('update', { state: 'downloading', progress: 0.5 })
    expect(appUpdateState()).toMatchObject({ step: 'downloading', progress: 0.5 })
    emit('update', { state: 'installer' })
    expect(appUpdateState().step).toBe('installer')
    emit('update', { state: 'error', message: 'Firma distinta' })
    expect(appUpdateState()).toMatchObject({ step: 'error', message: 'Firma distinta', info: { available: true } })
  })

  it('v0.30: en la app de Windows usa su instalador', async () => {
    let onEvent: ((e: unknown) => void) | undefined
    const update = {
      check: vi.fn(async () => ({ available: true, current: '0.30.0', latest: '0.31.0' })),
      install: vi.fn(async () => {}),
      onEvent: vi.fn((fn: (e: unknown) => void) => {
        onEvent = fn
        return () => {}
      }),
    }
    vi.stubGlobal('window', { flixDesktop: { version: '0.30.0', torrent: '', update } })
    await checkAppUpdate(true)
    expect(update.check).toHaveBeenCalledWith(true)
    expect(appUpdateState()).toMatchObject({ step: 'available', info: { latest: '0.31.0' } })
    await installAppUpdate()
    expect(update.install).toHaveBeenCalledOnce()
    onEvent?.({ state: 'downloading', progress: 0.25 })
    expect(appUpdateState()).toMatchObject({ step: 'downloading', progress: 0.25 })
  })

  it('un APK viejo (sin update) no busca', async () => {
    const { plugin } = fakePlugin({ getInfo: vi.fn(async () => ({ tv: true, version: '0.19.0' })) })
    await checkAppUpdate(true)
    expect(plugin.updateCheck).not.toHaveBeenCalled()
  })

  it('"Después" vale un día y solo para esa versión', () => {
    postponeAppUpdate('0.21.0', 1000)
    expect(appUpdatePostponed('0.21.0', 2000)).toBe(true)
    expect(appUpdatePostponed('0.22.0', 2000)).toBe(false)
    expect(appUpdatePostponed('0.21.0', 1000 + 25 * 60 * 60 * 1000)).toBe(false)
  })

  it('formatSize', () => {
    expect(formatSize(undefined)).toBe('')
    expect(formatSize(2.5 * 1024 * 1024)).toBe('2,5 MB')
    expect(formatSize(48 * 1024 * 1024)).toBe('48 MB')
  })
})
