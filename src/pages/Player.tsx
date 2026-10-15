import type Hls from 'hls.js'
import { useCallback, useEffect, useRef, useState, type MouseEvent, type WheelEvent } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { PauseCast } from '../components/PauseCast'
import { creditsPlan, endCardAt } from '../lib/credits'
import { saveDataOn } from '../lib/dataSaver'
import { androidIntent, externalLaunch } from '../lib/externalPlayers'
import { episodeLabel, formatTime, isHls } from '../lib/format'
import { useTitle } from '../lib/hooks'
import { langLabel } from '../lib/i18n'
import { isNativeApp } from '../lib/native'
import { nativePlayerAvailable, probeNativePlayer } from '../lib/nativePlayer'
import { findNextStream, nextEpisodeSeason, prefetchNextStreams } from '../lib/nextEpisode'
import { setReturnVideo } from '../lib/returnVideo'
import { currentPlatform } from '../lib/platform'
import { getSegments, imdbIdOf, type Segment, type Segments } from '../lib/segments'
import { progressStore, rememberTracks, RESUME_MIN_S, saveProgress, settingsStore, trackPrefsStore, useStore } from '../lib/store'
import { audioPrefs, guessAudioLang, lang3, langRank, subtitleClasses } from '../lib/subtitlePrefs'
import { useTvMode } from '../lib/tv'
import type { PlayState } from './Detail'
import './player/player-fixes.css'
import './player/player-extras.css'
import { CreditsNotice } from './player/CreditsNotice'
import { RateAtEnd } from './player/RateAtEnd'
import { daysAway, RECAP_AFTER_DAYS, RecapOffer } from './player/RecapOffer'
import { SeekPreview } from './player/SeekPreview'
import { SourcesMenu, useSwitchSource, type Resume, type SwitchState } from './player/SourcesMenu'
import { ReportButton } from '../components/ReportButton'
import { PlayerIcon } from './player/PlayerIcons'
import { formatRate, readRate, SpeedMenu, stepRate, storeRate, type Rate } from './player/SpeedMenu'
import { SubtitleMenu } from './player/SubtitleMenu'
import { useMediaSession, usePictureInPicture, useWakeLock } from './player/useMediaSession'
import { useSubtitles } from './player/useSubtitles'
import { launchUrl } from './player/externalLaunch'
import { NativePlayerView } from './player/NativePlayer'
import { MIN_HISTORY_EPISODE_S, MIN_HISTORY_S, NEXT_FALLBACK_S, readAutoCount, writeAutoCount } from './player/autoNext'
import { detailPathFor } from './player/fallback'
import { isPhoneLike, toggleFullscreen as toggleScreen, usePlayerScreen } from './player/fullscreen'
import { NextCard } from './player/NextCard'
import { PostPlay, type PostPlayPick } from './player/PostPlay'
import { QuickSettings, quickSettingsArrow } from './player/QuickSettings'
import { END_FALLBACK_S } from './player/RateAtEnd'
import { isHold, scrubDelta, scrubKey, startScrub, type Dir, type LastPress, type Scrub } from './player/scrub'
import { useTouchGestures } from './player/useTouchGestures'
import { FIT_HINTS, FIT_LABELS, nextFit, readFit, storeFit, type VideoFit } from './player/videoFit'
import { useVolume, VolumeControl } from './player/VolumeControl'
import { wheelVolumeDelta } from './player/volume'
import './player/player-v14.css'

const SAVE_EVERY_MS = 5000
const HIDE_CONTROLS_MS = 3500
const SEEK_STEP = 10
const NEXT_COUNTDOWN_S = 10
/** Errores de red de HLS: cuántas veces se reintenta antes de mostrar el error. */
const HLS_NETWORK_RETRIES = 2
const HLS_RETRY_MS = 1000
const SLEEP_KEY = 'sp-sleep-at'
const VOLUME_STEP = 0.1

type Menu = 'subs' | 'audio' | 'sleep' | 'sources' | 'speed' | 'quick'
type Sleep = { kind: 'off' } | { kind: 'time'; at: number } | { kind: 'episode' }

// sessionStorage puede estar bloqueado (modo privado en algunos navegadores de TV).
function sessionGet(key: string) {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}
function sessionSet(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // sin persistencia, no pasa nada
  }
}

const isAndroid = () => /android/i.test(navigator.userAgent)
/** Freno de la rueda del mouse: un touchpad manda decenas de eventos por gesto. */
const WHEEL_THROTTLE_MS = 70
/** Cuánto dura la onda "+10 s" del doble toque. */
const RIPPLE_MS = 650
/** Cuánto se ve el botón "Desbloquear" después de tocar la pantalla bloqueada. */
const UNLOCK_HINT_MS = 3000

function externalPlayerUrl(url: string) {
  // En Android/Fire TV abre el selector de reproductores (VLC, MX Player, Just Player...).
  return isAndroid() ? androidIntent(url) : undefined
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Sin HTTPS (la TV en la red local) no hay API de portapapeles: vamos por el método viejo.
  }
  const prev = document.activeElement as HTMLElement | null
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  ;(document.fullscreenElement ?? document.body).appendChild(ta)
  ta.select()
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  ta.remove()
  prev?.focus()
  return ok
}

export function Player() {
  const location = useLocation()
  const params = useParams()
  const { resume, ...state } = (location.state ?? {}) as SwitchState
  // Sin el stream (se recargó la página o se abrió el enlace directo): a la ficha, con el episodio elegido.
  if (!state.playUrl) return <Navigate to={detailPathFor(params.type ?? 'movie', params.id ?? '', progressStore.get())} replace />
  // La key reinicia el reproductor completo al pasar al siguiente episodio (o al cambiar de fuente).
  return <PlayerChoice key={state.playUrl} state={state} resume={resume} />
}

/** En la app de Android TV (v0.20) reproduce Android, si el APK lo trae y no se apagó en Ajustes. */
function PlayerChoice({ state, resume }: { state: PlayState; resume?: Resume }) {
  const [native, setNative] = useState(() => (settingsStore.get().nativePlayer && isNativeApp() ? nativePlayerAvailable() : false))
  const [fallback, setFallback] = useState<Resume>()
  useEffect(() => {
    if (native !== undefined) return
    let alive = true
    probeNativePlayer().then((ok) => {
      if (alive) setNative(ok)
    })
    return () => {
      alive = false
    }
  }, [native])
  if (native === undefined) return <div className="player player-native" />
  if (native && !fallback) return <NativePlayerView state={state} resume={resume} onFallback={(at) => setFallback({ at })} />
  return (
    <PlayerView
      state={state}
      resume={fallback ?? resume}
      notice={fallback ? 'El reproductor de Android no pudo con este video: sigue el de la web' : undefined}
    />
  )
}

function PlayerView({ state, resume, notice }: { state: PlayState; resume?: Resume; notice?: string }) {
  const navigate = useNavigate()
  const settings = useStore(settingsStore)
  const videoRef = useRef<HTMLVideoElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const playBtnRef = useRef<HTMLButtonElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  /** Identifica la corrida actual del efecto de carga (ver la limpieza de ese efecto). */
  const attachToken = useRef<object | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const menuOpener = useRef<HTMLElement | null>(null)
  const advancing = useRef(false)
  const userPickedAudio = useRef(false)
  const autoSkipped = useRef(new Set<string>())
  const seekbarRef = useRef<HTMLInputElement>(null)
  const switchSource = useSwitchSource(state)
  const tvMode = useTvMode()
  // Buscar el siguiente episodio puede tardar varios segundos: si mientras tanto el usuario salió, no se navega.
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(true)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [controls, setControls] = useState(true)
  const [error, setError] = useState<string>()
  // Con error, los controles se ocultan: la lista de fuentes se abre dentro de la tarjeta.
  const [errorSources, setErrorSources] = useState(false)
  const [toast, setToast] = useState<string>()
  const [resumedFrom, setResumedFrom] = useState<number>()
  const [menu, setMenu] = useState<Menu | null>(null)
  const [audioTracks, setAudioTracks] = useState<{ id: number; name: string; lang?: string }[]>([])
  const [audioTrack, setAudioTrack] = useState(-1)
  const [nextLoading, setNextLoading] = useState(false)
  const [segments, setSegments] = useState<Segments | null>(null)
  const [nextDismissed, setNextDismissed] = useState(false)
  const [countdown, setCountdown] = useState(NEXT_COUNTDOWN_S)
  const [sleep, setSleep] = useState<Sleep>(() => {
    const at = Number(sessionGet(SLEEP_KEY))
    return at > Date.now() ? { kind: 'time', at } : { kind: 'off' }
  })
  const [sleepFired, setSleepFired] = useState(false)
  // Velocidad de reproducción: se recuerda mientras dure la sesión (pasa al siguiente episodio), no más.
  const [rate, setRate] = useState<Rate>(readRate)
  const rateRef = useRef(rate)
  rateRef.current = rate
  // Último subtítulo activo, para que la tecla C lo vuelva a prender.
  const lastSub = useRef<string>('')
  // Después de N episodios seguidos sin tocar nada, el siguiente arranca en pausa y pregunta.
  const [askStill, setAskStill] = useState(() => settings.stillWatchingAfter > 0 && readAutoCount() >= settings.stillWatchingAfter)
  const askStillRef = useRef(askStill)

  // Ajustar / llenar / estirar (F17): se recuerda por dispositivo.
  const [fit, setFitState] = useState<VideoFit>(readFit)
  const fitRef = useRef(fit)
  fitRef.current = fit
  const setFit = (next: VideoFit, announce = true) => {
    setFitState(next)
    storeFit(next)
    if (announce) flash(`Imagen: ${FIT_LABELS[next]}`)
  }

  // Celular: pantalla completa y horizontal al entrar (U34); gestos y bloqueo de pantalla (U35).
  const [phone] = useState(() => !tvMode && isPhoneLike())
  const [touch] = useState(() => {
    try {
      return !tvMode && matchMedia('(pointer: coarse)').matches
    } catch {
      return false
    }
  })
  usePlayerScreen(phone)
  const [locked, setLocked] = useState(false)
  const [unlockHint, setUnlockHint] = useState(false)
  const unlockTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [ripple, setRipple] = useState<{ zone: 'left' | 'right'; seconds: number; key: number }>()
  const rippleTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(
    () => () => {
      clearTimeout(unlockTimer.current)
      clearTimeout(rippleTimer.current)
    },
    [],
  )
  /** Con qué se tocó por última vez (mouse, touch, pen): el clic del mouse pausa, el toque no. */
  const lastPointer = useRef('mouse')
  const lastWheel = useRef(0)

  // Adelantar manteniendo ← / → (U24).
  const [scrub, setScrubState] = useState<Scrub>()
  const scrubRef = useRef<Scrub | undefined>(undefined)
  const setScrub = (next: Scrub | undefined) => {
    scrubRef.current = next
    setScrubState(next)
  }
  const lastPress = useRef<LastPress | undefined>(undefined)
  /** Dónde estaba antes de la primera flecha de la tanda (Atrás vuelve acá). */
  const pressOrigin = useRef(0)

  // "Más como esto" al final de una peli (F5).
  const [postPlayClosed, setPostPlayClosed] = useState(false)

  const volume = useVolume(videoRef)

  const { meta, video } = state
  const videoId = video?.id ?? meta.id
  useTitle(video ? `${meta.name} ${episodeLabel(video.season, video.episode)}` : meta.name)

  const flash = useCallback((msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(undefined), 4000)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const audioLang = audioTracks.find((t) => t.id === audioTrack)?.lang ?? guessAudioLang(state.stream)
  // Lo que ocupa la barra de controles, para que los subtítulos suban y no queden tapados.
  const [controlsClear, setControlsClear] = useState(0)
  useEffect(() => {
    const root = rootRef.current
    const bar = root?.querySelector<HTMLElement>('.player-controls')
    setControlsClear(controls && root && bar && root.clientHeight ? Math.ceil((bar.offsetHeight / root.clientHeight) * 100) : 0)
  }, [controls])
  // Alto real de la barra (en el celular vertical va en varios renglones y cambia con el ancho): los menús
  // se apoyan arriba de ella con `--controls-h` en vez de un `bottom` fijo que la tapaba.
  useEffect(() => {
    const root = rootRef.current
    const bar = root?.querySelector<HTMLElement>('.player-controls')
    if (!root || !bar || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      root.style.setProperty('--controls-h', `${bar.offsetHeight}px`)
    })
    ro.observe(bar)
    return () => {
      ro.disconnect()
    }
  }, [])
  const subs = useSubtitles({ videoRef, hlsRef, state, audioLang, flash, closeMenu: () => setMenu(null), controlsClear })
  const pip = usePictureInPicture(videoRef)
  // Pantalla prendida mientras se reproduce; se suelta en pausa y al salir.
  useWakeLock(playing)

  // ---------- Velocidad ----------
  useEffect(() => {
    const el = videoRef.current
    if (el && el.playbackRate !== rate) el.playbackRate = rate
  }, [rate, state.playUrl])

  const changeRate = (next: Rate, announce = true) => {
    setRate(next)
    storeRate(next)
    if (announce) flash(next === 1 ? 'Velocidad normal' : `Velocidad: ${formatRate(next)}`)
    showControls()
  }

  // ---------- Carga del video ----------
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const url = state.playUrl
    let disposed = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const token = {}
    attachToken.current = token

    const start = () => {
      if (askStillRef.current) return
      el.play().catch(() => setControls(true))
    }

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
          setAudioTracks(data.audioTracks.map((t, i) => ({ id: i, name: t.name || langLabel(t.lang ?? '') || `Pista ${i + 1}`, lang: t.lang })))
          // Primera pista en el idioma de audio preferido (el elegido para este título primero).
          if (!userPickedAudio.current) {
            // Al cambiar de fuente, primero el idioma que se estaba escuchando.
            const prefs = [...(resume?.audioLang ? [resume.audioLang] : []), ...audioPrefs(trackPrefsStore.get()[meta.id], settingsStore.get().audioLangs ?? [])]
            let pick = -1
            let best = 99
            data.audioTracks.forEach((t, i) => {
              const r = langRank(t.lang, prefs)
              if (r < best) {
                best = r
                pick = i
              }
            })
            if (pick >= 0 && pick !== hls.audioTrack) hls.audioTrack = pick
          }
          setAudioTrack(hls.audioTrack)
        })
        hls.on(HlsLib.Events.SUBTITLE_TRACKS_UPDATED, (_e, data) => subs.onHlsTracks(data.subtitleTracks))
        hls.on(HlsLib.Events.SUBTITLE_TRACK_SWITCH, (_e, data) => subs.onHlsSwitch(data.id))
        // Un corte de red o un tropiezo del decodificador no tienen por qué terminar en la tarjeta de error:
        // primero se reintenta (como hace el propio Stremio) y recién después se avisa.
        let networkRetries = 0
        let mediaRecovered = false
        hls.on(HlsLib.Events.ERROR, (_e, data) => {
          if (!data.fatal) return
          if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR && networkRetries < HLS_NETWORK_RETRIES) {
            networkRetries++
            setBuffering(true)
            clearTimeout(retryTimer)
            retryTimer = setTimeout(() => {
              if (!disposed) hls.startLoad()
            }, HLS_RETRY_MS)
            return
          }
          if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR && !mediaRecovered) {
            mediaRecovered = true
            hls.recoverMediaError()
            return
          }
          setError(`Error de reproducción (${data.details})`)
        })
        start()
      }).catch(() => {
        // Sin red justo al abrir, o el pedazo de la app con hls.js no estaba guardado (PWA recién actualizada).
        if (!disposed) setError('No se pudo cargar el reproductor de streams HLS. Revisá la conexión y probá de nuevo, o elegí otra fuente.')
      })
    } else {
      el.src = url
      start()
    }
    return () => {
      disposed = true
      clearTimeout(retryTimer)
      const hls = hlsRef.current
      hlsRef.current = null
      // Cortar la descarga al salir (un MP4 directo seguiría bajando). Tanto `destroy()` de hls.js como
      // `load()` ponen la posición en 0, así que va en una microtarea: el guardado del progreso, que
      // corre en la limpieza del efecto siguiente, todavía tiene que ver dónde quedó.
      queueMicrotask(() => {
        // Si el efecto ya volvió a correr sobre el mismo <video> (doble montaje de StrictMode en desarrollo),
        // la fuente nueva ya está puesta y no hay instancia de hls.js de esta corrida: no se toca nada.
        if (attachToken.current !== token) return
        hls?.destroy()
        el.removeAttribute('src')
        el.load()
      })
    }
  }, [state.playUrl])

  // Intro, resumen y créditos.
  useEffect(() => {
    let alive = true
    getSegments(imdbIdOf(meta.id, video?.id), video?.season, video?.episode).then((s) => {
      if (alive) setSegments(s)
    })
    return () => {
      alive = false
    }
  }, [meta.id, video?.id, video?.season, video?.episode])

  // Cualquier tecla, clic o toque cuenta como "hay alguien mirando".
  useEffect(() => {
    const reset = () => writeAutoCount(0)
    window.addEventListener('keydown', reset)
    window.addEventListener('pointerdown', reset)
    window.addEventListener('touchstart', reset)
    return () => {
      window.removeEventListener('keydown', reset)
      window.removeEventListener('pointerdown', reset)
      window.removeEventListener('touchstart', reset)
    }
  }, [])

  // Al pasar el 70% se buscan de antemano los streams del siguiente episodio.
  const prefetched = useRef(false)
  useEffect(() => {
    prefetched.current = false
  }, [videoId])
  useEffect(() => {
    if (prefetched.current || !state.nextVideoId || duration <= 0 || time / duration < 0.7) return
    prefetched.current = true
    prefetchNextStreams(state)
  }, [time, duration, state])

  // ---------- Progreso ----------
  /** `target`: el <video> capturado antes de desmontar (en la limpieza del efecto la ref ya es null). */
  const persist = useCallback((target?: HTMLVideoElement | null) => {
    const el = target instanceof HTMLVideoElement ? target : videoRef.current
    const minDuration = video ? MIN_HISTORY_EPISODE_S : MIN_HISTORY_S
    if (!el || !Number.isFinite(el.duration) || el.duration < minDuration || el.currentTime < 5) return
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
    // Capturado acá: con el "atrás" del navegador la ref ya está en null cuando corre la limpieza.
    const el = videoRef.current
    const t = setInterval(() => {
      if (el && !el.paused) persist(el)
    }, SAVE_EVERY_MS)
    const onHide = () => persist(el)
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      clearInterval(t)
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
      persist(el)
    }
  }, [persist])

  const onLoadedMetadata = () => {
    const el = videoRef.current
    if (!el) return
    setDuration(el.duration)
    // Algunos navegadores vuelven a 1× al cargar otra fuente.
    if (el.playbackRate !== rateRef.current) el.playbackRate = rateRef.current
    const saved = progressStore.get()[videoId]
    // `resume.at === 0` es "sin posición" (se cambió de fuente antes de que cargara el video): vale lo guardado.
    if (resume && resume.at > 0) el.currentTime = Math.min(resume.at, Math.max(0, el.duration - 1))
    else if (saved && !saved.watched && saved.position > RESUME_MIN_S && saved.position < el.duration - 30) {
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
    if (scrubRef.current) {
      finishScrub(true)
      return
    }
    if (el.paused) el.play().catch(() => {})
    else el.pause()
    showControls()
  }

  /** `reveal`: mostrar los controles (el doble toque del celular adelanta sin taparlo todo). */
  const seek = (delta: number, reveal = true) => {
    const el = videoRef.current
    if (!el) return
    el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + delta))
    if (reveal) showControls()
  }

  // ---------- Modo scrub (← / → mantenidas) ----------
  const finishScrub = (confirm: boolean) => {
    const s = scrubRef.current
    const el = videoRef.current
    if (!s) return
    setScrub(undefined)
    if (el) {
      el.currentTime = confirm ? s.target : s.origin
      if (s.wasPlaying) el.play().catch(() => {})
    }
    showControls()
  }

  /** Flecha ← / → sin un botón enfocado: toque = ±10 s; mantenida = modo scrub con miniatura. */
  const arrowSeek = (key: string, dir: Dir, repeat: boolean, now: number) => {
    const el = videoRef.current
    if (!el) return
    const held = isHold(lastPress.current, key, now, repeat, tvMode)
    lastPress.current = { key, at: now, up: false }
    const current = scrubRef.current
    if (current) {
      setScrub(scrubKey(current, dir, now, el.duration, held))
      showControls()
      return
    }
    if (!held) {
      pressOrigin.current = el.currentTime
      seek(dir * SEEK_STEP)
      return
    }
    // Se mantiene: el video se pausa y se mueve el destino (con la miniatura de ese momento).
    const wasPlaying = !el.paused
    if (wasPlaying) el.pause()
    setScrub(scrubKey(startScrub(pressOrigin.current, el.currentTime, dir, now, wasPlaying), dir, now, el.duration, true))
    showControls()
  }

  useEffect(() => {
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      // Se soltó: el destino queda quieto esperando OK o Atrás (la próxima flecha, si tarda, empieza despacio).
      if (lastPress.current?.key === e.key) lastPress.current = { ...lastPress.current, up: true, at: e.timeStamp }
    }
    window.addEventListener('keyup', onUp)
    return () => window.removeEventListener('keyup', onUp)
  }, [])

  const toggleFullscreen = () => {
    // El iPhone no tiene pantalla completa para una página: solo la del propio <video> (con sus controles).
    const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    if (typeof document.documentElement.requestFullscreen !== 'function' && typeof v?.webkitEnterFullscreen === 'function') v.webkitEnterFullscreen()
    else toggleScreen()
    showControls()
  }

  // ---------- Ajustar / llenar / estirar ----------
  const cycleFit = () => {
    setFit(nextFit(fitRef.current))
    showControls()
  }

  // ---------- Toques (celular) ----------
  const hideControls = () => {
    clearTimeout(hideTimer.current)
    setControls(false)
    setMenu(null)
  }

  useTouchGestures(videoRef, {
    // Toque simple: muestra u oculta los controles (antes pausaba).
    onTap: () => {
      if (menu) setMenu(null)
      else if (controls) hideControls()
      else showControls()
    },
    onSeek: (zone, count) => {
      seek(zone === 'right' ? SEEK_STEP : -SEEK_STEP, false)
      setRipple({ zone, seconds: count * SEEK_STEP, key: Date.now() })
      clearTimeout(rippleTimer.current)
      rippleTimer.current = setTimeout(() => setRipple(undefined), RIPPLE_MS)
    },
    onPinch: (next) => setFit(next),
    getFit: () => fitRef.current,
  })

  const lockScreen = () => {
    setMenu(null)
    hideControls()
    setLocked(true)
    flash('Pantalla bloqueada. Tocá la pantalla y después “Desbloquear”.')
  }
  const unlockScreen = () => {
    clearTimeout(unlockTimer.current)
    setUnlockHint(false)
    setLocked(false)
    showControls()
  }
  const revealUnlock = () => {
    setUnlockHint(true)
    clearTimeout(unlockTimer.current)
    unlockTimer.current = setTimeout(() => setUnlockHint(false), UNLOCK_HINT_MS)
  }

  // ---------- Rueda del mouse: volumen (U23) ----------
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    // En los menús y carteles la rueda hace scroll, como siempre.
    if (target !== videoRef.current && !target.closest('.vol')) return
    const delta = wheelVolumeDelta(e.deltaY)
    if (!delta || e.timeStamp - lastWheel.current < WHEEL_THROTTLE_MS) return
    lastWheel.current = e.timeStamp
    changeVolume(delta)
  }

  const setVolume = (v: number) => {
    const el = videoRef.current
    if (!el) return
    el.volume = Math.max(0, Math.min(1, v))
    el.muted = v === 0
    showControls()
  }

  const toggleMenu = (kind: Menu, e: MouseEvent<HTMLElement>) => {
    menuOpener.current = e.currentTarget
    setMenu(menu === kind ? null : kind)
    showControls()
  }

  const exit = useCallback(() => {
    persist()
    // Si pasó solo al siguiente episodio, la ficha de atrás todavía marca el anterior: le avisamos cuál se vio último.
    if (state.video) setReturnVideo({ metaId: meta.id, videoId: state.video.id, season: state.video.season })
    if (window.history.length > 1) navigate(-1)
    else navigate(`/detail/${meta.type}/${encodeURIComponent(meta.id)}`, { replace: true })
  }, [persist, navigate, meta.type, meta.id, state.video])

  /** `auto`: lo disparó la cuenta regresiva o el final del video, no el usuario. */
  const goNext = async (auto = false) => {
    if (!state.nextVideoId || advancing.current) return
    advancing.current = true
    writeAutoCount(auto ? readAutoCount() + 1 : 0)
    persist()
    setNextLoading(true)
    const next = settings.autoplayNext ? await findNextStream(state).catch(() => undefined) : undefined
    if (!aliveRef.current) return
    setNextLoading(false)
    if (next) {
      navigate(`/watch/${meta.type}/${encodeURIComponent(next.video!.id)}`, { state: next, replace: true })
      return
    }
    // Sin stream para seguir solo, vuelve a la ficha en el siguiente episodio: con su temporada, que
    // puede no ser la actual (fin de temporada). La ficha ya está en caché, así que esto es inmediato.
    const season = (await nextEpisodeSeason(state).catch(() => undefined)) ?? state.video?.season ?? 1
    if (!aliveRef.current) return
    navigate(`/detail/${meta.type}/${encodeURIComponent(meta.id)}?season=${season}&video=${encodeURIComponent(state.nextVideoId)}`, {
      replace: true,
    })
  }

  // Notificación y teclas multimedia del sistema (pantalla de bloqueo, auriculares, Android Auto…).
  useMediaSession({ videoRef, state, playing, onNext: state.nextVideoId ? () => goNext() : undefined })

  // ---------- Sonido, subtítulos y ventana flotante por teclado ----------
  const changeVolume = (delta: number) => {
    const el = videoRef.current
    if (!el) return
    el.volume = Math.round(Math.max(0, Math.min(1, el.volume + delta)) * 100) / 100
    if (delta > 0 && el.muted) el.muted = false
    flash(el.muted ? 'Silenciado' : `Volumen: ${Math.round(el.volume * 100)} %`)
    showControls()
  }

  const toggleMute = () => {
    const el = videoRef.current
    if (!el) return
    el.muted = !el.muted
    flash(el.muted ? 'Silenciado' : `Sonido: ${Math.round(el.volume * 100)} %`)
    showControls()
  }

  /** Tecla C: apaga los subtítulos o vuelve a prender el último (o el primero que haya). */
  const toggleSubs = () => {
    if (subs.active) {
      lastSub.current = subs.active
      subs.select('')
      flash('Subtítulos desactivados')
      return
    }
    const pick = subs.options.find((s) => s.url === lastSub.current)?.url ?? subs.options[0]?.url
    if (pick) subs.select(pick)
    else flash('No hay subtítulos para esta fuente')
  }

  const togglePip = () => {
    showControls()
    pip.toggle().then((ok) => {
      if (!ok) flash('No se pudo abrir la ventana flotante')
    })
  }

  /** Atajos S / A / V: abren el menú como si se hubiera tocado su botón (el foco vuelve ahí al cerrar). */
  const toggleMenuKey = (kind: Menu) => {
    menuOpener.current = rootRef.current?.querySelector<HTMLElement>(`.player-controls button[data-menu="${kind}"]`) ?? null
    setMenu(menu === kind ? null : kind)
    showControls()
  }

  // Al cambiar de fuente se vuelve a poner el subtítulo (y el retraso) que estaba activo.
  useEffect(() => {
    if (!resume) return
    flash(notice ?? `Fuente: ${state.addonName}`)
    if (resume.sub !== undefined) subs.restore(resume.sub, resume.subDelay ?? 0, resume.subLabel)
  }, [])

  const selectAudio = (id: number) => {
    userPickedAudio.current = true
    const lang = audioTracks.find((t) => t.id === id)?.lang
    if (lang) rememberTracks(meta.id, { audioLang: lang3(lang) })
    if (hlsRef.current) hlsRef.current.audioTrack = id
    setAudioTrack(id)
    setMenu(null)
  }

  // ---------- Intro / resumen / créditos ----------
  const inside = (s?: Segment) => !!s && duration > 0 && time >= s.start && time < Math.min(s.end, duration) - 0.5
  const skipKind: 'intro' | 'recap' | undefined =
    settings.skipSegments === 'off' || !segments ? undefined : inside(segments.recap) ? 'recap' : inside(segments.intro) ? 'intro' : undefined
  // Créditos y escena post-créditos: con escena, la tarjeta del siguiente sale al terminar los créditos.
  const plan = creditsPlan(segments, duration, !!state.nextVideoId, NEXT_FALLBACK_S)
  const inCredits = settings.skipSegments === 'button' && (!state.nextVideoId || plan.afterCredits) && inside(plan.credits)

  const skipTo = (seg?: Segment) => {
    const el = videoRef.current
    if (!el || !seg) return
    el.currentTime = Math.min(seg.end, el.duration || seg.end)
  }

  // Si hace mucho que no ve la serie, el resumen no se saltea solo: se ofrece verlo.
  const [awayDays] = useState(() => (video ? daysAway(meta.id) : undefined))
  const [recapChoice, setRecapChoice] = useState<'ask' | 'done'>('ask')
  const longAway = awayDays !== undefined && awayDays >= RECAP_AFTER_DAYS
  const offerRecap = skipKind === 'recap' && longAway && recapChoice === 'ask'

  // Modo "saltar solo": una vez por segmento (si vuelve para atrás, lo respeta).
  useEffect(() => {
    if (!skipKind || settings.skipSegments !== 'auto' || autoSkipped.current.has(skipKind)) return
    if (skipKind === 'recap' && longAway) return
    autoSkipped.current.add(skipKind)
    skipTo(segments?.[skipKind])
    flash(skipKind === 'intro' ? 'Se saltó la intro' : 'Se saltó el resumen')
  }, [skipKind, settings.skipSegments])

  // Tarjeta del siguiente episodio: al empezar los créditos (al terminar, si hay escena después) o,
  // sin datos, 30 s antes del final.
  const nextAt = plan.nextAt
  const nextDue = nextAt !== undefined && time >= nextAt

  useEffect(() => {
    if (!nextDue) {
      setNextDismissed(false)
      setCountdown(NEXT_COUNTDOWN_S)
    } else if (sleep.kind === 'episode') fireSleep()
  }, [nextDue])

  const showNextCard = nextDue && !nextDismissed && !sleepFired && !askStill && sleep.kind !== 'episode'

  useEffect(() => {
    if (!showNextCard || !settings.autoplayNext || plan.afterCredits) return
    const t = setInterval(() => {
      // En pausa la cuenta regresiva también se frena.
      if (videoRef.current && !videoRef.current.paused) setCountdown((c) => c - 1)
    }, 1000)
    return () => clearInterval(t)
  }, [showNextCard, settings.autoplayNext, plan.afterCredits])

  useEffect(() => {
    if (showNextCard && settings.autoplayNext && countdown <= 0) goNext(true)
  }, [countdown])

  // ---------- Temporizador de sueño ----------
  function fireSleep() {
    videoRef.current?.pause()
    setSleep({ kind: 'off' })
    sessionSet(SLEEP_KEY, '')
    setMenu(null)
    setSleepFired(true)
  }

  useEffect(() => {
    if (sleep.kind !== 'time') return
    const t = setInterval(() => {
      if (Date.now() >= sleep.at) fireSleep()
    }, 1000)
    return () => clearInterval(t)
  }, [sleep])

  const chooseSleep = (choice: number | 'episode') => {
    const next: Sleep =
      choice === 'episode' ? { kind: 'episode' } : choice > 0 ? { kind: 'time', at: Date.now() + choice * 60_000 } : { kind: 'off' }
    setSleep(next)
    // El de minutos sigue andando aunque pase al siguiente episodio; "fin del episodio" es de este.
    sessionSet(SLEEP_KEY, next.kind === 'time' ? String(next.at) : '')
    setMenu(null)
    flash(
      next.kind === 'off'
        ? 'Temporizador desactivado'
        : next.kind === 'episode'
          ? 'Se va a pausar al terminar el episodio'
          : `Se va a pausar en ${choice} minutos`,
    )
  }

  const sleepMinutesLeft = sleep.kind === 'time' ? Math.max(1, Math.ceil((sleep.at - Date.now()) / 60_000)) : 0

  // ---------- ¿Seguís viendo? ----------
  const keepWatching = () => {
    askStillRef.current = false
    setAskStill(false)
    writeAutoCount(0)
    videoRef.current?.play().catch(() => setControls(true))
  }

  // ---------- Reproductor externo ----------
  const openExternal = () => {
    const url = state.playUrl
    videoRef.current?.pause()
    persist()
    // Cada reproductor arma su enlace o intent según el sistema (lib/externalPlayers.ts).
    const launch = externalLaunch(settings.externalPlayer, url, currentPlatform().os, state.meta.name)
    if (!launch.href) {
      copyText(url).then((ok) => flash(ok ? 'Enlace copiado: pegalo en tu reproductor' : 'No se pudo copiar el enlace'))
      return
    }
    // Se copia igual por si la app no está instalada o el navegador bloquea el esquema.
    const copying = launch.copy ? copyText(url) : Promise.resolve(false)
    launchUrl(launch.href, currentPlatform().os)
    copying.then((ok) =>
      flash(ok ? `Abriendo ${launch.label}… Si no abre, el enlace ya está copiado: pegalo en tu reproductor` : `Abriendo ${launch.label}…`),
    )
  }

  // ---------- Cambiar de fuente ----------
  const changeSource = (pick: Parameters<typeof switchSource>[0]) => {
    setMenu(null)
    const el = videoRef.current
    if (!el || pick.url === state.playUrl) return
    persist()
    const hls = hlsRef.current
    // Si el video nunca llegó a cargar (enlace caído) la posición actual es 0 y pisaría la guardada:
    // la nueva fuente sigue desde donde se había quedado (o desde donde venía el cambio anterior).
    const loaded = Number.isFinite(el.duration) && el.currentTime >= 5
    const savedAt = resume?.at || progressStore.get()[videoId]?.position || 0
    switchSource(pick, {
      at: loaded ? el.currentTime : savedAt,
      sub: subs.active,
      subLabel: subs.activeLabel(),
      subDelay: subs.delay,
      audioLang: hls && audioTrack >= 0 ? hls.audioTracks[audioTrack]?.lang : undefined,
    })
  }

  // ---------- Foco ----------
  // Al abrir un menú el foco va a la opción activa; al cerrarlo vuelve al botón que lo abrió.
  useEffect(() => {
    const root = rootRef.current
    if (menu) {
      const target = root?.querySelector<HTMLElement>('.player-menu button.active') ?? root?.querySelector<HTMLElement>('.player-menu button')
      target?.focus()
    } else if (menuOpener.current?.isConnected && (!document.activeElement || document.activeElement === document.body)) {
      menuOpener.current.focus()
    }
  }, [menu])

  // Al abrir las fuentes desde la tarjeta de error, el foco va a la lista.
  useEffect(() => {
    if (!errorSources) return
    const box = rootRef.current?.querySelector('.player-error-sources')
    ;(
      box?.querySelector<HTMLElement>('button.active') ??
      box?.querySelector<HTMLElement>('button') ??
      rootRef.current?.querySelector<HTMLElement>('.player-error .btn')
    )?.focus()
  }, [errorSources])

  /** Pasa el foco al botón anterior/siguiente dentro de `scope`. Devuelve false si no había adónde ir. */
  const moveFocus = (scope: Element | null | undefined, selector: string, from: Element | null, delta: number) => {
    // Solo lo que se ve: el volumen, por ejemplo, está oculto en la TV y en el celular.
    const items = Array.from(scope?.querySelectorAll<HTMLElement>(selector) ?? []).filter((el) => el.getClientRects().length > 0)
    const i = items.indexOf(from as HTMLElement)
    const target = items[i < 0 ? 0 : i + delta]
    target?.focus()
    return !!target
  }

  // Teclado y control remoto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Los atajos del navegador (Ctrl+F, Cmd+R…) y lo que se escribe en un campo no son para el reproductor.
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target?.closest?.('input:not([type="range"]), textarea, [contenteditable="true"]')) return
      // Pantalla bloqueada (celular): no se toca nada hasta desbloquear.
      if (locked) return
      // En el slider de volumen las flechas son del slider.
      if (target?.closest?.('.vol-slider') && e.key.startsWith('Arrow')) return
      const active = document.activeElement as HTMLElement | null
      const focusedControl = active?.closest('.player-controls button, .player-menu button')
      // Botones flotantes (saltar intro, siguiente episodio) y carteles (error, temporizador, ¿seguís viendo?).
      const floating = active?.closest('.player-float')
      // Las letras valen con mayúscula o Bloq Mayús; los símbolos (< >) ya vienen con Shift.
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      // Modo scrub: OK (o Espacio) va al destino, Atrás vuelve a donde estaba.
      if (scrubRef.current) {
        if (key === 'Enter' || key === ' ' || key === 'k' || key === 'MediaPlayPause') {
          e.preventDefault()
          finishScrub(true)
          return
        }
        if (key === 'Escape' || key === 'GoBack' || key === 'BrowserBack' || key === 'Backspace') {
          e.preventDefault()
          finishScrub(false)
          return
        }
      }
      const menuEl = active?.closest('.player-menu')
      // En el ⚙ las flechas van por filas (↑/↓) y dentro de la fila (←/→).
      if (menu === 'quick' && menuEl && key.startsWith('Arrow')) {
        e.preventDefault()
        quickSettingsArrow(menuEl, active, key)
        showControls()
        return
      }
      // 0–9: saltar al 0–90 % (no con un cartel abierto, que ahí se navega con los botones).
      if (key >= '0' && key <= '9' && !floating && !menu) {
        const el = videoRef.current
        if (el && Number.isFinite(el.duration) && el.duration > 0) {
          e.preventDefault()
          el.currentTime = (el.duration * Number(key)) / 10
          showControls()
        }
        return
      }
      switch (key) {
        case 'Escape':
        case 'GoBack':
        case 'BrowserBack':
        case 'Backspace':
          e.preventDefault()
          if (menu) setMenu(null)
          else if (errorSources) setErrorSources(false)
          else exit()
          return
        case ' ':
        case 'k':
        case 'MediaPlayPause':
          e.preventDefault()
          togglePlay()
          return
        case 'Enter':
          if (floating) return
          if (!controls || !focusedControl) {
            e.preventDefault()
            if (!controls) showControls()
            else togglePlay()
          }
          return
        case 'ArrowLeft':
        case 'ArrowRight': {
          const delta = e.key === 'ArrowRight' ? 1 : -1
          if (floating) {
            // En los carteles el foco no sale; en la esquina, si no hay otro botón, la flecha adelanta/atrasa.
            const moved = moveFocus(floating, 'button:not([disabled]), a[href]', active, delta)
            if (moved || floating.classList.contains('player-modal')) {
              e.preventDefault()
              return
            }
          }
          if (controls && focusedControl) {
            // Con los controles visibles las flechas recorren los botones.
            e.preventDefault()
            moveFocus(rootRef.current, '.player-menu button, .player-controls button', focusedControl, delta)
            showControls()
            return
          }
          e.preventDefault()
          arrowSeek(e.key, delta as Dir, e.repeat, e.timeStamp)
          return
        }
        case 'MediaFastForward':
          seek(SEEK_STEP * 3)
          return
        case 'MediaRewind':
          seek(-SEEK_STEP * 3)
          return
        case 'j':
          e.preventDefault()
          seek(-SEEK_STEP)
          return
        case 'l':
          e.preventDefault()
          seek(SEEK_STEP)
          return
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault()
          if (floating?.classList.contains('player-modal')) {
            // En la tarjeta de error, ↑/↓ recorren la lista de fuentes y los botones.
            if (floating.classList.contains('player-error')) moveFocus(floating, 'button:not([disabled]), a[href]', active, e.key === 'ArrowDown' ? 1 : -1)
            return
          }
          // Con teclado (no en la TV) y sin nada enfocado, ↑/↓ es el volumen. En la TV las flechas
          // mueven el foco por los controles, como siempre.
          if (!tvMode && !menuEl && !focusedControl && !floating) {
            changeVolume(e.key === 'ArrowUp' ? VOLUME_STEP : -VOLUME_STEP)
            return
          }
          showControls()
          const delta = e.key === 'ArrowDown' ? 1 : -1
          if (menuEl) {
            moveFocus(menuEl, 'button', active, delta)
            return
          }
          // Entre "¿Qué te pareció?" (arriba) y la esquina (siguiente, "Más como esto"): ↓ baja, ↑ sube.
          // En "Más como esto" se entra por el primer título, no por "Cerrar".
          const rateEl = rootRef.current?.querySelector<HTMLElement>('.player-rate [role="slider"]')
          const cornerBtn =
            rootRef.current?.querySelector<HTMLElement>('.player-corner .postplay-item') ??
            rootRef.current?.querySelector<HTMLElement>('.player-corner button:not([disabled])')
          if (floating?.classList.contains('player-rate') && e.key === 'ArrowDown' && cornerBtn) {
            cornerBtn.focus()
            return
          }
          if (floating?.classList.contains('player-corner') && e.key === 'ArrowUp' && rateEl) {
            rateEl.focus()
            return
          }
          // Desde los controles, ↑ va primero a la esquina (justo arriba de la barra) y si no hay, al puntaje.
          const corner = cornerBtn ?? rateEl
          if (e.key === 'ArrowUp' && focusedControl && corner) corner.focus()
          else if (floating || !focusedControl) playBtnRef.current?.focus()
          return
        }
        case 'f':
          toggleFullscreen()
          return
        case 'z':
          cycleFit()
          return
        case 'm':
          toggleMute()
          return
        case 'c':
          toggleSubs()
          return
        case 's':
          toggleMenuKey('subs')
          return
        case 'a':
        case 'v':
          toggleMenuKey('sources')
          return
        case 'n':
        case 'MediaTrackNext':
          if (state.nextVideoId) goNext()
          return
        case 'p':
          if (pip.supported) togglePip()
          return
        case '<':
        case ',':
          changeRate(stepRate(rate, -1))
          return
        case '>':
        case '.':
          changeRate(stepRate(rate, 1))
          return
        case 'i':
          // Saltar intro / resumen (o los créditos) cuando hay segmento.
          if (skipKind) {
            setRecapChoice('done')
            skipTo(segments?.[skipKind])
          } else if (inCredits) skipTo(plan.credits)
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

  const external = externalPlayerUrl(state.playUrl)
  const subStyle = settings.subtitleStyle
  const showSkip = !!skipKind && settings.skipSegments === 'button' && !(skipKind === 'recap' && longAway)
  // "Más como esto" al empezar los créditos de una peli (o al final, sin datos de créditos).
  const isMovie = meta.type === 'movie' && !state.nextVideoId
  const postPlayFrom = isMovie ? endCardAt(plan.credits?.start, duration, END_FALLBACK_S) : undefined
  const postPlayDue = postPlayFrom !== undefined && time >= postPlayFrom && !postPlayClosed
  const openPick = (pick: PostPlayPick) => {
    persist()
    // Reemplaza al reproductor: "Atrás" desde la ficha nueva vuelve a la de esta peli.
    navigate(`/detail/${pick.type}/${encodeURIComponent(pick.id)}`, { replace: true })
  }
  const skipButton = (showSkip || inCredits) && (
    <button
      key={skipKind ?? 'credits'}
      className="btn skip-btn"
      autoFocus
      onClick={() => skipTo(skipKind ? segments?.[skipKind] : plan.credits)}
    >
      {skipKind === 'intro' ? 'Saltar intro' : skipKind === 'recap' ? 'Saltar resumen' : 'Saltar créditos'}
    </button>
  )
  const showCorner = !menu && !error && !askStill && !sleepFired && !locked && (showNextCard || offerRecap || showSkip || inCredits || postPlayDue)
  // Cuenta regresiva de la tarjeta del siguiente: con escena post-créditos, hasta el final del video.
  const nextLeft = plan.afterCredits ? duration - time : countdown
  const nextTotal = plan.afterCredits && nextAt !== undefined ? duration - nextAt : NEXT_COUNTDOWN_S

  return (
    <div
      ref={rootRef}
      className={`player ${controls && !locked ? 'show-controls' : ''} ${locked ? 'is-locked' : ''} ${scrub ? 'is-scrubbing' : ''} ${subtitleClasses(subStyle)}`}
      data-nav-disabled
      data-fit={fit}
      {...subs.dropProps}
      onPointerDown={(e) => {
        lastPointer.current = e.pointerType
        // Un toque sobre el video lo maneja el gesto (muestra u oculta); sobre los controles, los mantiene visibles.
        if (!locked && (e.pointerType !== 'touch' || e.target !== videoRef.current)) showControls()
      }}
      onPointerMove={(e) => {
        // Solo el mouse: en el celular, después de cada toque el navegador manda un "movimiento" de compatibilidad.
        if (e.pointerType !== 'touch' && !locked) showControls()
      }}
      onWheel={onWheel}
    >
      <video
        ref={videoRef}
        className="player-video"
        style={{ objectFit: fit }}
        playsInline
        autoPlay={!askStill}
        // Con mouse, clic = pausa y doble clic = pantalla completa. Con el dedo eso lo manejan los gestos.
        onClick={() => {
          if (lastPointer.current !== 'touch') togglePlay()
        }}
        onDoubleClick={() => {
          if (lastPointer.current !== 'touch') toggleFullscreen()
        }}
        onPlay={() => {
          setPlaying(true)
          setSleepFired(false)
          if (askStillRef.current) keepWatching()
        }}
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
          if (sleep.kind === 'episode') fireSleep()
          else if (state.nextVideoId && settings.autoplayNext && !nextDismissed) goNext(true)
        }}
        onError={() =>
          setError(
            state.stream.behaviorHints?.notWebReady
              ? 'El navegador no puede reproducir este formato (MKV/HEVC). Probá otro stream o abrilo en un reproductor externo.'
              : 'No se pudo reproducir este stream. Puede haber expirado o no ser compatible con el navegador.',
          )
        }
      />

      <PauseCast
        imdbId={meta.id}
        type={meta.type}
        season={video?.season}
        episode={video?.episode}
        videoId={video?.id}
        visible={!playing && !buffering && time > 0 && !error && !menu && !askStill && !sleepFired && !scrub && !locked}
      />

      {buffering && !error && !askStill && !sleepFired && <div className="player-spinner" aria-label="Cargando" />}

      {ripple && (
        <div key={ripple.key} className={`player-ripple player-ripple-${ripple.zone}`} aria-hidden>
          <span className="player-ripple-wave" />
          <span className="player-ripple-text">
            <PlayerIcon name={ripple.zone === 'right' ? 'fwd10' : 'back10'} size={30} />
            {ripple.zone === 'right' ? '+' : '−'}
            {ripple.seconds} s
          </span>
        </div>
      )}

      {scrub && (
        <div className="player-scrub-hint" role="status">
          <strong>
            {formatTime(scrub.target)} <span className="muted">({scrubDelta(scrub) >= 0 ? '+' : '−'}{formatTime(Math.abs(scrubDelta(scrub)))})</span>
          </strong>
          <span className="muted small">{tvMode ? 'OK para ir · Atrás para cancelar' : 'Enter para ir · Esc para cancelar'}</span>
        </div>
      )}

      {!error && !askStill && !sleepFired && <CreditsNotice imdbId={meta.id} type={meta.type} plan={plan} time={time} duration={duration} />}

      {!error && !askStill && !sleepFired && (
        <RateAtEnd meta={meta} hasNext={!!state.nextVideoId} time={time} duration={duration} creditsStart={plan.credits?.start} />
      )}

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

      {subs.dragging && <div className="player-drop">Soltá el archivo para cargar los subtítulos (.srt, .vtt, .ass)</div>}

      {toast && (
        <div className="player-toast player-note" role="status">
          {toast}
        </div>
      )}

      {error && (
        <div
          className={`player-error player-float player-modal ${tvMode ? 'player-error-tv' : ''}`}
          role="alert"
          style={{ ['--player-bg' as string]: meta.background ? `url("${meta.background}")` : undefined }}
        >
          <div className="player-error-card">
            <span className="player-error-icon">
              <PlayerIcon name="alert" size={tvMode ? 48 : 40} />
            </span>
            <div className="player-error-heading">
              <strong>{meta.name}</strong>
              {video && (
                <span>
                  {[episodeLabel(video.season, video.episode), video.title ?? video.name].filter(Boolean).join(' · ')}
                </span>
              )}
            </div>
            <p>{error}</p>
            {errorSources && (
              <div className="player-error-sources">
                <SourcesMenu state={state} onPick={changeSource} />
              </div>
            )}
            <div className="hero-actions">
              {!errorSources && (
                <button className="btn btn-primary" onClick={() => setErrorSources(true)} autoFocus data-autofocus>
                  Elegir otra fuente
                </button>
              )}
              <button className="btn" onClick={exit}>
                Volver
              </button>
              {external && (
                <a className="btn" href={external}>
                  Abrir en otro reproductor
                </a>
              )}
              <ReportButton
                kind="player"
                error={error}
                addons={state.addonUrl ? [state.addonUrl] : []}
                stream={{
                  url: state.playUrl,
                  type: state.stream.behaviorHints?.notWebReady ? 'external' : state.playUrl.includes('.m3u8') ? 'hls' : 'direct',
                }}
                context={{ addon: state.addonName, titulo: state.meta.name, episodio: state.video?.id }}
              />
              {/* En la TV no hay dónde pegar el enlace. */}
              {!tvMode && (
                <button className="btn" onClick={() => copyText(state.playUrl).then((ok) => flash(ok ? 'Enlace copiado' : 'No se pudo copiar el enlace'))}>
                  Copiar enlace
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {askStill && (
        <div className="player-dim player-float player-modal" role="dialog" aria-labelledby="still-title">
          <h2 id="still-title">¿Seguís viendo?</h2>
          <p className="muted">
            {meta.name}
            {video ? ` · ${episodeLabel(video.season, video.episode)}` : ''}
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={keepWatching} autoFocus>
              Seguir viendo
            </button>
            <button className="btn" onClick={exit}>
              Salir
            </button>
          </div>
        </div>
      )}

      {sleepFired && !askStill && (
        <div className="player-dim player-float player-modal" role="dialog" aria-labelledby="sleep-title">
          <h2 id="sleep-title">Pausado por el temporizador</h2>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={() => videoRef.current?.play().catch(() => {})} autoFocus>
              Seguir viendo
            </button>
            <button className="btn" onClick={exit}>
              Salir
            </button>
          </div>
        </div>
      )}

      {showCorner && (
        <div className="player-corner player-float">
          {offerRecap && !showNextCard ? (
            <RecapOffer
              days={awayDays!}
              onWatch={() => setRecapChoice('done')}
              onSkip={() => {
                setRecapChoice('done')
                skipTo(segments?.recap)
              }}
            />
          ) : showNextCard ? (
            <NextCard
              state={state}
              loading={nextLoading}
              autoplay={settings.autoplayNext}
              secondsLeft={nextLeft}
              total={nextTotal}
              onPlay={() => goNext()}
              onCancel={() => setNextDismissed(true)}
            />
          ) : postPlayDue ? (
            <PostPlay imdbId={meta.id} due={postPlayDue} autoFocus={tvMode} onOpen={openPick} onClose={() => setPostPlayClosed(true)}>
              {skipButton}
            </PostPlay>
          ) : (
            skipButton
          )}
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
        {touch && (
          <button className="btn btn-ghost player-lock-btn" onClick={lockScreen} aria-label="Bloquear pantalla">
            <PlayerIcon name="lock" />
            <span>Bloquear</span>
          </button>
        )}
      </div>

      {locked && (
        // Tapa todo: ningún toque llega al video ni a los controles hasta tocar "Desbloquear".
        <div className="player-lock-layer" onPointerUp={revealUnlock} role="presentation">
          {unlockHint && (
            <button
              className="btn player-unlock-btn"
              onPointerUp={(e) => e.stopPropagation()}
              onClick={unlockScreen}
              autoFocus
            >
              <PlayerIcon name="unlock" />
              Desbloquear
            </button>
          )}
        </div>
      )}

      {menu && (
        <div
          className={`player-menu ${menu === 'sources' ? 'player-menu-wide' : ''} ${menu === 'quick' ? 'player-menu-quick' : ''}`}
          role={menu === 'quick' ? 'group' : 'menu'}
          aria-label={menu === 'quick' ? 'Ajustes rápidos' : undefined}
        >
          {menu === 'quick' && <QuickSettings fit={fit} onFit={(f) => setFit(f, false)} onChange={showControls} />}
          {menu === 'subs' && <SubtitleMenu subs={subs} isSeries={!!video} onInteract={showControls} />}
          {menu === 'audio' &&
            audioTracks.map((t) => (
              <button key={t.id} className={audioTrack === t.id ? 'active' : ''} onClick={() => selectAudio(t.id)}>
                {t.name}
              </button>
            ))}
          {menu === 'sources' && <SourcesMenu state={state} onPick={changeSource} />}
          {menu === 'speed' && (
            <SpeedMenu
              rate={rate}
              onPick={(r) => {
                changeRate(r, false)
                setMenu(null)
              }}
            />
          )}
          {menu === 'sleep' && (
            <>
              <span className="player-menu-title muted small">Temporizador</span>
              <button className={sleep.kind === 'off' ? 'active' : ''} onClick={() => chooseSleep(0)}>
                Desactivado
              </button>
              {[15, 30, 60].map((m) => (
                <button key={m} onClick={() => chooseSleep(m)}>
                  {m} minutos
                </button>
              ))}
              <button className={sleep.kind === 'episode' ? 'active' : ''} onClick={() => chooseSleep('episode')}>
                Fin del episodio
              </button>
            </>
          )}
        </div>
      )}

      <div className="player-controls">
        <input
          ref={seekbarRef}
          className="seekbar"
          type="range"
          min={0}
          max={duration || 0}
          step={1}
          value={scrub ? scrub.target : time}
          aria-label="Posición"
          aria-valuetext={formatTime(scrub ? scrub.target : time)}
          tabIndex={-1}
          onChange={(e) => {
            const s = scrubRef.current
            if (s) {
              setScrub(undefined)
              if (s.wasPlaying) videoRef.current?.play().catch(() => {})
            }
            if (videoRef.current) videoRef.current.currentTime = Number(e.target.value)
            showControls()
          }}
          style={{ ['--pct' as string]: duration ? `${((scrub ? scrub.target : time) / duration) * 100}%` : '0%' }}
        />
        <SeekPreview
          bar={seekbarRef}
          url={state.playUrl}
          duration={duration}
          enabled={settings.seekPreview && !saveDataOn()}
          scrubAt={scrub?.target}
        />
        <div className="controls-row">
          <button onClick={() => seek(-SEEK_STEP)} aria-label="Retroceder 10 segundos">
            <PlayerIcon name="back10" />
          </button>
          <button ref={playBtnRef} onClick={togglePlay} aria-label={playing ? 'Pausa' : 'Reproducir'} className="play-btn">
            <PlayerIcon name={playing ? 'pause' : 'play'} size={28} />
          </button>
          <button onClick={() => seek(SEEK_STEP)} aria-label="Adelantar 10 segundos">
            <PlayerIcon name="fwd10" />
          </button>
          <VolumeControl state={volume} onToggleMute={toggleMute} onSet={setVolume} />
          <span className="time">
            {formatTime(scrub ? scrub.target : time)} / {formatTime(duration)}
          </span>
          <span className="spacer" />
          <button onClick={(e) => toggleMenu('subs', e)} data-menu="subs" aria-label="Subtítulos" aria-expanded={menu === 'subs'}>
            CC
          </button>
          {audioTracks.length > 1 && (
            <button onClick={(e) => toggleMenu('audio', e)} aria-label="Idioma de audio" aria-expanded={menu === 'audio'}>
              Audio
            </button>
          )}
          <button onClick={(e) => toggleMenu('sources', e)} data-menu="sources" aria-label="Fuentes" aria-expanded={menu === 'sources'}>
            Fuentes
          </button>
          <button
            onClick={(e) => toggleMenu('speed', e)}
            data-menu="speed"
            aria-label={`Velocidad de reproducción: ${formatRate(rate)}`}
            aria-expanded={menu === 'speed'}
            className={`speed-btn ${rate !== 1 ? 'active' : ''}`}
          >
            {formatRate(rate)}
          </button>
          <button
            onClick={(e) => toggleMenu('sleep', e)}
            aria-label="Temporizador para dormir"
            aria-expanded={menu === 'sleep'}
            className={sleep.kind !== 'off' ? 'active' : ''}
          >
            <PlayerIcon name="moon" />
            {sleep.kind === 'time' ? `${sleepMinutesLeft} min` : sleep.kind === 'episode' ? 'Fin' : ''}
          </button>
          {settings.externalPlayer !== 'none' && (
            <button onClick={openExternal} aria-label={`Abrir en ${externalLaunch(settings.externalPlayer, state.playUrl, currentPlatform().os).label}`}>
              Abrir en…
            </button>
          )}
          {state.nextVideoId && (
            <button onClick={() => goNext()} disabled={nextLoading} aria-label="Siguiente episodio">
              {nextLoading ? '…' : '⏭ Siguiente'}
            </button>
          )}
          {pip.supported && (
            <button
              onClick={togglePip}
              aria-label={pip.active ? 'Cerrar la ventana flotante' : 'Ventana flotante (picture-in-picture)'}
              aria-pressed={pip.active}
              className={pip.active ? 'active' : ''}
            >
              <PlayerIcon name="pip" />
            </button>
          )}
          <button
            onClick={cycleFit}
            aria-label={`Imagen: ${FIT_LABELS[fit]} (${FIT_HINTS[fit]}). Cambiar entre ajustar, llenar y estirar`}
            className={`fit-btn ${fit !== 'contain' ? 'active' : ''}`}
          >
            <PlayerIcon name="fit" />
            <span className="fit-label">{FIT_LABELS[fit]}</span>
          </button>
          <button
            onClick={(e) => toggleMenu('quick', e)}
            data-menu="quick"
            aria-label="Ajustes rápidos"
            aria-expanded={menu === 'quick'}
          >
            <PlayerIcon name="gear" />
          </button>
          <button onClick={toggleFullscreen} aria-label="Pantalla completa">
            <PlayerIcon name="fullscreen" />
          </button>
        </div>
      </div>
    </div>
  )
}
