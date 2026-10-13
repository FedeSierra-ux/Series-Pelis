import type { Os } from './platform'

// Reproductores externos para el botón "Abrir en…". Cada uno sabe armar el enlace (esquema propio
// o intent de Android) para los sistemas donde existe. Lógica pura: se prueba en externalPlayers.test.ts.

export type ExternalPlayerId =
  | 'system'
  | 'vlc'
  | 'mpv'
  | 'iina'
  | 'potplayer'
  | 'infuse'
  | 'outplayer'
  | 'nplayer'
  | 'justplayer'
  | 'mxplayer'
  | 'mxplayerpro'
  | 'none'

export interface ExternalPlayer {
  id: ExternalPlayerId
  label: string
  /** Sistemas donde existe. */
  os: Os[]
  /** Paquete de Android (para el intent). */
  androidPackage?: string
  /** Enlace para sistemas que no son Android. */
  scheme?: (url: string) => string
  note?: string
}

const enc = encodeURIComponent

export const EXTERNAL_PLAYERS: ExternalPlayer[] = [
  { id: 'system', label: 'Del sistema', os: ['android', 'ios', 'mac', 'windows', 'linux', 'other'] },
  {
    id: 'vlc',
    label: 'VLC',
    os: ['android', 'ios', 'mac', 'windows', 'linux'],
    androidPackage: 'org.videolan.vlc',
    // En iOS VLC documenta x-callback-url; en la PC hace falta que VLC tenga registrado vlc://.
    scheme: (url) => `vlc://${url}`,
  },
  {
    id: 'mpv',
    label: 'mpv',
    os: ['android', 'windows', 'linux', 'mac'],
    androidPackage: 'is.xyz.mpv',
    scheme: (url) => `mpv://${url}`,
    note: 'En la PC necesita un manejador de enlaces mpv:// instalado.',
  },
  { id: 'iina', label: 'IINA', os: ['mac'], scheme: (url) => `iina://weblink?url=${enc(url)}` },
  { id: 'potplayer', label: 'PotPlayer', os: ['windows'], scheme: (url) => `potplayer://${url}` },
  { id: 'infuse', label: 'Infuse', os: ['ios', 'mac'], scheme: (url) => `infuse://x-callback-url/play?url=${enc(url)}` },
  { id: 'outplayer', label: 'Outplayer', os: ['ios'], scheme: (url) => `outplayer://${url}` },
  { id: 'nplayer', label: 'nPlayer', os: ['ios', 'android'], androidPackage: 'com.newin.nplayer.pro', scheme: (url) => `nplayer-${url}` },
  { id: 'justplayer', label: 'Just Player', os: ['android'], androidPackage: 'com.brouken.player' },
  { id: 'mxplayer', label: 'MX Player', os: ['android'], androidPackage: 'com.mxtech.videoplayer.ad' },
  { id: 'mxplayerpro', label: 'MX Player Pro', os: ['android'], androidPackage: 'com.mxtech.videoplayer.pro' },
  { id: 'none', label: 'Ocultar botón', os: ['android', 'ios', 'mac', 'windows', 'linux', 'other'] },
]

export function playerById(id: string): ExternalPlayer | undefined {
  return EXTERNAL_PLAYERS.find((p) => p.id === id)
}

/** Los que tienen sentido en este sistema (para la lista de Ajustes). */
export function playersFor(os: Os): ExternalPlayer[] {
  return EXTERNAL_PLAYERS.filter((p) => p.os.includes(os))
}

/** El elegido si existe en este sistema; si no (ej. una copia importada de otro equipo), "Del sistema". */
export function effectivePlayer(id: string, os: Os): ExternalPlayer {
  const p = playerById(id)
  return p && p.os.includes(os) ? p : EXTERNAL_PLAYERS[0]
}

/**
 * Intent de Android. Sin paquete abre el selector de reproductores; con paquete va directo a esa app
 * (si no está instalada, Android ofrece bajarla de la tienda).
 */
export function androidIntent(url: string, pkg?: string, title?: string): string {
  const m = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(url)
  const scheme = m ? m[1].toLowerCase() : 'https'
  const rest = m ? m[2] : url
  const extras = title ? `S.title=${enc(title)};` : ''
  return `intent://${rest}#Intent;scheme=${scheme};type=video/*;${pkg ? `package=${pkg};` : ''}${extras}end`
}

export interface ExternalLaunch {
  /** Enlace a abrir; sin enlace solo se copia la URL. */
  href?: string
  /** Copiar la URL igual (por si el esquema no está registrado). */
  copy: boolean
  label: string
}

/** Qué hacer al tocar "Abrir en…" con el reproductor `id` en el sistema `os`. */
export function externalLaunch(id: string, url: string, os: Os, title?: string): ExternalLaunch {
  const p = effectivePlayer(id, os)
  if (p.id === 'none') return { copy: false, label: p.label }
  if (os === 'android') {
    // "Del sistema" abre el selector; los demás van directo a su paquete.
    return { href: androidIntent(url, p.androidPackage, title), copy: false, label: p.id === 'system' ? 'otro reproductor' : p.label }
  }
  if (p.id === 'vlc' && os === 'ios') return { href: `vlc-x-callback://x-callback-url/stream?url=${enc(url)}`, copy: true, label: p.label }
  if (p.scheme) return { href: p.scheme(url), copy: true, label: p.label }
  // "Del sistema" fuera de Android: no hay selector, se copia el enlace.
  return { copy: true, label: 'otro reproductor' }
}
