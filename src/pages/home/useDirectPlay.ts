import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { findResumeStream, type ResumeTarget } from '../../lib/nextEpisode'
import { continueWatching, type WatchEntry } from '../../lib/store'

const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])

/**
 * "Reproducir" directo (Seguir viendo y portada): mientras busca la fuente, `pending` tiene la clave de
 * la tarjeta (para mostrar "Buscando fuente…"); si encuentra algo reproducible va al reproductor y si
 * no, a la ficha (`fallback`), como antes. Atrás, tocar la misma tarjeta otra vez o irse de la
 * pantalla cancela la búsqueda.
 */
export function useDirectPlay() {
  const navigate = useNavigate()
  const [pending, setPending] = useState<string>()
  const ctrl = useRef<AbortController>(undefined)

  const cancel = useCallback(() => {
    ctrl.current?.abort()
    ctrl.current = undefined
    setPending(undefined)
  }, [])

  useEffect(() => () => ctrl.current?.abort(), [])

  // Atrás mientras busca: cancela y no llega a la navegación general (que subiría o cambiaría de página).
  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (!BACK_KEYS.has(e.key) || e.altKey || e.ctrlKey || e.metaKey) return
      e.preventDefault()
      e.stopPropagation()
      cancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [pending, cancel])

  const play = useCallback(
    async (key: string, target: ResumeTarget | (() => Promise<ResumeTarget | undefined>), fallback: string) => {
      if (pending === key) return cancel()
      ctrl.current?.abort()
      const mine = new AbortController()
      ctrl.current = mine
      setPending(key)
      let found
      try {
        const t = typeof target === 'function' ? await target() : target
        found = t && !mine.signal.aborted ? await findResumeStream(t, mine.signal) : undefined
      } catch {
        found = undefined
      }
      if (mine.signal.aborted) return
      ctrl.current = undefined
      setPending(undefined)
      if (!found) {
        navigate(fallback)
        return
      }
      const videoId = found.video?.id ?? found.meta.id
      navigate(`/watch/${found.meta.type}/${encodeURIComponent(videoId)}`, { state: found })
    },
    [pending, cancel, navigate],
  )

  return { pending, play, cancel }
}

/**
 * Texto del botón principal de la portada: "Continuar" si la peli quedó a medias o si la serie ya se
 * empezó (sigue por el episodio que corresponde); si no, "Reproducir".
 */
export function resumeLabel(metaId: string, type: string, progress: Record<string, WatchEntry>): 'Continuar' | 'Reproducir' {
  const entries = Object.values(progress).filter((e) => e.metaId === metaId)
  if (type === 'series') return entries.length > 0 ? 'Continuar' : 'Reproducir'
  return continueWatching(Object.fromEntries(entries.map((e) => [e.videoId, e]))).length > 0 ? 'Continuar' : 'Reproducir'
}
