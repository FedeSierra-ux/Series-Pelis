import { useEffect, useState } from 'react'
import type { CreditsPlan } from '../../lib/credits'
import { findByImdb, getCreditsStinger, hasTmdb, type CreditsStinger } from '../../lib/tmdb'

/** Sin datos de IntroDB, en las pelis se supone que los créditos ocupan los últimos minutos. */
const MOVIE_CREDITS_GUESS_S = 8 * 60

interface Props {
  imdbId: string
  type: string
  plan: CreditsPlan
  time: number
  duration: number
}

/** Aviso chico al empezar los créditos si hay algo después (IntroDB o, en pelis, las palabras clave de TMDB). */
export function CreditsNotice({ imdbId, type, plan, time, duration }: Props) {
  const [stinger, setStinger] = useState<CreditsStinger>()

  useEffect(() => {
    setStinger(undefined)
    if (type !== 'movie' || !hasTmdb() || !imdbId.startsWith('tt')) return
    let alive = true
    findByImdb(imdbId, type)
      .then((id) => (id ? getCreditsStinger(id) : undefined))
      .then((s) => {
        if (alive) setStinger(s)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [imdbId, type])

  if (!(duration > 0)) return null
  const guess = stinger && duration >= 40 * 60 ? duration - Math.min(MOVIE_CREDITS_GUESS_S, duration * 0.08) : undefined
  const start = plan.credits?.start ?? guess
  const end = plan.credits?.end ?? duration
  if (start === undefined || time < start || time >= end - 0.5 || (!stinger && !plan.afterCredits)) return null
  return (
    <div className="player-chip" role="status">
      {stinger === 'after'
        ? 'Quedate: hay escena post-créditos'
        : stinger === 'during'
          ? 'Quedate: hay una escena durante los créditos'
          : 'Hay una escena después de los créditos'}
    </div>
  )
}
