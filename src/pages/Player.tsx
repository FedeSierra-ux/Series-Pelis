import type Hls from 'hls.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { getMeta, getStreams, getSubtitles } from '../lib/addons'
import { episodeLabel, formatTime, isHls } from '../lib/format'
import { useAddons, useTitle } from '../lib/hooks'
import { langLabel } from '../lib/i18n'
import { addonsStore, progressStore, saveProgress, settingsStore, useStore } from '../lib/store'
import { loadSubtitle } from '../lib/subtitles'
import type { Meta, Subtitle } from '../lib/types'
import type { PlayState } from './Detail'

const SAVE_EVERY_MS = 5000
const HIDE_CONTROLS_MS = 3500
const SEEK_STEP = 10

/** Busca en el siguiente episodio un stream del mismo addon y "bingeGroup" (misma calidad/fuente). */
async function findNextStream(state: PlayState): Promise<PlayState | undefined> {
  if (!state.nextVideoId || !state.video) return undefined
  const group = state.stream.behaviorHints?.bingeGroup
  if (!group) return undefined
  const addons = addonsStore.get()
  const meta: Meta = await getMeta(addons, state.meta.type, state.meta.id)
  const nextVideo = meta.videos?.find((v) => v.id === state.nextVideoId)
  if (!nextVideo) return undefined
  const sorted = [...(meta.videos ?? [])].sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0))
  const afterNext = sorted[sorted.findIndex((v) => v.id === nextVideo.id) + 1]

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cancel()
      resolve(undefined)
    }, 15000)
    const cancel = getStreams(addons, state.meta.type, nextVideo.id, (groups) => {
      for (const g of groups) {
        const s = g.streams.find((x) => x.behaviorHints?.bingeGroup === group && x.url)
        if (s?.url) {
          clearTimeout(timer)
          cancel()
          resolve({
            ...state,
            stream: s,
            playUrl: s.url,
            video: { id: nextVideo.id, season: nextVideo.season, episode: nextVideo.episode, title: nextVideo.title, name: nextVideo.name },
            nextVideoId: afterNext?.id,
          })
          return
        }
      }
      if (groups.every((g) => !g.loading)) {
        clearTimeout(timer)
        resolve(undefined)
      }
    })
  })
}

function externalPlayerUrl(url: string) {
  // En Android/Fire TV abre el selector de reproductores (VLC, MX Player, Just Player...).
  if (/android/i.test(navigator.userAgent)) {
    const noScheme = url.replace(/^https?:\/\//, '')
    const scheme = url.startsWith('https') ? 'https' : 'http'
    return `intent://${noScheme}#Intent;scheme=${scheme};type=video/*;end`
  }
  return undefined
}

export function Player() {
  const location = useLocation()
  const state = location.state as PlayState | undefined
  if (!state?.playUrl) return <Navigate to="/" replace />
  // La key reinicia el reproductor completo al pasar al siguiente episodio.
  return <PlayerView key={state.playUrl} state={state} />
}

function PlayerView({ state }: { state: PlayState }) {
  const navigate = useNavigate()
  const addons = useAddons()
  const settings = useStore(settingsStore)
  const videoRef = useRef<HTMLVideoElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const playBtnRef = useRef<HTMLButtonElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(true)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [controls, setControls] = useState(true)
  const [error, setError] = useState<string>()
  const [resumedFrom, setResumedFrom] = useState<number>()
  const [subs, setSubs] = useState<Subtitle[]>(state.stream.subtitles ?? [])
  const [activeSub, setActiveSub] = useState<string>('')
  const [menu, setMenu] = useState<'subs' | 'audio' | null>(null)
  const [audioTracks, setAudioTracks] = useState<{ id: number; name: string }[]>([])
  const [audioTrack, setAudioTrack] = useState(-1)
  const [nextLoading, setNextLoading] = useState(false)

  const { meta, video } = state
  const videoId = video?.id ?? meta.id
  useTitle(video ? `${meta.name} ${episodeLabel(video.season, video.episode)}` : meta.name)

  // ---------- Carga del video ----------
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const url = state.playUrl
    let disposed = false

    const start = () => el.play().catch(() => setControls(true))

    if (isHls(url) && !el.canPlayType('application/vnd.apple.mpegurl')) {
      // hls.js pesa bastante: solo se descarga si el stream es HLS (los de debrid suelen ser MP4/MKV directos).
      import('hls.js').then(({ default: HlsLib }) => {
        if (disposed) return
        if (!HlsLib.isSupported()) {
          setError('Este navegador no soporta streams HLS')
          return
        }
        const hls = new HlsLib({ enableWorker: true, startFragPrefetch: true })
        hlsRef.current = hls
        hls.loadSource(url)
        hls.attachMedia(el)
        hls.on(HlsLib.Events.AUDIO_TRACKS_UPDATED, (_e, data) => {
          setAudioTracks(data.audioTracks.map((t, i) => ({ id: i, name: t.name || langLabel(t.lang ?? '') || `Pista ${i + 1}` })))
          setAudioTrack(hls.audioTrack)
        })
        hls.on(HlsLib.Events.ERROR, (_e, data) => {
          if (data.fatal) setError(`Error de reproducción (${data.details})`)
        })
        start()
      })
    } else {
      el.src = url
      start()
    }
    return () => {
      disposed = true
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [state.playUrl])

  // Subtítulos de los addons de subtítulos (OpenSubtitles, etc.).
  useEffect(() => {
    let alive = true
    getSubtitles(addons, meta.type, videoId).then((found) => {
      if (!alive || found.length === 0) return
      setSubs((prev) => {
        const seen = new Set(prev.map((s) => s.url))
        return [...prev, ...found.filter((s) => !seen.has(s.url))]
      })
    })
    return () => {
      alive = false
    }
  }, [addons, meta.type, videoId])

  // ---------- Progreso ----------
  const persist = useCallback(() => {
    const el = videoRef.current
    if (!el || !Number.isFinite(el.duration) || el.duration === 0 || el.currentTime < 5) return
    saveProgress({
      videoId,
      metaId: meta.id,
      type: meta.type,
      name: meta.name,
      poster: meta.poster,
      background: meta.background,
      season: video?.season,
      episode: video?.episode,
      episodeTitle: video?.title ?? video?.name,
      position: el.currentTime,
      duration: el.duration,
    })
  }, [videoId, meta, video])

  useEffect(() => {
    const t = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) persist()
    }, SAVE_EVERY_MS)
    const onHide = () => persist()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      clearInterval(t)
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
      persist()
    }
  }, [persist])

  const onLoadedMetadata = () => {
    const el = videoRef.current
    if (!el) return
    setDuration(el.duration)
    const saved = progressStore.get()[videoId]
    if (saved && !saved.watched && saved.position > 30 && saved.position < el.duration - 30) {
      el.currentTime = saved.position
      setResumedFrom(saved.position)
      setTimeout(() => setResumedFrom(undefined), 8000)
    }
  }

  // ---------- Controles ----------
  const showControls = useCallback(() => {
    setControls(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControls(false)
        setMenu(null)
      }
    }, HIDE_CONTROLS_MS)
  }, [])

  const togglePlay = () => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) el.play().catch(() => {})
    else el.pause()
    showControls()
  }

  const seek = (delta: number) => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + delta))
    showControls()
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else rootRef.current?.requestFullscreen().catch(() => {})
  }

  const exit = useCallback(() => {
    persist()
    if (window.history.length > 1) navigate(-1)
    else navigate(`/detail/${meta.type}/${encodeURIComponent(meta.id)}`, { replace: true })
  }, [persist, navigate, meta.type, meta.id])

  const goNext = async () => {
    if (!state.nextVideoId) return
    persist()
    setNextLoading(true)
    const next = settings.autoplayNext ? await findNextStream(state).catch(() => undefined) : undefined
    setNextLoading(false)
    if (next) navigate(`/watch/${meta.type}/${encodeURIComponent(next.video!.id)}`, { state: next, replace: true })
    else
      navigate(
        `/detail/${meta.type}/${encodeURIComponent(meta.id)}?season=${state.video?.season ?? 1}&video=${encodeURIComponent(state.nextVideoId)}`,
        { replace: true },
      )
  }

  const selectSub = async (url: string) => {
    const el = videoRef.current
    setMenu(null)
    setActiveSub(url)
    if (!el) return
    Array.from(el.querySelectorAll('track')).forEach((t) => t.remove())
    for (const t of Array.from(el.textTracks)) t.mode = 'disabled'
    if (!url) return
    try {
      const src = await loadSubtitle(url)
      const track = document.createElement('track')
      track.kind = 'subtitles'
      track.src = src
      track.default = true
      el.appendChild(track)
      track.track.mode = 'showing'
    } catch {
      setActiveSub('')
      setError('No se pudo cargar ese subtítulo')
      setTimeout(() => setError(undefined), 4000)
    }
  }

  const selectAudio = (id: number) => {
    if (hlsRef.current) hlsRef.current.audioTrack = id
    setAudioTrack(id)
    setMenu(null)
  }

  // Teclado y control remoto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const focusedControl = (document.activeElement as HTMLElement | null)?.closest('.player-controls button, .player-menu button')
      switch (e.key) {
        case 'Escape':
        case 'GoBack':
        case 'BrowserBack':
        case 'Backspace':
          e.preventDefault()
          if (menu) setMenu(null)
          else exit()
          return
        case ' ':
        case 'k':
        case 'MediaPlayPause':
          e.preventDefault()
          togglePlay()
          return
        case 'Enter':
          if (!controls || !focusedControl) {
            e.preventDefault()
            if (!controls) showControls()
            else togglePlay()
          }
          return
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (controls && focusedControl) {
            // Con los controles visibles las flechas recorren los botones.
            e.preventDefault()
            const buttons = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('.player-menu button, .player-controls button') ?? [])
            const i = buttons.indexOf(focusedControl as HTMLButtonElement)
            const next = buttons[i + (e.key === 'ArrowRight' ? 1 : -1)]
            next?.focus()
            showControls()
            return
          }
          e.preventDefault()
          seek(e.key === 'ArrowRight' ? SEEK_STEP : -SEEK_STEP)
          return
        }
        case 'MediaFastForward':
          seek(SEEK_STEP * 3)
          return
        case 'MediaRewind':
          seek(-SEEK_STEP * 3)
          return
        case 'ArrowUp':
        case 'ArrowDown':
          e.preventDefault()
          showControls()
          if (!focusedControl) playBtnRef.current?.focus()
          return
        case 'f':
          toggleFullscreen()
          return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    showControls()
    return () => clearTimeout(hideTimer.current)
  }, [showControls])

  const sortedSubs = [...subs].sort((a, b) => {
    const ia = settings.subtitleLangs.indexOf(a.lang)
    const ib = settings.subtitleLangs.indexOf(b.lang)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  const external = externalPlayerUrl(state.playUrl)

  return (
    <div
      ref={rootRef}
      className={`player ${controls ? 'show-controls' : ''}`}
      data-nav-disabled
      onMouseMove={showControls}
      onTouchStart={showControls}
    >
      <video
        ref={videoRef}
        className="player-video"
        playsInline
        autoPlay
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false)
          setControls(true)
          persist()
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={() => {
          persist()
          if (state.nextVideoId && settings.autoplayNext) goNext()
        }}
        onError={() =>
          setError(
            state.stream.behaviorHints?.notWebReady
              ? 'El navegador no puede reproducir este formato (MKV/HEVC). Probá otro stream o abrilo en un reproductor externo.'
              : 'No se pudo reproducir este stream. Puede haber expirado o no ser compatible con el navegador.',
          )
        }
      />

      {buffering && !error && <div className="player-spinner" aria-label="Cargando" />}

      {resumedFrom !== undefined && (
        <div className="player-toast">
          Continuando desde {formatTime(resumedFrom)}
          <button
            className="btn btn-small"
            onClick={() => {
              if (videoRef.current) videoRef.current.currentTime = 0
              setResumedFrom(undefined)
            }}
          >
            Empezar de nuevo
          </button>
        </div>
      )}

      {error && (
        <div className="player-error" role="alert">
          <p>{error}</p>
          <div className="hero-actions">
            <button className="btn" onClick={exit} autoFocus>
              Volver
            </button>
            {external && (
              <a className="btn" href={external}>
                Abrir en otro reproductor
              </a>
            )}
            <button className="btn" onClick={() => navigator.clipboard?.writeText(state.playUrl)}>
              Copiar enlace
            </button>
          </div>
        </div>
      )}

      <div className="player-top">
        <button className="btn btn-ghost" onClick={exit} aria-label="Volver">
          ←
        </button>
        <div className="player-title">
          <strong>{meta.name}</strong>
          {video && (
            <span>
              {episodeLabel(video.season, video.episode)} · {video.title ?? video.name}
            </span>
          )}
          <span className="muted small">{state.addonName}</span>
        </div>
      </div>

      {menu && (
        <div className="player-menu" role="menu">
          {menu === 'subs' && (
            <>
              <button className={activeSub === '' ? 'active' : ''} onClick={() => selectSub('')}>
                Sin subtítulos
              </button>
              {sortedSubs.map((s, i) => (
                <button key={s.url + i} className={activeSub === s.url ? 'active' : ''} onClick={() => selectSub(s.url)}>
                  {langLabel(s.lang)}
                  {s.id ? <span className="muted small"> · {s.id}</span> : null}
                </button>
              ))}
            </>
          )}
          {menu === 'audio' &&
            audioTracks.map((t) => (
              <button key={t.id} className={audioTrack === t.id ? 'active' : ''} onClick={() => selectAudio(t.id)}>
                {t.name}
              </button>
            ))}
        </div>
      )}

      <div className="player-controls">
        <input
          className="seekbar"
          type="range"
          min={0}
          max={duration || 0}
          step={1}
          value={time}
          aria-label="Posición"
          tabIndex={-1}
          onChange={(e) => {
            if (videoRef.current) videoRef.current.currentTime = Number(e.target.value)
            showControls()
          }}
          style={{ ['--pct' as string]: duration ? `${(time / duration) * 100}%` : '0%' }}
        />
        <div className="controls-row">
          <button onClick={() => seek(-SEEK_STEP)} aria-label="Retroceder 10 segundos">
            ⟲10
          </button>
          <button ref={playBtnRef} onClick={togglePlay} aria-label={playing ? 'Pausa' : 'Reproducir'} className="play-btn">
            {playing ? '❚❚' : '▶'}
          </button>
          <button onClick={() => seek(SEEK_STEP)} aria-label="Adelantar 10 segundos">
            10⟳
          </button>
          <span className="time">
            {formatTime(time)} / {formatTime(duration)}
          </span>
          <span className="spacer" />
          {subs.length > 0 && (
            <button onClick={() => setMenu(menu === 'subs' ? null : 'subs')} aria-label="Subtítulos">
              CC
            </button>
          )}
          {audioTracks.length > 1 && (
            <button onClick={() => setMenu(menu === 'audio' ? null : 'audio')} aria-label="Idioma de audio">
              Audio
            </button>
          )}
          {state.nextVideoId && (
            <button onClick={goNext} disabled={nextLoading} aria-label="Siguiente episodio">
              {nextLoading ? '…' : '⏭ Siguiente'}
            </button>
          )}
          <button onClick={toggleFullscreen} aria-label="Pantalla completa">
            ⛶
          </button>
        </div>
      </div>
    </div>
  )
}
