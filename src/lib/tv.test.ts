import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { androidIntent, effectivePlayer, externalLaunch, playersFor } from './externalPlayers'
import { IdleTimer } from './idle'
import { applyKey, oskRows } from './osk'
import { detectOs, detectPlatform, resolveTvMode } from './platform'
import { buildSlides } from './screensaver'

const UA = {
  fireTv: 'Mozilla/5.0 (Linux; Android 9; AFTKA Build/PS7633.3445N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36',
  silk: 'Mozilla/5.0 (Linux; Android 9; AFTMM) AppleWebKit/537.36 (KHTML, like Gecko) Silk/120.4.1 like Chrome/120.0 Safari/537.36',
  androidTv: 'Mozilla/5.0 (Linux; Android 12; BRAVIA 4K VH2 Build/STT1.211025.001.Z4) AppleWebKit/537.36 Chrome/118.0 Safari/537.36',
  googleTv: 'Mozilla/5.0 (Linux; Android 12; Chromecast HD; Google TV) AppleWebKit/537.36 Chrome/118.0 Safari/537.36',
  tizen: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36',
  webos: 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0 Safari/537.36 WebAppManager',
  pixel: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
}

const pc = { anyPointerFine: true, anyPointerCoarse: false, pointerNone: false, maxTouchPoints: 0 }
const phone = { anyPointerFine: false, anyPointerCoarse: true, pointerNone: false, maxTouchPoints: 5 }
const remote = { anyPointerFine: false, anyPointerCoarse: false, pointerNone: true, maxTouchPoints: 0 }

describe('detectPlatform', () => {
  it('reconoce televisores por el user agent', () => {
    for (const ua of [UA.fireTv, UA.silk, UA.androidTv, UA.googleTv, UA.tizen, UA.webos]) {
      expect(detectPlatform({ userAgent: ua, ...pc }).tv, ua).toBe(true)
    }
    expect(detectPlatform({ userAgent: UA.fireTv, ...remote })).toEqual({ os: 'android', tv: true, fireTv: true })
    expect(detectPlatform({ userAgent: UA.androidTv, ...remote }).fireTv).toBe(false)
  })

  it('celulares y PCs no son TV', () => {
    expect(detectPlatform({ userAgent: UA.pixel, ...phone })).toEqual({ os: 'android', tv: false, fireTv: false })
    expect(detectPlatform({ userAgent: UA.iphone, ...phone }).tv).toBe(false)
    expect(detectPlatform({ userAgent: UA.windows, ...pc }).tv).toBe(false)
  })

  it('sin mouse ni táctil y con pointer: none es TV aunque el user agent no lo diga', () => {
    expect(detectPlatform({ userAgent: UA.linux, ...remote }).tv).toBe(true)
    // pointer: none pero con pantalla táctil (algunos celulares raros): no.
    expect(detectPlatform({ userAgent: UA.linux, ...remote, anyPointerCoarse: true }).tv).toBe(false)
  })

  it('detecta el sistema, incluido el iPad que dice ser Mac', () => {
    expect(detectOs({ userAgent: UA.iphone })).toBe('ios')
    expect(detectOs({ userAgent: UA.mac, platform: 'MacIntel', maxTouchPoints: 0 })).toBe('mac')
    expect(detectOs({ userAgent: UA.mac, platform: 'MacIntel', maxTouchPoints: 5 })).toBe('ios')
    expect(detectOs({ userAgent: UA.windows })).toBe('windows')
    expect(detectOs({ userAgent: UA.linux })).toBe('linux')
    expect(detectOs({ userAgent: UA.silk })).toBe('android')
    expect(detectOs({ userAgent: 'Algo raro' })).toBe('other')
  })

  it('el ajuste manual le gana a la detección', () => {
    expect(resolveTvMode('auto', true)).toBe(true)
    expect(resolveTvMode('auto', false)).toBe(false)
    expect(resolveTvMode('on', false)).toBe(true)
    expect(resolveTvMode('off', true)).toBe(false)
  })
})

describe('reproductores externos', () => {
  const url = 'https://cdn.ejemplo.com/peli%20uno.mkv?token=a&b=c'

  it('intent de Android con y sin paquete', () => {
    expect(androidIntent(url)).toBe('intent://cdn.ejemplo.com/peli%20uno.mkv?token=a&b=c#Intent;scheme=https;type=video/*;end')
    expect(androidIntent('http://192.168.0.5:11470/abc/0', 'org.videolan.vlc')).toBe(
      'intent://192.168.0.5:11470/abc/0#Intent;scheme=http;type=video/*;package=org.videolan.vlc;end',
    )
    expect(androidIntent(url, 'com.mxtech.videoplayer.ad', 'Él & yo')).toContain(';package=com.mxtech.videoplayer.ad;S.title=%C3%89l%20%26%20yo;end')
  })

  it('cada reproductor arma su enlace', () => {
    expect(externalLaunch('vlc', url, 'windows').href).toBe(`vlc://${url}`)
    expect(externalLaunch('vlc', url, 'ios').href).toBe(`vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(url)}`)
    expect(externalLaunch('vlc', url, 'android').href).toContain('package=org.videolan.vlc;')
    expect(externalLaunch('mpv', url, 'linux').href).toBe(`mpv://${url}`)
    expect(externalLaunch('mpv', url, 'android').href).toContain('package=is.xyz.mpv;')
    expect(externalLaunch('infuse', url, 'ios').href).toBe(`infuse://x-callback-url/play?url=${encodeURIComponent(url)}`)
    expect(externalLaunch('iina', url, 'mac').href).toBe(`iina://weblink?url=${encodeURIComponent(url)}`)
    expect(externalLaunch('outplayer', url, 'ios').href).toBe(`outplayer://${url}`)
    expect(externalLaunch('nplayer', url, 'ios').href).toBe(`nplayer-${url}`)
    expect(externalLaunch('justplayer', url, 'android').href).toContain('package=com.brouken.player;')
    expect(externalLaunch('mxplayer', url, 'android').href).toContain('package=com.mxtech.videoplayer.ad;')
    expect(externalLaunch('potplayer', url, 'windows').href).toBe(`potplayer://${url}`)
  })

  it('"Del sistema": selector en Android, copiar enlace en el resto', () => {
    expect(externalLaunch('system', url, 'android')).toEqual({ href: androidIntent(url), copy: false, label: 'otro reproductor' })
    expect(externalLaunch('system', url, 'windows')).toEqual({ copy: true, label: 'otro reproductor' })
    expect(externalLaunch('none', url, 'android').href).toBeUndefined()
  })

  it('si el elegido no existe en este sistema usa "Del sistema"', () => {
    expect(effectivePlayer('infuse', 'android').id).toBe('system')
    expect(effectivePlayer('mxplayer', 'windows').id).toBe('system')
    expect(effectivePlayer('inventado', 'mac').id).toBe('system')
    expect(externalLaunch('mxplayer', url, 'windows')).toEqual({ copy: true, label: 'otro reproductor' })
  })

  it('solo lista los que aplican al sistema', () => {
    const ids = (os: Parameters<typeof playersFor>[0]) => playersFor(os).map((p) => p.id)
    expect(ids('android')).toEqual(expect.arrayContaining(['system', 'vlc', 'mpv', 'justplayer', 'mxplayer', 'nplayer', 'none']))
    expect(ids('android')).not.toContain('infuse')
    expect(ids('ios')).toEqual(expect.arrayContaining(['vlc', 'infuse', 'outplayer', 'nplayer']))
    expect(ids('ios')).not.toContain('mpv')
    expect(ids('mac')).toEqual(expect.arrayContaining(['vlc', 'mpv', 'iina', 'infuse']))
    expect(ids('windows')).toEqual(expect.arrayContaining(['vlc', 'mpv', 'potplayer']))
    expect(ids('windows')).not.toContain('iina')
    expect(ids('linux')).not.toContain('justplayer')
  })
})

describe('IdleTimer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('se dispara después del tiempo sin actividad y la actividad reinicia la cuenta', () => {
    const onIdle = vi.fn()
    const t = new IdleTimer({ timeoutMs: 60_000, onIdle })
    vi.advanceTimersByTime(59_000)
    expect(t.activity()).toBe(false)
    vi.advanceTimersByTime(59_000)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1_000)
    expect(onIdle).toHaveBeenCalledTimes(1)
    expect(t.isIdle).toBe(true)
    // La actividad que lo despierta avisa que estaba inactivo.
    expect(t.activity()).toBe(true)
    expect(t.isIdle).toBe(false)
    vi.advanceTimersByTime(60_000)
    expect(onIdle).toHaveBeenCalledTimes(2)
    t.stop()
  })

  it('0 = apagado', () => {
    const onIdle = vi.fn()
    const t = new IdleTimer({ timeoutMs: 0, onIdle })
    vi.advanceTimersByTime(10 * 60_000)
    expect(onIdle).not.toHaveBeenCalled()
    t.setTimeoutMs(1000)
    vi.advanceTimersByTime(1000)
    expect(onIdle).toHaveBeenCalledTimes(1)
    t.setTimeoutMs(0)
    vi.advanceTimersByTime(10_000)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('si canIdle dice que no (video reproduciéndose) vuelve a esperar', () => {
    const onIdle = vi.fn()
    let playing = true
    const t = new IdleTimer({ timeoutMs: 1000, onIdle, canIdle: () => !playing })
    vi.advanceTimersByTime(3000)
    expect(onIdle).not.toHaveBeenCalled()
    playing = false
    vi.advanceTimersByTime(1000)
    expect(onIdle).toHaveBeenCalledTimes(1)
    t.stop()
  })

  it('stop cancela', () => {
    const onIdle = vi.fn()
    const t = new IdleTimer({ timeoutMs: 1000, onIdle })
    t.stop()
    t.activity()
    vi.advanceTimersByTime(5000)
    expect(onIdle).not.toHaveBeenCalled()
  })
})

describe('protector de pantalla', () => {
  const noShuffle = () => 0.999

  it('sin repetir títulos, prioriza lo primero y usa fondos grandes', () => {
    const slides = buildSlides(
      [
        [{ id: 'tt1:1:2', name: 'Serie' }, { id: 'tt2', name: 'Peli', background: 'https://images.metahub.space/background/medium/tt2/img' }],
        [{ id: 'tt1', name: 'Serie repetida' }, { id: 'tmdb:movie:9', name: 'Sin fondo' }, { id: 'tmdb:tv:5', name: 'Con fondo', background: 'https://image.tmdb.org/t/p/w1280/x.jpg' }],
      ],
      10,
      noShuffle,
    )
    expect(slides.map((s) => s.name).sort()).toEqual(['Con fondo', 'Peli', 'Serie'])
    expect(slides.find((s) => s.name === 'Serie')?.image).toBe('https://images.metahub.space/background/large/tt1/img')
    expect(slides.find((s) => s.name === 'Peli')?.image).toBe('https://images.metahub.space/background/large/tt2/img')
  })

  it('sin conexión usa el tamaño que la app ya tiene en caché', () => {
    const [slide] = buildSlides([[{ id: 'tt7', name: 'X', background: 'https://images.metahub.space/background/medium/tt7/img' }]], 5, noShuffle, false)
    expect(slide.image).toBe('https://images.metahub.space/background/medium/tt7/img')
    const [slide2] = buildSlides([[{ id: 'tt8', name: 'Y' }]], 5, noShuffle, false)
    expect(slide2.image).toBe('https://images.metahub.space/background/medium/tt8/img')
  })

  it('respeta el máximo', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ id: `tt${i}`, name: `T${i}` }))
    expect(buildSlides([many], 12)).toHaveLength(12)
  })
})

describe('teclado en pantalla', () => {
  it('tiene ñ, números y acciones', () => {
    const rows = oskRows('letters', false)
    const flat = rows.flat()
    expect(flat).toContainEqual({ kind: 'char', value: 'ñ' })
    expect(flat).toContainEqual({ kind: 'char', value: '0' })
    expect(rows.at(-1)!.map((k) => k.kind)).toEqual(['shift', 'layer', 'space', 'backspace', 'clear', 'done'])
    expect(oskRows('letters', true).flat()).toContainEqual({ kind: 'char', value: 'Ñ' })
    expect(oskRows('symbols', false).flat()).toContainEqual({ kind: 'char', value: '/' })
  })

  it('edita el texto', () => {
    expect(applyKey('ab', { kind: 'char', value: 'c' })).toBe('abc')
    expect(applyKey('ab', { kind: 'space' })).toBe('ab ')
    expect(applyKey('año', { kind: 'backspace' })).toBe('añ')
    expect(applyKey('', { kind: 'backspace' })).toBe('')
    expect(applyKey('abc', { kind: 'clear' })).toBe('')
    expect(applyKey('abc', { kind: 'done' })).toBe('abc')
  })
})
