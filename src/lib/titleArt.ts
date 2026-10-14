import { useEffect, useState } from 'react'
import { imdbFromTmdb, parseTmdbId } from './tmdb'
import type { MetaPreview } from './types'

// Fondo y logo de las tarjetas apaisadas (v0.14, U10). Los de IMDb salen de metahub; los ítems de
// TMDB traen su fondo, y el logo sale de metahub una vez que se sabe su id de IMDb.

export const metahubLogo = (tt: string) => `https://images.metahub.space/logo/medium/${tt}/img`

/** Fondo 16:9 para una tarjeta: el de TMDB en un tamaño más chico, o el de metahub. */
export function cardBackdrop(meta: Pick<MetaPreview, 'id' | 'background'>): string | undefined {
  if (meta.background) return meta.background.replace('/t/p/w1280/', '/t/p/w780/').replace('/t/p/original/', '/t/p/w780/')
  if (meta.id.startsWith('tt')) return `https://images.metahub.space/background/medium/${meta.id}/img`
  return undefined
}

/** Logo directo, sin pedir nada (el que trae la meta o el de metahub para ids de IMDb). */
export function directLogo(meta: Pick<MetaPreview, 'id' | 'logo'>): string | undefined {
  return meta.logo ?? (meta.id.startsWith('tt') ? metahubLogo(meta.id) : undefined)
}

/**
 * Logo de un título. Para un ítem de TMDB se averigua el id de IMDb (queda en caché 30 días) recién
 * con `enabled`, o sea cuando la tarjeta está cerca de la pantalla.
 */
export function useTitleLogo(meta: Pick<MetaPreview, 'id' | 'logo'>, enabled: boolean): string | undefined {
  const direct = directLogo(meta)
  const tmdb = direct ? undefined : parseTmdbId(meta.id)
  const tmdbType = tmdb?.type
  const tmdbId = tmdb?.id
  const [tt, setTt] = useState<{ id: string; tt?: string }>()
  useEffect(() => {
    if (!enabled || !tmdbType || tmdbId === undefined) return
    let alive = true
    imdbFromTmdb(tmdbId, tmdbType)
      .then((found) => {
        if (alive) setTt({ id: meta.id, tt: found })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [enabled, tmdbType, tmdbId, meta.id])
  if (direct) return direct
  return tt?.id === meta.id && tt.tt ? metahubLogo(tt.tt) : undefined
}

/** Se vuelve `true` (y queda así) cuando el elemento se acerca a la pantalla. */
export function useNearOnce<T extends Element>(active: boolean): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    if (!active || near || !el) return
    if (typeof IntersectionObserver !== 'function') {
      setNear(true)
      return
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setNear(true)
    }, { rootMargin: '200px 600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [active, near, el])
  return [setEl, near]
}
