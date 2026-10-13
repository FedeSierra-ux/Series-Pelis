import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  closeTrailer,
  disarmTrailer,
  hoverTrailerUrl,
  keepTrailer,
  placeCard,
  trailerSound,
  useOpenTrailer,
  ytCommand,
  type OpenTrailer,
} from '../lib/hoverTrailer'
import { ImdbRating } from './Rating'

const YT_ORIGIN = 'https://www.youtube-nocookie.com'
const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])

function isTyping() {
  const el = document.activeElement
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLTextAreaElement || el.isContentEditable) return true
  return el instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button', 'submit'].includes(el.type)
}
/** Capa única para el tráiler al pasar por un póster (va una sola vez, en el Layout). */
export function HoverTrailerLayer() {
  const open = useOpenTrailer()
  if (!open) return null
  return createPortal(<HoverTrailerCard key={`${open.ytId}|${open.meta.id}`} t={open} />, document.body)
}

function HoverTrailerCard({ t }: { t: OpenTrailer }) {
  const [place] = useState(() => {
    const el = t.anchor.querySelector<HTMLElement>('.poster-img') ?? t.anchor
    return placeCard(el.getBoundingClientRect(), window.innerWidth, window.innerHeight)
  })
  const [ready, setReady] = useState(false)
  const [muted, setMuted] = useState(true)
  const frame = useRef<HTMLIFrameElement>(null)
  // Si intentamos arrancar con sonido y el navegador lo frena, volvemos a sin sonido.
  const autoUnmute = useRef(false)

  const post = (func: string, args: unknown[] = []) => frame.current?.contentWindow?.postMessage(ytCommand(func, args), YT_ORIGIN)

  const setSound = (on: boolean) => {
    trailerSound.on = on
    if (on) {
      post('unMute')
      post('setVolume', [100])
    } else {
      post('mute')
    }
    setMuted(!on)
  }
  const toggleSound = () => setSound(muted)
  const toggleRef = useRef(toggleSound)
  toggleRef.current = toggleSound

  useEffect(() => {
    const close = () => closeTrailer()
    const onVis = () => document.visibilityState === 'hidden' && closeTrailer()
    const onKey = (e: KeyboardEvent) => {
      // Mientras se escribe (el campo de Buscar), Backspace y la M son del campo: solo Escape cierra.
      if (isTyping() && e.key !== 'Escape') return
      if (BACK_KEYS.has(e.key)) {
        // "Atrás" primero cierra la vista previa (y no vuelve de página).
        e.preventDefault()
        e.stopPropagation()
        closeTrailer()
      } else if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        toggleRef.current()
      }
    }
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return
      let data: { event?: string; info?: { muted?: boolean; playerState?: number } | null }
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
      } catch {
        return
      }
      if (data?.event === 'onReady' && trailerSound.on) {
        autoUnmute.current = true
        post('unMute')
        setMuted(false)
        setTimeout(() => (autoUnmute.current = false), 2500)
      }
      if (data?.event === 'infoDelivery' && data.info) {
        if (data.info.playerState === 2 && autoUnmute.current) {
          autoUnmute.current = false
          post('mute')
          post('playVideo')
          setMuted(true)
        } else if (typeof data.info.muted === 'boolean') {
          setMuted(data.info.muted)
        }
      }
    }
    // Al hacer scroll (la página o una fila) la tarjeta quedaría flotando en otro lado: la cerramos.
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('message', onMessage)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('message', onMessage)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const onLoad = () => {
    // Pedimos los eventos del reproductor (listo, silenciado, pausado) para el botón de sonido.
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YT_ORIGIN)
    // YouTube muestra un instante en negro: esperamos un poco antes del fundido.
    setTimeout(() => setReady(true), 500)
  }

  const openDetail = () => {
    const anchor = t.anchor
    closeTrailer()
    anchor.click()
  }

  const onSound = (e: MouseEvent) => {
    e.stopPropagation()
    toggleSound()
  }

  const { meta } = t
  const year = meta.releaseInfo ?? meta.year
  const origin = typeof location !== 'undefined' ? location.origin : undefined

  return (
    <div
      className="hover-trailer"
      style={{ left: place.left, top: place.top, width: place.width }}
      onMouseEnter={keepTrailer}
      onMouseLeave={() => disarmTrailer(t.anchor, 'mouse')}
      onClick={openDetail}
      aria-hidden
    >
      <div className="ht-video" style={t.backdrop ? { backgroundImage: `url(${t.backdrop})` } : undefined}>
        <iframe
          ref={frame}
          className={ready ? 'ready' : undefined}
          src={hoverTrailerUrl(t.ytId, origin)}
          title={`Tráiler de ${meta.name}`}
          tabIndex={-1}
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={onLoad}
        />
        {!ready && <span className="ht-loading">Cargando tráiler…</span>}
        <span role="button" className="ht-sound" onClick={onSound} title={muted ? 'Activar sonido (M)' : 'Silenciar (M)'}>
          {muted ? '🔇 Activar sonido' : '🔊 Silenciar'}
        </span>
      </div>
      <div className="ht-info">
        <strong className="ht-title">{meta.name}</strong>
        <span className="ht-meta">
          <ImdbRating value={meta.imdbRating} size="sm" />
          {year && <span>{year}</span>}
          <span>{meta.type === 'movie' ? 'Película' : meta.type === 'series' ? 'Serie' : ''}</span>
        </span>
        <span className="ht-hint">{t.via === 'focus' ? 'OK: ver la ficha · M: sonido' : 'Clic para ver la ficha'}</span>
      </div>
    </div>
  )
}
