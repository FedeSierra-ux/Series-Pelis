// Abrir la app desde el inicio de Android TV (v0.21): una tarjeta de "A continuación" o de "Mi lista" trae
// la ficha a abrir (`/detail/...`, con `play=1` si hay que reproducir directo). Android ya lo revisa, pero
// acá se revisa de nuevo: solo fichas o Mi lista, nunca otra cosa.

import type { ResumeTarget } from './nextEpisode'

export interface LaunchTarget {
  /** Adónde ir (sin `play`). */
  path: string
  /** Reproducir directo; si no hay fuente, queda `path`. */
  play?: ResumeTarget
}

const SAFE = /^[A-Za-z0-9/_\-.%?=&:]+$/
const DETAIL = /^\/detail\/(movie|series)\/([^/]+)$/

/** El destino de un enlace del inicio de la TV, o `undefined` si no es uno válido. */
export function parseLaunchPath(raw: string | undefined): LaunchTarget | undefined {
  if (!raw || raw.length > 500 || !raw.startsWith('/') || raw.startsWith('//') || !SAFE.test(raw)) return undefined
  let url: URL
  try {
    url = new URL(raw, 'https://app.invalid')
  } catch {
    return undefined
  }
  if (url.origin !== 'https://app.invalid') return undefined
  if (url.pathname === '/list') return { path: '/list' }
  const m = DETAIL.exec(url.pathname)
  if (!m) return undefined
  const type = m[1]
  let metaId: string
  try {
    metaId = decodeURIComponent(m[2])
  } catch {
    return undefined
  }
  const play = url.searchParams.get('play') === '1'
  url.searchParams.delete('play')
  const video = url.searchParams.get('video') ?? undefined
  const query = url.searchParams.toString()
  const path = `${url.pathname}${query ? `?${query}` : ''}`
  if (!play) return { path }
  // Un episodio tiene que ser de esa serie.
  if (type === 'series' && video && !video.startsWith(`${metaId}:`)) return { path }
  return { path, play: { type, metaId, videoId: type === 'movie' ? metaId : video } }
}

const PENDING_KEY = 'sp-pending-launch'

/** Para después de recargar con otro perfil. */
export function savePendingLaunch(path: string) {
  try {
    sessionStorage.setItem(PENDING_KEY, path)
  } catch {
    // Sin sessionStorage: se abre Inicio y listo.
  }
}

export function takePendingLaunch(): string | undefined {
  try {
    const v = sessionStorage.getItem(PENDING_KEY) ?? undefined
    sessionStorage.removeItem(PENDING_KEY)
    return v
  } catch {
    return undefined
  }
}
