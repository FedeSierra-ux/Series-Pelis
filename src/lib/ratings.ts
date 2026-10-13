import { useMemo } from 'react'
import { hiddenIdSet } from './recommend'
import { clampStars } from './stars'
import { notInterestedStore, ratingsStore, useStore, type NotInterestedEntry, type RatingEntry } from './store'
import { findByImdb, hasTmdb } from './tmdb'

// v0.5 gustos: tu puntaje con estrellas y "Ya no me interesa". Los stores viven en `store.ts`
// (así entran en exportar/importar y en el arranque); acá están las acciones y los hooks.

export { notInterestedStore, ratingsStore, type NotInterestedEntry, type RatingEntry }

export interface RatedTitle {
  id: string
  type: string
  name: string
  poster?: string
}

export function setRating(title: RatedTitle, stars: number, tmdbId?: number) {
  ratingsStore.set((all) => ({
    ...all,
    [title.id]: {
      stars: clampStars(stars),
      at: Date.now(),
      type: title.type,
      name: title.name,
      poster: title.poster,
      tmdbId: tmdbId ?? all[title.id]?.tmdbId,
    },
  }))
}

export function clearRating(id: string) {
  ratingsStore.set((all) => {
    if (!all[id]) return all
    const { [id]: _removed, ...rest } = all
    return rest
  })
}

/** Tu puntaje de un título (undefined si no lo puntuaste). */
export function useRating(id: string | undefined): RatingEntry | undefined {
  const all = useStore(ratingsStore)
  return id ? all[id] : undefined
}

export function markNotInterested(title: RatedTitle, tmdbId?: number) {
  notInterestedStore.set((all) => ({
    ...all,
    [title.id]: { id: title.id, type: title.type, name: title.name, poster: title.poster, tmdbId, at: Date.now() },
  }))
}

/** Lo vuelve a mostrar. Devuelve la entrada quitada (para "Deshacer"). */
export function unmarkNotInterested(id: string): NotInterestedEntry | undefined {
  const prev = notInterestedStore.get()[id]
  if (!prev) return undefined
  notInterestedStore.set((all) => {
    const { [id]: _removed, ...rest } = all
    return rest
  })
  return prev
}

export function restoreNotInterested(entry: NotInterestedEntry) {
  notInterestedStore.set((all) => ({ ...all, [entry.id]: entry }))
}

/** Completa el id de TMDB de una entrada (para poder sacarla también de las filas de TMDB). */
export function setNotInterestedTmdbId(id: string, tmdbId: number) {
  notInterestedStore.set((all) => (all[id] && all[id].tmdbId !== tmdbId ? { ...all, [id]: { ...all[id], tmdbId } } : all))
}

/**
 * Las marcadas sin TMDB (sin key, o antes de que cargara la ficha) se completan cuando hay key,
 * así también desaparecen de las filas de TMDB (Top 10, tendencias, "Para vos").
 */
export async function resolveNotInterestedTmdbIds() {
  if (!hasTmdb()) return
  const missing = Object.values(notInterestedStore.get()).filter((e) => !e.tmdbId && e.id.startsWith('tt'))
  for (const e of missing) {
    const id = await findByImdb(e.id, e.type).catch(() => undefined)
    if (id) setNotInterestedTmdbId(e.id, id)
  }
}

/** Ids a esconder en Inicio y en las recomendaciones (`tt…` y `tmdb:tipo:id`). */
export function useHiddenIds(): Set<string> {
  const all = useStore(notInterestedStore)
  return useMemo(() => hiddenIdSet(Object.values(all)), [all])
}
