import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { DetailIcon } from '../pages/detail/DetailIcons'
import { embedTrailerUrl } from '../pages/detail/trailers'
import { useYtPlayer } from '../pages/detail/useYtPlayer'
import '../pages/detail/trailer-player.css'

// Tráiler a pantalla completa dentro de la app (v0.14): en la TV ya no se sale a YouTube. El iframe va
// sin la interfaz de YouTube y con subtítulos en español; los controles son nuestros (pausa, sonido,
// cerrar). Escape / Atrás lo cierra y el foco vuelve al botón que lo abrió.

const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])
const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

interface Props {
  ytId: string
  /** Para el lector de pantalla y la barra de abajo ("Tráiler · Dune"). */
  title: string
  /** Qué video es ("Tráiler", "Detrás de escena"…). */
  kind?: string
  /** Imagen mientras carga. */
  backdrop?: string
  onClose: () => void
}

export function TrailerPlayer({ ytId, title, kind = 'Tráiler', backdrop, onClose }: Props) {
  const yt = useYtPlayer(false)
  const layer = useRef<HTMLDivElement>(null)
  const playBtn = useRef<HTMLButtonElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const ytRef = useRef(yt)
  ytRef.current = yt

  useEffect(() => {
    // Quién lo abrió: al cerrar, el foco vuelve ahí (si no, queda en <body> y la próxima flecha se pierde).
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    const body = document.body
    const prevOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    playBtn.current?.focus({ preventScroll: true })

    const onKey = (e: KeyboardEvent) => {
      if (BACK_KEYS.has(e.key)) {
        // Antes que la navegación espacial, que lo tomaría como "volver a la página anterior".
        e.preventDefault()
        e.stopPropagation()
        closeRef.current()
      } else if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        ytRef.current.setMuted(!ytRef.current.muted)
      } else if ((e.key === 'k' || e.key === 'K' || e.key === 'MediaPlayPause') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        e.stopPropagation()
        const p = ytRef.current
        if (p.playing) p.pause()
        else p.play()
      }
    }
    const onVis = () => document.visibilityState === 'hidden' && ytRef.current.pause()
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('visibilitychange', onVis)
      root?.removeAttribute('inert')
      body.style.overflow = prevOverflow
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [])

  // Terminó: se cierra solo, como en Netflix.
  useEffect(() => {
    if (yt.ended) closeRef.current()
  }, [yt.ended])

  // Tab y Shift+Tab dan la vuelta dentro (las flechas ya se quedan por data-nav-scope).
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab') return
    const els = Array.from(layer.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    if (els.length === 0) return
    const i = els.indexOf(document.activeElement as HTMLElement)
    if (e.shiftKey && i <= 0) {
      e.preventDefault()
      els[els.length - 1].focus()
    } else if (!e.shiftKey && i === els.length - 1) {
      e.preventDefault()
      els[0].focus()
    }
  }

  const togglePlay = () => (yt.playing ? yt.pause() : yt.play())
  const origin = typeof location !== 'undefined' ? location.origin : undefined
  const label = `${kind} de ${title}`

  return createPortal(
    <div
      ref={layer}
      className="tp-layer"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-nav-scope
      data-no-screensaver
      onKeyDown={onKeyDown}
    >
      <div className="tp-video" style={backdrop ? { backgroundImage: `url(${backdrop})` } : undefined}>
        <iframe
          ref={yt.frame}
          className={yt.ready ? 'ready' : undefined}
          src={embedTrailerUrl(ytId, { origin })}
          title={label}
          tabIndex={-1}
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={yt.onLoad}
        />
        {/* El iframe no recibe clics (si no, se queda con el teclado y Escape no llega): un toque pausa. */}
        <div className="tp-hit" onClick={togglePlay} aria-hidden />
        {!yt.ready && (
          <span className="tp-loading" role="status">
            Cargando tráiler…
          </span>
        )}
      </div>
      <div className="tp-bar">
        <div className="tp-heading">
          <span className="tp-kind">{kind}</span>
          <strong className="tp-title">{title}</strong>
        </div>
        <div className="tp-controls">
          <button ref={playBtn} type="button" className="tp-btn" onClick={togglePlay} aria-label={yt.playing ? 'Pausar (K)' : 'Reproducir (K)'}>
            <DetailIcon name={yt.playing ? 'pause' : 'play'} />
          </button>
          <button
            type="button"
            className="tp-btn"
            onClick={() => yt.setMuted(!yt.muted)}
            aria-label={yt.muted ? 'Activar sonido (M)' : 'Silenciar (M)'}
            aria-pressed={!yt.muted}
          >
            <DetailIcon name={yt.muted ? 'soundOff' : 'soundOn'} />
            <span className="tp-btn-text">{yt.muted ? 'Activar sonido' : 'Sonido'}</span>
          </button>
          <button type="button" className="tp-btn tp-close" onClick={onClose} aria-label="Cerrar el tráiler (Atrás)">
            <DetailIcon name="close" />
            <span className="tp-btn-text">Cerrar</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
