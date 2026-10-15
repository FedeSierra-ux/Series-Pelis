import { afterEach, describe, expect, it, vi } from 'vitest'
import { nativePlayerAvailable, probeNativePlayer, resetNativePlayerProbe } from './nativePlayer'

function fakeApp(info: unknown) {
  const getInfo = vi.fn(() => (info instanceof Error ? Promise.reject(info) : Promise.resolve(info)))
  vi.stubGlobal('window', { Capacitor: { isNativePlatform: () => true, Plugins: { SpNative: { getInfo } } } })
  return getInfo
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetNativePlayerProbe()
})

describe('probeNativePlayer', () => {
  it('en el navegador no hay reproductor nativo', async () => {
    vi.stubGlobal('window', {})
    expect(await probeNativePlayer()).toBe(false)
  })

  it('el APK de la v0.19 no lo trae; el de la v0.20 sí (y se pregunta una sola vez)', async () => {
    fakeApp({ tv: true, version: '0.19.0' })
    expect(await probeNativePlayer()).toBe(false)
    resetNativePlayerProbe()
    const getInfo = fakeApp({ tv: true, version: '0.20.0', player: true })
    expect(nativePlayerAvailable()).toBeUndefined()
    expect(await probeNativePlayer()).toBe(true)
    expect(await probeNativePlayer()).toBe(true)
    expect(nativePlayerAvailable()).toBe(true)
    expect(getInfo).toHaveBeenCalledTimes(1)
  })

  it('si el plugin falla, queda el de la web', async () => {
    fakeApp(new Error('no'))
    expect(await probeNativePlayer()).toBe(false)
  })
})
