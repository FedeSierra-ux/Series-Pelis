import { useMemo, useState, type ReactNode } from 'react'
import { hideEpisode, furthestWatched } from '../lib/spoilers'
import { progressStore, settingsStore, useStore } from '../lib/store'

// Modo sin spoilers (Ajustes → Gustos y spoilers). Las reglas están en `lib/spoilers.ts`.

export interface EpisodeRef {
  metaId: string
  videoId: string
  season?: number
  episode?: number
}

/** Devuelve una función que dice si hay que esconder un episodio (false con el modo apagado). */
export function useEpisodeSpoilers(): (ep: EpisodeRef) => boolean {
  const settings = useStore(settingsStore)
  const progress = useStore(progressStore)
  const on = settings.spoilerFree
  const furthest = useMemo(() => (on ? furthestWatched(progress) : undefined), [on, progress])
  return useMemo(
    () => (ep: EpisodeRef) => !!furthest && hideEpisode({ spoilerFree: on }, ep, progress, furthest.get(ep.metaId)),
    [on, furthest, progress],
  )
}

/** Sinopsis escondida que se muestra al tocar el botón (o Enter con el control remoto). */
export function SpoilerText({ hidden, children, className = '' }: { hidden: boolean; children: ReactNode; className?: string }) {
  const [revealed, setRevealed] = useState(false)
  if (!hidden || revealed) return <>{children}</>
  return (
    <button type="button" className={`spoiler-reveal ${className}`} onClick={() => setRevealed(true)}>
      <span aria-hidden>🙈</span> Sinopsis oculta para evitar spoilers · <u>Mostrar</u>
    </button>
  )
}
