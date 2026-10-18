import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type Hls from 'hls.js'
import { Empty } from '../components/Status'
import { useTitle } from '../lib/hooks'
import {
  LIVE_CATEGORIES,
  LIVE_CHANNELS,
  channelInitials,
  loadChannelHealth,
  probeChannels,
  saveChannelHealth,
  setLastChannel,
  stepChannel,
  toggleLiveFavorite,
  watchable,
  youtubeLiveUrl,
  type ChannelHealth,
  type LiveCategory,
  type LiveChannel,
} from '../lib/liveTv'
import { liveTvStore, useStore } from '../lib/store'
import { useYtPlayer } from './detail/useYtPlayer'

type Filter = 'all' | 'fav' | LiveCategory

const CATEGORY_LABEL = Object.fromEntries(LIVE_CATEGORIES.map((c) => [c.id, c.label])) as Record<LiveCategory, string>
const PREV_KEYS = new Set(['ChannelUp', 'PageUp'])
const NEXT_KEYS = new Set(['ChannelDown', 'PageDown'])
/** Si en este tiempo no arrancó, damos el canal por caído. */
const STALL_MS = 20000

const pad = (n: number) => String(n).padStart(3, '0')

function channelNote(c: LiveChannel, health?: ChannelHealth) {
  if (health === 'blocked') return 'No se puede ver en el navegador'
  if (health === 'down') return 'Sin señal ahora'
  if (c.notAlways) return 'No siempre en vivo'
  return [CATEGORY_LABEL[c.category], c.youtube ? 'YouTube' : c.quality].filter(Boolean).join(' · ')
}

function isTyping() {
  const el = document.activeElement
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
}

function ChannelLogo({ channel }: { channel: LiveChannel }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className={`ltv-logo ltv-cat-${channel.category}`} aria-hidden>
      {channel.logo && !failed ? (
        <img src={channel.logo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        channelInitials(channel.name)
      )}
    </span>
  )
}

/**
 * Un canal que se ve por su transmisión oficial de YouTube. Va sin eventos del mouse: así el foco y las
 * teclas (CH+/CH−, números) se quedan en la página y no los toma el iframe.
 */
function YoutubeLive({ channel, muted, onPlaying, onMuted }: { channel: LiveChannel; muted: boolean; onPlaying: () => void; onMuted: (m: boolean) => void }) {
  const yt = useYtPlayer(muted)
  // La URL se arma una sola vez por canal: el sonido después se cambia por postMessage.
  const [src] = useState(() => youtubeLiveUrl(channel.youtube!, { muted, origin: location.origin }))
  const { playing, setMuted } = yt
  useEffect(() => {
    if (playing) onPlaying()
  }, [playing, onPlaying])
  useEffect(() => {
    if (yt.muted !== muted) setMuted(muted)
    // Solo cuando lo cambia el usuario; si YouTube se silencia solo (autoplay), lo avisa el efecto de abajo.
  }, [muted])
  useEffect(() => {
    onMuted(yt.muted)
  }, [yt.muted, onMuted])
  return (
    <iframe
      ref={yt.frame}
      className="ltv-yt"
      src={src}
      title={`${channel.name} en vivo`}
      allow="autoplay; encrypted-media; picture-in-picture"
      tabIndex={-1}
      onLoad={yt.onLoad}
    />
  )
}

export function LiveTv() {
  useTitle('TV en vivo')
  const { favorites, last } = useStore(liveTvStore)
  const channels = LIVE_CHANNELS
  const [filter, setFilter] = useState<Filter>('all')
  const [currentId, setCurrentId] = useState<string | undefined>(last)
  const [status, setStatus] = useState<'loading' | 'playing' | 'error'>('loading')
  const [muted, setMuted] = useState(false)
  const [digits, setDigits] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const [retry, setRetry] = useState(0)
  // Con HLS nativo (Safari, Fire TV) el video no pide CORS: no hace falta probar los canales.
  const nativeHls = useMemo(() => document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== '', [])
  const [health, setHealth] = useState<Record<string, ChannelHealth>>(() => (nativeHls ? {} : loadChannelHealth()))
  const isBad = useCallback((c: LiveChannel) => health[c.id] === 'blocked' || health[c.id] === 'down', [health])
  const markHealth = useCallback((results: Record<string, ChannelHealth>) => {
    setHealth((h) => ({ ...h, ...results }))
    saveChannelHealth(results)
  }, [])

  // En segundo plano: qué canales no se pueden reproducir en este navegador (ver lib/liveTv.ts).
  useEffect(() => {
    if (nativeHls) return
    const known = loadChannelHealth()
    const todo = channels.filter((c) => !c.youtube && !known[c.id])
    if (todo.length === 0) return
    const ctrl = new AbortController()
    probeChannels(todo, markHealth, { signal: ctrl.signal }).catch(() => {})
    return () => ctrl.abort()
  }, [channels, nativeHls, markHealth])

  const favSet = useMemo(() => new Set(favorites), [favorites])
  const visible = useMemo(() => {
    if (filter === 'all') return channels
    if (filter === 'fav') return channels.filter((c) => favSet.has(c.id))
    return channels.filter((c) => c.category === filter)
  }, [channels, filter, favSet])

  const current = channels.find((c) => c.id === currentId)

  // Si el canal lo eligió el usuario (en esta visita) no se cambia solo, aunque no ande.
  const picked = useRef(false)

  // Arranca con el último canal que se vio (o el primero de la lista). Mientras no se elija uno a mano,
  // tampoco se queda en uno que se sabe que no anda: si la prueba lo marca después, pasa al primero que sí.
  useEffect(() => {
    if (picked.current || status === 'playing') return
    const now = channels.find((c) => c.id === currentId)
    const first = watchable(channels, health)[0]
    if ((!now || isBad(now)) && first.id !== currentId) setCurrentId(first.id)
  }, [channels, currentId, health, isBad, status])

  // Solo lo que elige el usuario queda como "último canal" (la sintonía automática no).
  const tune = useCallback((c: LiveChannel | undefined) => {
    if (!c) return
    picked.current = true
    setLastChannel(c.id)
    setCurrentId(c.id)
    setRetry(0)
  }, [])

  const zap = useCallback(
    (step: number) => tune(stepChannel(visible.length ? visible : channels, currentId, step, isBad)),
    [visible, channels, currentId, tune, isBad],
  )

  // Reproducción: HLS con hls.js (o nativo en Safari / Fire TV), cualquier otra cosa directo.
  useEffect(() => {
    const el = videoRef.current
    if (!el || !current || current.youtube) return
    setStatus('loading')
    let cancelled = false
    const fail = () => !cancelled && setStatus('error')
    const stall = setTimeout(fail, STALL_MS)
    const onPlaying = () => {
      clearTimeout(stall)
      setStatus('playing')
      // Si estaba marcado como que no anda (un corte de red al probarlo), se desmarca.
      markHealth({ [current.id]: 'ok' })
    }
    el.addEventListener('playing', onPlaying)
    el.addEventListener('error', fail)

    const start = () => {
      el.play().catch((err: unknown) => {
        // Sin un toque previo los navegadores no dejan arrancar con sonido: arrancamos muteado.
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          el.muted = true
          setMuted(true)
          el.play().catch(() => {})
        }
      })
    }

    const isM3u8 = /\.m3u8(\?|$)/i.test(current.url)
    if (isM3u8 && !el.canPlayType('application/vnd.apple.mpegurl')) {
      import('hls.js').then(({ default: HlsLib }) => {
        if (cancelled) return
        if (!HlsLib.isSupported()) return fail()
        const hls = new HlsLib({ enableWorker: true, lowLatencyMode: true })
        hlsRef.current = hls
        hls.on(HlsLib.Events.ERROR, (_e, data) => {
          if (!data.fatal) return
          // Sin respuesta (código 0) con conexión: el servidor no permite pedirlo desde otro sitio (CORS).
          const code = (data as { response?: { code?: number } }).response?.code
          if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR && code === 0 && navigator.onLine) markHealth({ [current.id]: 'blocked' })
          fail()
        })
        hls.loadSource(current.url)
        hls.attachMedia(el)
        start()
      }, fail)
    } else {
      el.src = current.url
      start()
    }

    return () => {
      cancelled = true
      clearTimeout(stall)
      el.removeEventListener('playing', onPlaying)
      el.removeEventListener('error', fail)
      hlsRef.current?.destroy()
      hlsRef.current = null
      el.removeAttribute('src')
      el.load()
    }
  }, [current, retry, markHealth])

  // YouTube: si en este tiempo no arrancó, el canal no está transmitiendo ahora.
  const ytPlaying = useCallback(() => setStatus('playing'), [])
  useEffect(() => {
    if (!current?.youtube) return
    setStatus('loading')
    const stall = setTimeout(() => setStatus((s) => (s === 'playing' ? s : 'error')), STALL_MS)
    return () => clearTimeout(stall)
  }, [current, retry])

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
      return
    }
    const screen = screenRef.current
    if (screen && typeof screen.requestFullscreen === 'function') {
      screen.requestFullscreen().catch(() => {})
      return
    }
    // iPhone (Safari): un div no tiene requestFullscreen; solo el <video> sabe ir a pantalla completa.
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    video?.webkitEnterFullscreen?.()
  }, [])

  // Control remoto: CH+/CH− cambian de canal siempre; ▲/▼ solo en pantalla completa
  // (si no, mueven el foco por la grilla). Los números llevan directo a un canal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping()) return
      const full = !!document.fullscreenElement
      if (PREV_KEYS.has(e.key) || (full && e.key === 'ArrowUp')) {
        e.preventDefault()
        zap(-1)
      } else if (NEXT_KEYS.has(e.key) || (full && e.key === 'ArrowDown')) {
        e.preventDefault()
        zap(1)
      } else if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        setDigits((d) => (d + e.key).slice(-3))
      } else if (full && (e.key === 'Enter' || e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack')) {
        e.preventDefault()
        document.exitFullscreen().catch(() => {})
      }
    }
    // En captura, para ganarle a la navegación espacial.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [zap])

  useEffect(() => {
    if (!digits) return
    const t = setTimeout(() => {
      tune(channels.find((c) => c.no === Number(digits)))
      setDigits('')
    }, 1200)
    return () => clearTimeout(t)
  }, [digits, channels, tune])

  const counts: Record<Filter, number> = {
    all: channels.length,
    fav: channels.filter((c) => favSet.has(c.id)).length,
    noticias: 0,
    publicos: 0,
    aire: 0,
    musica: 0,
  }
  for (const c of channels) counts[c.category]++
  const filters: { id: Filter; label: string }[] = [
    { id: 'fav', label: '★ Favoritos' },
    { id: 'all', label: 'Todos' },
    ...LIVE_CATEGORIES,
  ]
  const isFav = current ? favSet.has(current.id) : false

  return (
    <div className="page ltv">
      <header className="page-header">
        <h1>TV en vivo</h1>
        <p className="ltv-source">{channels.length} canales de Argentina · señales oficiales de cada canal y sus vivos de YouTube</p>
      </header>

      <div className="ltv-layout">
        <section className="ltv-stage" aria-label="Reproductor">
          <div className="ltv-screen" ref={screenRef}>
            <video ref={videoRef} playsInline autoPlay hidden={!!current?.youtube} onDoubleClick={toggleFullscreen} />
            {current?.youtube && (
              <YoutubeLive key={`${current.id}:${retry}`} channel={current} muted={muted} onPlaying={ytPlaying} onMuted={setMuted} />
            )}
            <span className="ltv-live">
              <i />
              EN VIVO
            </span>
            {status === 'loading' && <div className="player-spinner ltv-spinner" />}
            {status === 'error' && current && (
              <div className="ltv-error" role="alert">
                <p>
                  {health[current.id] === 'blocked'
                    ? 'Este canal no se puede ver desde el navegador: su servidor no lo permite.'
                    : current.youtube
                      ? 'Este canal no está transmitiendo en vivo ahora.'
                      : 'Este canal no responde ahora.'}
                </p>
                <div className="ltv-error-actions">
                  <button className="btn" onClick={() => setRetry((r) => r + 1)}>
                    Probar de nuevo
                  </button>
                  <button className="btn btn-primary" onClick={() => zap(1)}>
                    Siguiente canal
                  </button>
                  {current.youtube && (
                    <a className="btn" href={current.url} target="_blank" rel="noopener noreferrer">
                      Abrir en YouTube
                    </a>
                  )}
                </div>
              </div>
            )}
            {(digits || current) && (
              <div className="ltv-osd">
                <span className="ltv-num">{digits ? digits.padEnd(3, '–') : pad(current!.no)}</span>
                {!digits && current && (
                  <span>
                    <span className="ltv-name">{current.name}</span>
                    <span className="ltv-meta">{channelNote(current, health[current.id])}</span>
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="ltv-controls">
            <button className="btn" onClick={() => zap(-1)} aria-label="Canal anterior">
              ▲ Anterior
            </button>
            <button className="btn" onClick={() => zap(1)} aria-label="Canal siguiente">
              ▼ Siguiente
            </button>
            {current && (
              <button className="btn" aria-pressed={isFav} onClick={() => toggleLiveFavorite(current.id)}>
                {isFav ? '★ En favoritos' : '☆ Favorito'}
              </button>
            )}
            <button className="btn" aria-pressed={muted} onClick={() => setMuted((m) => !m)}>
              {muted ? '🔇 Activar sonido' : '🔊 Silenciar'}
            </button>
            <button className="btn btn-primary" onClick={toggleFullscreen}>
              ⛶ Pantalla completa
            </button>
          </div>
          <p className="ltv-hint">
            Con el control: CH+ / CH− cambian de canal, los números van directo a uno y en pantalla completa también
            sirven ▲ ▼. Los canales marcados “No siempre en vivo” transmiten por YouTube solo en algunos horarios; los
            que este navegador no puede reproducir aparecen atenuados y se saltean al cambiar de canal.
          </p>
        </section>

        <section className="ltv-list" aria-label="Canales">
          <div className="ltv-filters" role="group" aria-label="Filtrar canales">
            {filters.map((f) => (
              <button
                key={f.id}
                className="ltv-filter"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                <span className="ltv-count">{counts[f.id]}</span>
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <Empty>
              {filter === 'fav'
                ? 'Todavía no tenés favoritos. Elegí un canal y tocá “☆ Favorito”, o la estrella de la lista.'
                : 'No hay canales en esta categoría.'}
            </Empty>
          ) : (
            <ul className="ltv-channels">
              {visible.map((c) => (
                <li key={c.id} className={`ltv-row${isBad(c) ? ' is-blocked' : ''}`}>
                  <button
                    className="ltv-ch"
                    aria-current={c.id === currentId ? 'true' : undefined}
                    onClick={() => tune(c)}
                  >
                    <span className="ltv-no">{pad(c.no)}</span>
                    <ChannelLogo channel={c} />
                    <span className="ltv-text">
                      <span className="ltv-ch-name">{c.name}</span>
                      <span className={`ltv-note${c.notAlways || isBad(c) ? ' warn' : ''}`}>{channelNote(c, health[c.id])}</span>
                    </span>
                  </button>
                  <button
                    className="ltv-fav"
                    aria-pressed={favSet.has(c.id)}
                    aria-label={`${favSet.has(c.id) ? 'Sacar de' : 'Agregar a'} favoritos: ${c.name}`}
                    onClick={() => toggleLiveFavorite(c.id)}
                  >
                    {favSet.has(c.id) ? '★' : '☆'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
