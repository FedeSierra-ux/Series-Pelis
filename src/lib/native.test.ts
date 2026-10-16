import { afterEach, describe, expect, it, vi } from 'vitest'
import { isNativeApp, nativeExit, nativeKeepAwake } from './native'
import { detectPlatform } from './platform'

// Lo que la app de Android TV (tv-app/) suma al User-Agent del WebView.
const TV_UA =
  'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K VH2 Build/STT1.211025.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 FlixApp/0.22.0 AndroidTV'
const PHONE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 FlixApp/0.22.0'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('app de Android TV', () => {
  it('se reconoce por el User-Agent', () => {
    expect(isNativeApp(TV_UA)).toBe(true)
    expect(isNativeApp(PHONE_UA)).toBe(true)
    expect(isNativeApp('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/140.0.0.0 Mobile Safari/537.36')).toBe(false)
  })

  it('en una TV prende el modo TV solo; en el celular no', () => {
    expect(detectPlatform({ userAgent: TV_UA }).tv).toBe(true)
    expect(detectPlatform({ userAgent: PHONE_UA }).tv).toBe(false)
  })

  it('pantalla prendida y salir van al plugin; en el navegador no hacen nada', () => {
    expect(nativeKeepAwake(true)).toBe(false)
    expect(nativeExit()).toBe(false)
    const keepAwake = vi.fn(async () => {})
    const exitApp = vi.fn(async () => {})
    vi.stubGlobal('window', { Capacitor: { isNativePlatform: () => true, Plugins: { SpNative: { keepAwake, exitApp } } } })
    expect(nativeKeepAwake(true)).toBe(true)
    expect(keepAwake).toHaveBeenCalledWith({ on: true })
    expect(nativeExit()).toBe(true)
    expect(exitApp).toHaveBeenCalled()
  })
})
