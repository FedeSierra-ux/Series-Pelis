import { useEffect, useRef, useState } from 'react'
import { saveDataOn } from '../../lib/dataSaver'
import { useMediaQuery } from '../../lib/media'
import { COARSE_POINTER_QUERY, REDUCED_MOTION_QUERY, WIDE_PAGE_QUERY } from '../../lib/mediaQueries'
import { isTv } from '../../lib/spatialNav'
import { whenIdle } from '../../lib/whenIdle'
import { settingsStore, useStore } from '../../lib/store'
import { DetailIcon } from './DetailIcons'
import { BACKDROP_DELAY_MS, backdropTrailerAllowed, embedTrailerUrl, TRAILER_IDLE_MS, TRAILER_TV_QUIET_MS } from './trailers'
import { useYtPlayer } from './useYtPlayer'

// Tráiler de fondo de la ficha (v0.14): a los ~3 s de abrirla, la imagen de la portada pasa al tráiler
// sin sonido, como en Netflix y Disney+. Con botones para activar el sonido y pausar. No va en
// celulares, con "reducir movimiento", con ahorro de datos ni con el tráiler de los pósters apagado.

/** Si en este dispositivo y con estos ajustes corresponde el tráiler de fondo. */
export function useBackdropTrailerAllowed(): boolean {
  const enabled = useStore(settingsStore).hoverTrailer
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY)
  const wide = useMediaQuery(WIDE_PAGE_QUERY)
  const coarsePointer = useMediaQuery(COARSE_POINTER_QUERY)
  return backdropTrailerAllowed({ enabled, saveData: saveDataOn(), reducedMotion, wide, coarsePointer })
}

interface Props {
  ytId: string
  title: string
  /** El tráiler a pantalla completa está abierto (o hay otro video): el de fondo se frena. */
  suspended: boolean
}

/** Va dentro de `.detail-hero`, debajo de la sombra. Arranca solo pasado BACKDROP_DELAY_MS. */
export function HeroTrailer({ ytId, title, suspended }: Props) {
  const [started, setStarted] = useState(false)
  useEffect(() => {
    // v0.36 (sistema-05): pasado el retraso, el iframe de YouTube se monta con el navegador ocioso (en la TV, además,
    // sin teclas durante 1 s): no compite con lo primero que el usuario hace en la ficha.
    let cancelIdle: (() => void) | undefined
    const t = setTimeout(() => {
      cancelIdle = whenIdle(() => setStarted(true), { timeoutMs: TRAILER_IDLE_MS, quietKeysMs: isTv() ? TRAILER_TV_QUIET_MS : 0 })
    }, BACKDROP_DELAY_MS)
    return () => {
      clearTimeout(t)
      cancelIdle?.()
    }
  }, [ytId])
  if (!started) return null
  return <HeroTrailerFrame key={ytId} ytId={ytId} title={title} suspended={suspended} />
}

function HeroTrailerFrame({ ytId, title, suspended }: Props) {
  // Sin "mostrar igual": sin un estado real de YouTube queda la imagen de la portada.
  const yt = useYtPlayer(true, false)
  const box = useRef<HTMLDivElement>(null)
  // Pausado a pedido del usuario (el botón): no se reanuda solo al volver a la pantalla.
  const [userPaused, setUserPaused] = useState(false)
  const [visible, setVisible] = useState(true)
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden')

  useEffect(() => {
    const el = box.current?.parentElement
    if (!el || typeof IntersectionObserver !== 'function') return
    const io = new IntersectionObserver(([entry]) => setVisible(entry.intersectionRatio > 0.3), { threshold: [0, 0.3, 0.6] })
    io.observe(el)
    const onVis = () => setPageVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVis)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // Fuera de pantalla, con la pestaña oculta o con el tráiler grande abierto: en pausa.
  const shouldPlay = !userPaused && !suspended && visible && pageVisible
  const { ready, playing } = yt
  useEffect(() => {
    if (!ready) return
    if (shouldPlay && !playing) yt.play()
    else if (!shouldPlay && playing) yt.pause()
    // `yt` cambia en cada render; lo que importa es el estado.
  }, [shouldPlay, ready])

  // Con el tráiler grande abierto, el de fondo no tiene que sonar.
  useEffect(() => {
    if (suspended && !yt.muted) yt.setMuted(true)
  }, [suspended])

  // En pausa vuelve la imagen de la portada. Al seguir, el video aparece un momento después: así no se
  // ven los íconos de pausa / siguiente que YouTube muestra al cambiar de estado.
  const [shown, setShown] = useState(false)
  const shownOnce = useRef(false)
  useEffect(() => {
    if (!ready || !playing) {
      setShown(false)
      return
    }
    const t = setTimeout(() => {
      shownOnce.current = true
      setShown(true)
    }, shownOnce.current ? 1200 : 0)
    return () => clearTimeout(t)
  }, [ready, playing])

  const origin = typeof location !== 'undefined' ? location.origin : undefined

  return (
    <>
      <div ref={box} className={`hero-trailer${shown ? ' ready' : ''}`} aria-hidden>
        <iframe
          ref={yt.frame}
          src={embedTrailerUrl(ytId, { muted: true, loop: true, origin })}
          title={`Tráiler de ${title} (de fondo)`}
          tabIndex={-1}
          allow="autoplay; encrypted-media"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={yt.onLoad}
        />
      </div>
      {ready && (
        <div className="hero-trailer-controls">
          <button
            type="button"
            className="ht-ctrl"
            onClick={() => yt.setMuted(!yt.muted)}
            aria-label="Sonido del tráiler de fondo"
            aria-pressed={!yt.muted}
            title={yt.muted ? 'Activar sonido' : 'Silenciar'}
          >
            <DetailIcon name={yt.muted ? 'soundOff' : 'soundOn'} size={20} />
          </button>
          <button
            type="button"
            className="ht-ctrl"
            onClick={() => {
              const pause = !userPaused
              setUserPaused(pause)
              if (pause) yt.pause()
              else yt.play()
            }}
            aria-label={userPaused ? 'Seguir el tráiler de fondo' : 'Pausar el tráiler de fondo'}
            title={userPaused ? 'Seguir' : 'Pausar'}
          >
            <DetailIcon name={userPaused ? 'play' : 'pause'} size={20} />
          </button>
        </div>
      )}
    </>
  )
}
