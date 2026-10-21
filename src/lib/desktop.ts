// La app de Windows (v0.30, carpeta desktop-app/): es esta misma web dentro de Electron, con un motor de torrents
// y la conversión de video adentro (como Stremio de escritorio, sin instalar nada más). El preload deja
// `window.flixDesktop`; en el navegador no existe y todo esto no hace nada.

import type { NativeUpdateEvent, NativeUpdateInfo } from './native'

/** Lo que expone la app de Windows (ver desktop-app/CONTRACT.md). */
export interface FlixDesktop {
  version: string
  /** Motor de torrents: `http://127.0.0.1:<puerto>/<token>`, con la API del servidor de Stremio. '' = no arrancó. */
  torrent: string
  update?: {
    check(force?: boolean): Promise<NativeUpdateInfo>
    install(): Promise<void>
    onEvent(fn: (e: NativeUpdateEvent) => void): () => void
  }
}

/** Instalador de la última versión (lo publica el workflow desktop.yml en Releases). */
export const DESKTOP_DOWNLOAD_URL = 'https://github.com/FedeSierra-ux/Series-Pelis/releases/latest/download/flix-pc-setup.exe'

const ENGINE_RE = /^http:\/\/127\.0\.0\.1:\d{1,5}\/[0-9a-f]{16,64}$/i

/** Base del motor si es la que corresponde (127.0.0.1 con token). Cualquier otra cosa: `undefined`. */
export function desktopEngineBase(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const base = value.trim().replace(/\/+$/, '')
  return ENGINE_RE.test(base) ? base : undefined
}

/** La app de Windows, si la página corre adentro. */
export function desktopApp(): FlixDesktop | undefined {
  if (typeof window === 'undefined') return undefined
  const d = (window as unknown as { flixDesktop?: FlixDesktop }).flixDesktop
  return d && typeof d === 'object' && typeof d.version === 'string' ? d : undefined
}

export function isDesktopApp(): boolean {
  return !!desktopApp()
}

/** Base del motor de torrents de la app de Windows (o `undefined`: navegador o el motor no arrancó). */
export function desktopTorrentBase(): string | undefined {
  return desktopEngineBase(desktopApp()?.torrent)
}
