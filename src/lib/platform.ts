// Detección del sistema y de "estoy en una TV". Lógica pura (sin `window`) para poder probarla;
// `currentPlatform()` junta los datos reales del navegador.

export type Os = 'android' | 'ios' | 'mac' | 'windows' | 'linux' | 'other'

export interface PlatformInfo {
  userAgent: string
  /** navigator.platform (viejo pero útil para distinguir el iPad que se hace pasar por Mac). */
  platform?: string
  maxTouchPoints?: number
  /** matchMedia('(any-pointer: fine)'): hay mouse o touchpad. */
  anyPointerFine?: boolean
  /** matchMedia('(any-pointer: coarse)'): hay pantalla táctil. */
  anyPointerCoarse?: boolean
  /** matchMedia('(pointer: none)'): sin puntero (control remoto). */
  pointerNone?: boolean
}

export interface Platform {
  os: Os
  /** Fire TV, Android TV / Google TV, Tizen, webOS u otro televisor. */
  tv: boolean
  fireTv: boolean
}

// Fire TV: los modelos se llaman AFTxx (AFTMM, AFTKA...). "AmazonWebAppPlatform" es su WebView.
const FIRE_TV = /\bAFT[A-Z0-9]{1,6}\b|Fire ?TV|AmazonWebAppPlatform/i
const OTHER_TV =
  /Android ?TV|Google ?TV|\bGTV\b|BRAVIA|SMART-?TV|SmartTV|Tizen|Web0S|webOS|NetCast|HbbTV|CrKey|Roku|AppleTV|tvOS|Philips|Hisense|VIDAA|Opera TV|Aquos|MiTV|MIBOX|SHIELD Android TV|\bTV\b/i

export function detectOs(info: Pick<PlatformInfo, 'userAgent' | 'platform' | 'maxTouchPoints'>): Os {
  const ua = info.userAgent
  if (/android/i.test(ua) || FIRE_TV.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  // iPadOS 13+ dice ser una Mac: la delata la pantalla táctil.
  if ((info.platform === 'MacIntel' || /Macintosh/.test(ua)) && (info.maxTouchPoints ?? 0) > 1) return 'ios'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Linux|X11|CrOS/i.test(ua)) return 'linux'
  return 'other'
}

export function detectPlatform(info: PlatformInfo): Platform {
  const ua = info.userAgent
  const os = detectOs(info)
  const fireTv = FIRE_TV.test(ua)
  const uaTv = fireTv || OTHER_TV.test(ua)
  // Sin mouse ni pantalla táctil y declarando "sin puntero": casi seguro un control remoto.
  const noPointer = !!info.pointerNone && !info.anyPointerFine && !info.anyPointerCoarse && (info.maxTouchPoints ?? 0) === 0
  return { os, tv: uaTv || noPointer, fireTv }
}

const media = (q: string) => {
  try {
    return typeof matchMedia === 'function' && matchMedia(q).matches
  } catch {
    return false
  }
}

let memo: Platform | undefined

/** Plataforma del navegador actual (se calcula una vez). */
export function currentPlatform(): Platform {
  if (memo) return memo
  if (typeof navigator === 'undefined') return { os: 'other', tv: false, fireTv: false }
  memo = detectPlatform({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    anyPointerFine: media('(any-pointer: fine)'),
    anyPointerCoarse: media('(any-pointer: coarse)'),
    pointerNone: media('(pointer: none)'),
  })
  return memo
}

export type TvModeSetting = 'auto' | 'on' | 'off'

/** El ajuste manual le gana a la detección. */
export function resolveTvMode(setting: TvModeSetting, detected: boolean): boolean {
  return setting === 'auto' ? detected : setting === 'on'
}
