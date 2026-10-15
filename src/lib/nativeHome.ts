// Filas propias en el inicio de Android TV (v0.21): "Seguir viendo" va a la fila "A continuación" del
// sistema (Watch Next) y "Mi lista" a un canal de la app. Acá se arma lo que se manda (lógica pura);
// `components/NativeHomeSync.tsx` lo manda al APK cada vez que cambia.

import type { NativeHomeData, NativeHomeItem, NativeListItem } from './native'
import type { ListItem, WatchEntry } from './store'
import { cardBackdrop } from './titleArt'
import type { ContinueItem } from './upNext'

/** Google recomienda pocas: más que esto en "A continuación" no se ve y ensucia. */
export const HOME_CONTINUE_MAX = 20
export const HOME_LIST_MAX = 30

/** Solo imágenes https (el inicio de la TV no muestra otras y no mandamos `data:` ni `http:`). */
const https = (url?: string) => (url && /^https:\/\//i.test(url) ? url : undefined)

const kindOf = (type: string): 'movie' | 'series' => (type === 'series' ? 'series' : 'movie')

/** Ficha en el episodio que corresponde; con `play=1` la app intenta reproducir directo (ver nativeLaunch). */
export function homeItemPath(type: string, metaId: string, videoId: string | undefined, season: number | undefined, play: boolean): string {
  const params = new URLSearchParams()
  if (season !== undefined && videoId) {
    params.set('season', String(season))
    params.set('video', videoId)
  }
  if (play) params.set('play', '1')
  const query = params.toString()
  return `/detail/${kindOf(type)}/${encodeURIComponent(metaId)}${query ? `?${query}` : ''}`
}

function fromResume(e: WatchEntry, at: number): NativeHomeItem {
  return {
    key: e.videoId,
    kind: 'continue',
    type: kindOf(e.type),
    metaId: e.metaId,
    title: e.name,
    episodeTitle: e.episodeTitle,
    season: e.season,
    episode: e.episode,
    image: https(cardBackdrop({ id: e.metaId, background: e.background })),
    poster: https(e.poster),
    position: Math.max(0, Math.round(e.position)),
    duration: Math.max(0, Math.round(e.duration)),
    lastEngagement: at,
    path: homeItemPath(e.type, e.metaId, e.videoId, e.season, true),
  }
}

/** "Seguir viendo" (lo empezado + el siguiente episodio) y lo de Mi lista sin empezar, para el perfil activo. */
export function buildHomeData(profile: string, items: ContinueItem[], watchlist: ListItem[]): NativeHomeData {
  const cont: NativeHomeItem[] = items.slice(0, HOME_CONTINUE_MAX).map((it) => {
    if (it.kind === 'resume') return fromResume(it.entry, it.at)
    const ep = it.episode
    return {
      key: ep.videoId,
      kind: it.label === 'Episodio nuevo' ? 'new' : 'next',
      type: 'series',
      metaId: ep.metaId,
      title: ep.seriesName,
      episodeTitle: ep.title,
      season: ep.season,
      episode: ep.episode,
      image: https(ep.thumbnail) ?? https(cardBackdrop({ id: ep.metaId })),
      poster: https(ep.poster),
      position: 0,
      duration: 0,
      lastEngagement: it.at,
      path: homeItemPath('series', ep.metaId, ep.videoId, ep.season, true),
    }
  })
  const list: NativeListItem[] = watchlist.slice(0, HOME_LIST_MAX).map((item) => ({
    key: item.id,
    type: kindOf(item.type),
    title: item.name,
    poster: https(item.poster),
    year: item.year,
    path: homeItemPath(item.type, item.id, undefined, undefined, false),
  }))
  return { profile, continue: cont, watchlist: list }
}
