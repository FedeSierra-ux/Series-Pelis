import { useEffect, useState } from 'react'
import { StarRatingInput } from '../../components/StarRating'
import { endCardAt } from '../../lib/credits'
import { ratingsStore } from '../../lib/ratings'
import { settingsStore, useStore } from '../../lib/store'

/** Sin datos de créditos, la tarjeta aparece este tiempo antes del final. */
export const END_FALLBACK_S = 45
const FALLBACK_S = END_FALLBACK_S

interface Props {
  meta: { id: string; type: string; name: string; poster?: string }
  /** Hay siguiente episodio: entonces no se pregunta (se pregunta en el último). */
  hasNext: boolean
  time: number
  duration: number
  /** Inicio de los créditos según IntroDB, si se sabe. */
  creditsStart?: number
}

/**
 * Tarjeta discreta "¿Qué te pareció?" al final de una peli o del último episodio. No aparece si
 * ya la habías puntuado, si la cerrás o si está apagada en Ajustes. Con el control remoto se llega
 * con ↑ desde los controles; al terminar el video recibe el foco sola.
 */
export function RateAtEnd({ meta, hasNext, time, duration, creditsStart }: Props) {
  const ask = useStore(settingsStore).askRatingAtEnd
  // Si ya tenía puntaje antes de empezar, no molestamos.
  const [ratedBefore] = useState(() => !!ratingsStore.get()[meta.id])
  const [closed, setClosed] = useState(false)
  const [thanks, setThanks] = useState(false)

  useEffect(() => {
    if (!thanks) return
    const t = setTimeout(() => setClosed(true), 2500)
    return () => clearTimeout(t)
  }, [thanks])

  const from = endCardAt(creditsStart, duration, FALLBACK_S)
  const due = !hasNext && from !== undefined && time >= from
  const ended = duration > 0 && time >= duration - 1
  if (!ask || ratedBefore || closed || !due) return null

  return (
    <div className="player-rate player-float" role="group" aria-label="Puntuar">
      <strong className="player-rate-title">{thanks ? '¡Gracias!' : '¿Qué te pareció?'}</strong>
      <span className="player-rate-name">{meta.name}</span>
      <StarRatingInput title={meta} label="" compact autoFocus={ended} onSaved={() => setThanks(true)} />
      {!thanks && (
        <button type="button" className="btn btn-ghost btn-small player-rate-close" onClick={() => setClosed(true)}>
          Ahora no
        </button>
      )}
    </div>
  )
}
