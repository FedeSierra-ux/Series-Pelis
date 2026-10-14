import { useEffect, useRef, useState } from 'react'
import { YT_LISTEN, YT_ORIGIN, ytCommand, ytPlayerState } from '../../lib/hoverTrailer'

// Control del iframe de YouTube por postMessage (la API de iframes sin cargar su script): lo usan
// el tráiler a pantalla completa y el tráiler de fondo de la ficha.

/**
 * Si YouTube no manda su estado (la API de mensajes no responde), el tráiler a pantalla completa se
 * muestra igual pasado esto: lo abrió el usuario y es mejor que vea el video que "Cargando" para siempre.
 */
const STATE_FALLBACK_MS = 6000

export interface YtPlayer {
  frame: React.RefObject<HTMLIFrameElement | null>
  /** Ya está reproduciendo (recién ahí se muestra: antes YouTube pone su botón grande de play). */
  ready: boolean
  playing: boolean
  muted: boolean
  ended: boolean
  onLoad: () => void
  play: () => void
  pause: () => void
  setMuted: (muted: boolean) => void
}

/**
 * `startMuted`: cómo arranca el video (el de fondo, sin sonido). Si arranca con sonido y el navegador
 * lo frena (sin un clic previo no deja), se pasa a sin sonido para que al menos se vea.
 * `stateFallback`: mostrarlo igual si YouTube no confirma que reproduce. El de fondo va sin esto: si
 * YouTube no carga (sin red, filtrado o una TV donde el embed no anda) quedaría un iframe roto encima
 * de la portada, así que se muestra recién con el estado 1 (reproduciendo), como la portada de Inicio.
 */
export function useYtPlayer(startMuted: boolean, stateFallback = true): YtPlayer {
  const frame = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [muted, setMutedState] = useState(startMuted)
  const [ended, setEnded] = useState(false)
  const gotState = useRef(false)
  const playingRef = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const post = (func: string, args: unknown[] = []) => frame.current?.contentWindow?.postMessage(ytCommand(func, args), YT_ORIGIN)

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return
      let data: { event?: string; info?: { muted?: boolean } | null } | undefined
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      const state = ytPlayerState(data)
      if (state !== undefined) {
        gotState.current = true
        playingRef.current = state === 1
        setPlaying(state === 1)
        if (state === 1) setReady(true)
        if (state === 0) setEnded(true)
      }
      if (data?.event === 'onReady' && !startMuted) {
        // Con sonido puede no arrancar (política de reproducción automática): probamos sin sonido.
        timers.current.push(
          setTimeout(() => {
            if (playingRef.current) return
            post('mute')
            post('playVideo')
            setMutedState(true)
          }, 2500),
        )
      }
      if (data?.event === 'infoDelivery' && data.info && typeof data.info.muted === 'boolean') setMutedState(data.info.muted)
    }
    window.addEventListener('message', onMessage)
    const list = timers.current
    return () => {
      window.removeEventListener('message', onMessage)
      list.forEach(clearTimeout)
    }
  }, [])

  const onLoad = () => {
    // Pedimos los eventos del reproductor (listo, estado, silencio).
    frame.current?.contentWindow?.postMessage(YT_LISTEN, YT_ORIGIN)
    if (!stateFallback) return
    timers.current.push(
      setTimeout(() => {
        if (!gotState.current) {
          setReady(true)
          setPlaying(true)
        }
      }, STATE_FALLBACK_MS),
    )
  }

  return {
    frame,
    ready,
    playing,
    muted,
    ended,
    onLoad,
    play: () => {
      post('playVideo')
      setPlaying(true)
    },
    pause: () => {
      post('pauseVideo')
      setPlaying(false)
    },
    setMuted: (m: boolean) => {
      if (m) post('mute')
      else {
        post('unMute')
        post('setVolume', [100])
      }
      setMutedState(m)
    },
  }
}
