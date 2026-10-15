import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { episodeLabel } from '../../lib/format'
import { nativeKeepAwake } from '../../lib/native'
import type { PlayState } from '../Detail'

// Integración con el sistema: controles en la pantalla de bloqueo y los auriculares (Media Session),
// pantalla prendida mientras se reproduce (Wake Lock) y ventana flotante (Picture-in-Picture).
// Todo con guardas de `typeof` / `in`: corre en navegadores de TV viejos que no tienen nada de esto.

const SEEK_STEP = 10

type SessionNavigator = Navigator & { mediaSession?: MediaSession }

const mediaSession = (): MediaSession | undefined => {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return undefined
  return (navigator as SessionNavigator).mediaSession ?? undefined
}

/**
 * Metadatos y botones del sistema (notificación de Android, pantalla de bloqueo, teclas multimedia).
 * `onNext` solo se registra cuando hay siguiente episodio.
 */
export function useMediaSession({
  videoRef,
  state,
  playing,
  onNext,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  state: PlayState
  playing: boolean
  onNext?: () => void
}) {
  const { meta, video } = state
  const episode = video ? [episodeLabel(video.season, video.episode), video.title ?? video.name].filter(Boolean).join(' · ') : ''

  // Metadatos: título, episodio y póster.
  useEffect(() => {
    const ms = mediaSession()
    if (!ms || typeof MediaMetadata === 'undefined') return
    try {
      ms.metadata = new MediaMetadata({
        title: meta.name,
        artist: episode || state.addonName,
        album: video ? meta.name : '',
        artwork: meta.poster ? [{ src: meta.poster, sizes: '300x450', type: '' }] : [],
      })
    } catch {
      // Metadatos inválidos (póster con URL rara): no pasa nada.
    }
    return () => {
      try {
        ms.metadata = null
      } catch {
        // nada
      }
    }
  }, [meta.name, meta.poster, episode, state.addonName, !!video])

  // Botones: play, pausa, ±10 s, ir a una posición, siguiente episodio y "anterior" (= empezar de nuevo).
  const nextRef = useRef(onNext)
  nextRef.current = onNext
  const hasNext = !!onNext
  useEffect(() => {
    const ms = mediaSession()
    if (!ms || typeof ms.setActionHandler !== 'function') return
    const el = () => videoRef.current
    const seekBy = (delta: number) => {
      const v = el()
      if (!v) return
      v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta))
    }
    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ['play', () => el()?.play().catch(() => {})],
      ['pause', () => el()?.pause()],
      ['seekbackward', (d) => seekBy(-(d.seekOffset ?? SEEK_STEP))],
      ['seekforward', (d) => seekBy(d.seekOffset ?? SEEK_STEP)],
      [
        'seekto',
        (d) => {
          const v = el()
          if (v && typeof d.seekTime === 'number') v.currentTime = d.seekTime
        },
      ],
      [
        'previoustrack',
        () => {
          const v = el()
          if (v) v.currentTime = 0
        },
      ],
      ['nexttrack', hasNext ? () => nextRef.current?.() : null],
    ]
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler)
      } catch {
        // Acción que este navegador no conoce (`seekto` en versiones viejas).
      }
    }
    handlers.forEach(([action, handler]) => set(action, handler))
    return () => handlers.forEach(([action]) => set(action, null))
  }, [videoRef, hasNext])

  // Estado y posición, para que la barra de la notificación avance sola.
  useEffect(() => {
    const ms = mediaSession()
    if (!ms) return
    try {
      ms.playbackState = playing ? 'playing' : 'paused'
    } catch {
      // nada
    }
  }, [playing])

  useEffect(() => {
    const ms = mediaSession()
    const v = videoRef.current
    if (!ms || !v || typeof ms.setPositionState !== 'function') return
    const update = () => {
      const duration = v.duration
      if (!Number.isFinite(duration) || duration <= 0) return
      try {
        ms.setPositionState({ duration, playbackRate: v.playbackRate || 1, position: Math.min(Math.max(0, v.currentTime), duration) })
      } catch {
        // Valores inválidos durante una carga: se vuelve a intentar en el próximo evento.
      }
    }
    // `timeupdate` dispara ~4 veces por segundo: alcanza con avisar cada tanto y en cada salto.
    let last = 0
    const onTime = () => {
      const now = Date.now()
      if (now - last < 2000) return
      last = now
      update()
    }
    v.addEventListener('loadedmetadata', update)
    v.addEventListener('durationchange', update)
    v.addEventListener('seeked', update)
    v.addEventListener('ratechange', update)
    v.addEventListener('play', update)
    v.addEventListener('timeupdate', onTime)
    return () => {
      v.removeEventListener('loadedmetadata', update)
      v.removeEventListener('durationchange', update)
      v.removeEventListener('seeked', update)
      v.removeEventListener('ratechange', update)
      v.removeEventListener('play', update)
      v.removeEventListener('timeupdate', onTime)
      try {
        ms.setPositionState()
      } catch {
        // nada
      }
    }
  }, [videoRef])
}

interface WakeLockSentinelLike {
  released?: boolean
  release(): Promise<void>
  addEventListener?(type: 'release', listener: () => void): void
}
type WakeLockNavigator = Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }

/** Mantiene la pantalla prendida mientras `active` (reproduciendo); la suelta al pausar o salir y la vuelve a pedir al volver a la pestaña. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    // En la app de TV la pantalla la mantiene prendida Android (el WebView no tiene Wake Lock).
    if (active && nativeKeepAwake(true)) return () => void nativeKeepAwake(false)
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    const wakeLock = (navigator as WakeLockNavigator).wakeLock
    if (!wakeLock || typeof wakeLock.request !== 'function') return
    let sentinel: WakeLockSentinelLike | null = null
    let disposed = false
    const request = async () => {
      if (disposed || typeof document === 'undefined' || document.visibilityState !== 'visible') return
      try {
        const s = await wakeLock.request('screen')
        if (disposed) {
          s.release().catch(() => {})
          return
        }
        sentinel = s
      } catch {
        // Sin permiso (pestaña en segundo plano, batería baja): la pantalla se apaga como siempre.
      }
    }
    // Al cambiar de pestaña el sistema lo suelta solo: al volver se pide de nuevo.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) request()
    }
    document.addEventListener('visibilitychange', onVisible)
    request()
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisible)
      sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [active])
}

type PipVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean
  webkitSetPresentationMode?: (mode: string) => void
  webkitPresentationMode?: string
}
type PipDocument = Document & { pictureInPictureEnabled?: boolean; pictureInPictureElement?: Element | null; exitPictureInPicture?: () => Promise<void> }

const pipDocument = () => (typeof document === 'undefined' ? undefined : (document as PipDocument))

/** Picture-in-Picture: `supported` decide si se muestra el botón; en Safari va por `webkitSetPresentationMode`. */
export function usePictureInPicture(videoRef: RefObject<HTMLVideoElement | null>) {
  const [supported, setSupported] = useState(false)
  const [active, setActive] = useState(false)

  useEffect(() => {
    const v = videoRef.current as PipVideo | null
    const doc = pipDocument()
    if (!v || !doc) return
    const standard = !!doc.pictureInPictureEnabled && typeof v.requestPictureInPicture === 'function' && !v.disablePictureInPicture
    const webkit = typeof v.webkitSupportsPresentationMode === 'function' && v.webkitSupportsPresentationMode('picture-in-picture')
    setSupported(standard || webkit)
    if (!standard && !webkit) return
    const onEnter = () => setActive(true)
    const onLeave = () => setActive(false)
    const onWebkit = () => setActive(v.webkitPresentationMode === 'picture-in-picture')
    v.addEventListener('enterpictureinpicture', onEnter)
    v.addEventListener('leavepictureinpicture', onLeave)
    v.addEventListener('webkitpresentationmodechanged', onWebkit)
    return () => {
      v.removeEventListener('enterpictureinpicture', onEnter)
      v.removeEventListener('leavepictureinpicture', onLeave)
      v.removeEventListener('webkitpresentationmodechanged', onWebkit)
      // Al salir del reproductor se cierra la ventanita (si no, queda flotando con el video descargado).
      if (doc.pictureInPictureElement === v) doc.exitPictureInPicture?.().catch(() => {})
      else if (v.webkitPresentationMode === 'picture-in-picture') v.webkitSetPresentationMode?.('inline')
    }
  }, [videoRef])

  const toggle = useCallback(async (): Promise<boolean> => {
    const v = videoRef.current as PipVideo | null
    const doc = pipDocument()
    if (!v || !doc) return false
    try {
      if (doc.pictureInPictureEnabled && typeof v.requestPictureInPicture === 'function') {
        if (doc.pictureInPictureElement === v) await doc.exitPictureInPicture?.()
        else await v.requestPictureInPicture()
        return true
      }
      if (typeof v.webkitSetPresentationMode === 'function') {
        v.webkitSetPresentationMode(v.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture')
        return true
      }
    } catch {
      // Todavía no cargaron los metadatos, o el navegador lo bloqueó: se avisa y listo.
    }
    return false
  }, [videoRef])

  return { supported, active, toggle }
}
