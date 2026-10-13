import type Hls from 'hls.js'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { formatTime, isHls } from '../../lib/format'

// Miniatura al pasar el mouse por la barra: un segundo <video> silenciado con la misma fuente
// (sin canvas, así no hay problemas de CORS). Se crea al primer hover y se destruye al salir.

const SEEK_DEBOUNCE_MS = 150
const DESTROY_AFTER_MS = 2500
/** Ancho del cuadro (en CSS); para que no se salga de la pantalla en los bordes. */
const BOX_W = 192
/** El pulgar del range ocupa 16 px: el valor 0 está en su centro, no en el borde. */
const THUMB = 16

interface Props {
  bar: RefObject<HTMLInputElement | null>
  url: string
  duration: number
  /** Con false se muestra solo el tiempo. */
  enabled: boolean
}

export function SeekPreview({ bar, url, duration, enabled }: Props) {
  const [hover, setHover] = useState<{ t: number; left: number; top: number }>()
  const [alive, setAlive] = useState(false)
  const [failed, setFailed] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const durationRef = useRef(duration)
  durationRef.current = duration

  // Solo mouse o lápiz: en pantallas táctiles el dedo tapa la barra.
  useEffect(() => {
    const el = bar.current
    if (!el) return
    let destroy: ReturnType<typeof setTimeout> | undefined
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || !(durationRef.current > 0)) return
      const rect = el.getBoundingClientRect()
      const frac = Math.min(1, Math.max(0, (e.clientX - rect.left - THUMB / 2) / (rect.width - THUMB)))
      const parent = el.offsetParent as HTMLElement | null
      const width = parent?.clientWidth ?? window.innerWidth
      const x = el.offsetLeft + THUMB / 2 + frac * (rect.width - THUMB)
      setHover({ t: frac * durationRef.current, left: Math.min(width - BOX_W / 2 - 4, Math.max(BOX_W / 2 + 4, x)), top: el.offsetTop })
      clearTimeout(destroy)
      setAlive(true)
    }
    const onLeave = () => {
      setHover(undefined)
      clearTimeout(destroy)
      destroy = setTimeout(() => setAlive(false), DESTROY_AFTER_MS)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      clearTimeout(destroy)
    }
  }, [bar])

  useEffect(() => setFailed(false), [url])

  const withVideo = enabled && alive && !failed

  // Carga del video de la vista previa: lo mínimo (metadata) y, en HLS, la calidad más baja.
  useEffect(() => {
    const el = videoRef.current
    if (!withVideo || !el) return
    let disposed = false
    let hls: Hls | null = null
    if (isHls(url) && !el.canPlayType('application/vnd.apple.mpegurl')) {
      import('hls.js')
        .then(({ default: HlsLib }) => {
          if (disposed) return
          if (!HlsLib.isSupported()) return setFailed(true)
          hls = new HlsLib({
            enableWorker: false,
            startLevel: 0,
            capLevelToPlayerSize: true,
            maxBufferLength: 2,
            maxMaxBufferLength: 4,
            backBufferLength: 0,
            startFragPrefetch: false,
          })
          hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
            if (hls) hls.autoLevelCapping = 0
          })
          hls.on(HlsLib.Events.ERROR, (_e, data) => {
            if (data.fatal) setFailed(true)
          })
          hls.loadSource(url)
          hls.attachMedia(el)
        })
        .catch(() => setFailed(true))
    } else {
      el.src = url
    }
    return () => {
      disposed = true
      hls?.destroy()
      // Corta la descarga en curso.
      el.removeAttribute('src')
      el.load()
    }
  }, [withVideo, url])

  // Busca el cuadro con un poco de demora y de a un pedido por vez (el último gana).
  const target = hover?.t
  useEffect(() => {
    const el = videoRef.current
    if (!withVideo || !el || target === undefined) return
    const t = setTimeout(() => {
      const go = () => {
        if (el.seeking) return
        if (Math.abs(el.currentTime - target) > 0.5) el.currentTime = target
      }
      if (el.readyState >= 1) go()
      el.onloadedmetadata = go
      el.onseeked = go
    }, SEEK_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [target, withVideo])

  if (!hover && !withVideo) return null
  return (
    <div
      className={`seek-preview ${hover ? 'visible' : ''} ${withVideo ? 'with-video' : ''}`}
      style={hover ? { left: hover.left, top: hover.top } : undefined}
      aria-hidden="true"
    >
      {withVideo && (
        <video
          ref={videoRef}
          className="seek-preview-video"
          muted
          playsInline
          preload="metadata"
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          onError={() => setFailed(true)}
        />
      )}
      <span className="seek-preview-time">{formatTime(hover?.t ?? 0)}</span>
    </div>
  )
}
