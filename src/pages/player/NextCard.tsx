import { useEffect, useState } from 'react'
import { getMeta } from '../../lib/addons'
import { episodeLabel } from '../../lib/format'
import { episodeNumber } from '../../lib/upNext'
import { addonsStore, progressStore, settingsStore, useStore } from '../../lib/store'
import type { Video } from '../../lib/types'
import type { PlayState } from '../Detail'

// Tarjeta del siguiente episodio (U25): miniatura, "T1 · E5 · Título" y una barra que se llena con la
// cuenta regresiva. Los datos salen de la ficha, que ya está en caché.

interface Props {
  state: PlayState
  loading: boolean
  /** Pasa solo al terminar la cuenta (Ajustes → Reproducir el siguiente solo). */
  autoplay: boolean
  /** Segundos que faltan y total de la cuenta, para la barra. */
  secondsLeft: number
  total: number
  onPlay: () => void
  onCancel: () => void
}

/** "T1 · E5 · Título" (sin título si el addon no lo manda). */
export function nextEpisodeTitle(video: Pick<Video, 'season' | 'episode' | 'number' | 'title' | 'name'> | undefined): string {
  if (!video) return ''
  const ep = episodeNumber(video as Video)
  const code = video.season !== undefined && ep !== undefined ? episodeLabel(video.season, ep) : ''
  const title = (video.title ?? video.name ?? '').trim()
  return [code, title].filter(Boolean).join(' · ')
}

/** Fracción de la barra (0 a 1) según lo que falta de la cuenta. */
export function countdownFraction(secondsLeft: number, total: number): number {
  if (!(total > 0)) return 0
  return Math.max(0, Math.min(1, 1 - secondsLeft / total))
}

export function NextCard({ state, loading, autoplay, secondsLeft, total, onPlay, onCancel }: Props) {
  const spoilerFree = useStore(settingsStore).spoilerFree
  const [next, setNext] = useState<Video>()
  const nextId = state.nextVideoId

  useEffect(() => {
    if (!nextId) return
    let alive = true
    getMeta(addonsStore.get(), state.meta.type, state.meta.id)
      .then((meta) => {
        if (alive) setNext(meta.videos?.find((v) => v.id === nextId))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [state.meta.type, state.meta.id, nextId])

  const title = nextEpisodeTitle(next)
  const img = next?.thumbnail ?? state.meta.background
  // Sin spoilers: la miniatura de un episodio que no viste va borrosa (como en la ficha).
  const blur = spoilerFree && !!next?.thumbnail && !(nextId && progressStore.get()[nextId]?.watched)
  const left = Math.max(0, Math.ceil(secondsLeft))
  const fraction = countdownFraction(secondsLeft, total)

  return (
    <div className="next-card next-card-v14" role="group" aria-label={title ? `Siguiente episodio: ${title}` : 'Siguiente episodio'}>
      <div className={`next-thumb ${blur ? 'spoiler-blur' : ''}`}>
        {img ? <img src={img} alt="" decoding="async" /> : <span className="next-thumb-ph" aria-hidden />}
        {autoplay && !loading && (
          <span className="next-progress" aria-hidden>
            <span style={{ transform: `scaleX(${fraction})` }} />
          </span>
        )}
      </div>
      <div className="next-info">
        <span className="next-kicker">
          {loading ? 'Cargando el siguiente episodio…' : autoplay ? `Siguiente episodio en ${left} s` : 'Siguiente episodio'}
        </span>
        {title && <strong className="next-title">{title}</strong>}
        <div className="next-card-actions">
          {/* `aria-disabled` y no `disabled`: con el foco puesto, `disabled` lo soltaba y el OK del control caía en el video. */}
          <button className="btn btn-primary btn-small" onClick={loading ? undefined : onPlay} aria-disabled={loading || undefined} autoFocus>
            Reproducir
          </button>
          <button className="btn btn-small" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
