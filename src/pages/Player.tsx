import type Hls from 'hls.js'
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { getSubtitles } from '../lib/addons'
import { episodeLabel, formatTime, isHls } from '../lib/format'
import { useAddons, useTitle } from '../lib/hooks'
import { langLabel } from '../lib/i18n'
import { findNextStream, prefetchNextStreams } from '../lib/nextEpisode'
import { getSegments, imdbIdOf, type Segment, type Segments } from '../lib/segments'
import { progressStore, saveProgress, settingsStore, useStore } from '../lib/store'
import { loadSubtitle } from '../lib/subtitles'
import type { Subtitle } from '../lib/types'
import type { PlayState } from './Detail'

const SAVE_EVERY_MS = 5000
const HIDE_CONTROLS_MS = 3500
const SEEK_STEP = 10
const NEXT_COUNTDOWN_S = 10
/** Sin datos de créditos, la tarjeta del siguiente episodio aparece este tiempo antes del final. */
const NEXT_FALLBACK_S = 30
const SUB_DELAY_STEP = 0.5
/** Episodios seguidos que pasaron solos, sin que nadie toque nada (para el "¿Seguís viendo?"). */
const AUTONEXT_KEY = 'sp-autonext-count'
const SLEEP_KEY = 'sp-sleep-at'

type Menu = 'subs' | 'audio' | 'sleep'
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
const readAutoCount = () => Number(sessionGet(AUTONEXT_KEY)) || 0

const isAndroid = () => /android/i.test(navigator.userAgent)
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

function androidIntent(url: string, pkg?: string) {
  const noScheme = url.replace(/^https?:\/\//, '')
  const scheme = url.startsWith('https') ? 'https' : 'http'
  return `intent://${noScheme}#Intent;scheme=${scheme};type=video/*;${pkg ? `package=${pkg};` : ''}end`
}

function externalPlayerUrl(url: string) {
  // En Android/Fire TV abre el selector de reproductores (VLC, MX Player, Just Player...).
  return isAndroid() ? androidIntent(url) : undefined
}

/** Abre un esquema propio (vlc://, intent://) sin sacar al usuario de la app si no hay nada instalado. */
function launchUrl(url: string) {
  if (isAndroid() || isIOS()) {
    window.location.href = url
    return
  }
  // En la PC un iframe evita la página de error de Firefox si VLC no registró el esquema.
  const frame = document.createElement('iframe')
  frame.style.display = 'none'
  frame.src = url
  document.body.appendChild(frame)
  setTimeout(() => frame.remove(), 3000)
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

// Los addons y las pistas HLS mezclan códigos de 2 y 3 letras.
const LANG3: Record<string, string> = { es: 'spa', spl: 'spa', en: 'eng', pt: 'por', pob: 'por', fr: 'fre', fra: 'fre', de: 'ger', deu: 'ger', it: 'ita', ja: 'jpn', ko: 'kor' }
function lang3(code?: string) {
  const c = (code ?? '').toLowerCase()
  return LANG3[c] ?? LANG3[c.split(/[-_]/)[0]] ?? c.split(/[-_]/)[0]
}
/** Posición del idioma en las preferencias (99 si no está). */
function langRank(code: string | undefined, prefs: string[]) {
  const i = prefs.map(lang3).indexOf(lang3(code))
  return i < 0 ? 99 : i
}

const formatDelay = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toLocaleString('es-AR')} s`

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
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const menuOpener = useRef<HTMLElement | null>(null)
  const advancing = useRef(false)
  const userPickedSub = useRef(false)
  const userPickedAudio = useRef(false)
  const autoSubRank = useRef(99)
  const subRequest = useRef(0)
  const subDelayRef = useRef(0)
  const cueOrigin = useRef(new WeakMap<TextTrackCue, [number, number]>())
  const autoSkipped = useRef(new Set<string>())

  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(true)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [controls, setControls] = useState(true)
  const [error, setError] = useState<string>()
  const [toast, setToast] = useState<string>()
  const [resumedFrom, setResumedFrom] = useState<number>()
  const [subs, setSubs] = useState<Subtitle[]>(state.stream.subtitles ?? [])
  const [activeSub, setActiveSub] = useState<string>('')
  const [subDelay, setSubDelay] = useState(0)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [audioTracks, setAudioTracks] = useState<{ id: number; name: string }[]>([])
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
  // Después de N episodios seguidos sin tocar nada, el siguiente arranca en pausa y pregunta.
  const [askStill, setAskStill] = useState(() => settings.stillWatchingAfter > 0 && readAutoCount() >= settings.stillWatchingAfter)
  const askStillRef = useRef(askStill)

  const { meta, video } = state
  const videoId = video?.id ?? meta.id
  useTitle(video ? `${meta.name} ${episodeLabel(video.season, video.episode)}` : meta.name)

  const flash = useCallback((msg: string) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(undefined), 4000)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // ---------- Carga del video ----------
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const url = state.playUrl
    let disposed = false

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
          setAudioTracks(data.audioTracks.map((t, i) => ({ id: i, name: t.name || langLabel(t.lang ?? '') || `Pista ${i + 1}` })))
          // Primera pista en el idioma de audio preferido.
          if (!userPickedAudio.current) {
            const prefs = settingsStore.get().audioLangs ?? []
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
    const reset = () => sessionSet(AUTONEXT_KEY, '0')
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

  const toggleMenu = (kind: Menu, e: MouseEvent<HTMLElement>) => {
    menuOpener.current = e.currentTarget
    setMenu(menu === kind ? null : kind)
    showControls()
  }

  const exit = useCallback(() => {
    persist()
    if (window.history.length > 1) navigate(-1)
    else navigate(`/detail/${meta.type}/${encodeURIComponent(meta.id)}`, { replace: true })
  }, [persist, navigate, meta.type, meta.id])

  /** `auto`: lo disparó la cuenta regresiva o el final del video, no el usuario. */
  const goNext = async (auto = false) => {
    if (!state.nextVideoId || advancing.current) return
    advancing.current = true
    sessionSet(AUTONEXT_KEY, String(auto ? readAutoCount() + 1 : 0))
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

  // ---------- Subtítulos ----------
  /** Corre los cues de la pista activa: positivo = los subtítulos aparecen más tarde. */
  const applySubDelay = (delay: number) => {
    const el = videoRef.current
    if (!el) return
    for (const track of Array.from(el.textTracks)) {
      if (track.mode !== 'showing' || !track.cues) continue
      for (const cue of Array.from(track.cues)) {
        let orig = cueOrigin.current.get(cue)
        if (!orig) {
          orig = [cue.startTime, cue.endTime]
          cueOrigin.current.set(cue, orig)
        }
        cue.startTime = Math.max(0, orig[0] + delay)
        cue.endTime = Math.max(0, orig[1] + delay)
      }
    }
  }

  const changeSubDelay = (delta: number) => {
    const next = Math.round((subDelayRef.current + delta) * 10) / 10
    subDelayRef.current = next
    setSubDelay(next)
    applySubDelay(next)
    showControls()
  }

  const selectSub = async (url: string, auto = false) => {
    const el = videoRef.current
    const req = ++subRequest.current
    if (!auto) {
      userPickedSub.current = true
      setMenu(null)
    }
    setActiveSub(url)
    if (!el) return
    Array.from(el.querySelectorAll('track')).forEach((t) => t.remove())
    for (const t of Array.from(el.textTracks)) t.mode = 'disabled'
    if (!url) return
    try {
      const src = await loadSubtitle(url)
      if (req !== subRequest.current) return
      const track = document.createElement('track')
      track.kind = 'subtitles'
      track.src = src
      track.default = true
      track.addEventListener('load', () => applySubDelay(subDelayRef.current))
      el.appendChild(track)
      track.track.mode = 'showing'
    } catch {
      if (req !== subRequest.current) return
      setActiveSub('')
      if (!auto) flash('No se pudo cargar ese subtítulo')
    }
  }

  // Subtítulo automático: el primero disponible según el orden de idiomas preferidos.
  // Si después llega uno de un idioma mejor ubicado (otro addon), se cambia mientras el usuario no elija.
  useEffect(() => {
    if (!settings.autoSubtitles || userPickedSub.current || subs.length === 0) return
    let best: Subtitle | undefined
    let bestRank = autoSubRank.current
    for (const s of subs) {
      const r = langRank(s.lang, settings.subtitleLangs)
      if (r < bestRank) {
        best = s
        bestRank = r
      }
    }
    if (best) {
      autoSubRank.current = bestRank
      selectSub(best.url, true)
    }
  }, [subs, settings.autoSubtitles, settings.subtitleLangs])

  const selectAudio = (id: number) => {
    userPickedAudio.current = true
    if (hlsRef.current) hlsRef.current.audioTrack = id
    setAudioTrack(id)
    setMenu(null)
  }

  // ---------- Intro / resumen / créditos ----------
  const inside = (s?: Segment) => !!s && duration > 0 && time >= s.start && time < Math.min(s.end, duration) - 0.5
  const skipKind: 'intro' | 'recap' | undefined =
    settings.skipSegments === 'off' || !segments ? undefined : inside(segments.recap) ? 'recap' : inside(segments.intro) ? 'intro' : undefined
  const inCredits = settings.skipSegments === 'button' && !state.nextVideoId && inside(segments?.outro)

  const skipTo = (seg?: Segment) => {
    const el = videoRef.current
    if (!el || !seg) return
    el.currentTime = Math.min(seg.end, el.duration || seg.end)
  }

  // Modo "saltar solo": una vez por segmento (si vuelve para atrás, lo respeta).
  useEffect(() => {
    if (!skipKind || settings.skipSegments !== 'auto' || autoSkipped.current.has(skipKind)) return
    autoSkipped.current.add(skipKind)
    skipTo(segments?.[skipKind])
    flash(skipKind === 'intro' ? 'Se saltó la intro' : 'Se saltó el resumen')
  }, [skipKind, settings.skipSegments])

  // Tarjeta del siguiente episodio: al empezar los créditos o, sin datos, 30 s antes del final.
  const outroStart = segments?.outro && segments.outro.start < duration - 1 ? segments.outro.start : undefined
  const nextAt =
    state.nextVideoId && duration > 0
      ? (outroStart ?? (duration > NEXT_FALLBACK_S * 4 ? duration - NEXT_FALLBACK_S : undefined))
      : undefined
  const nextDue = nextAt !== undefined && time >= nextAt

  useEffect(() => {
    if (!nextDue) {
      setNextDismissed(false)
      setCountdown(NEXT_COUNTDOWN_S)
    } else if (sleep.kind === 'episode') fireSleep()
  }, [nextDue])

  const showNextCard = nextDue && !nextDismissed && !sleepFired && !askStill && sleep.kind !== 'episode'

  useEffect(() => {
    if (!showNextCard || !settings.autoplayNext) return
    const t = setInterval(() => {
      // En pausa la cuenta regresiva también se frena.
      if (videoRef.current && !videoRef.current.paused) setCountdown((c) => c - 1)
    }, 1000)
    return () => clearInterval(t)
  }, [showNextCard, settings.autoplayNext])

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
    sessionSet(AUTONEXT_KEY, '0')
    videoRef.current?.play().catch(() => setControls(true))
  }

  // ---------- Reproductor externo ----------
  const openExternal = () => {
    const url = state.playUrl
    videoRef.current?.pause()
    persist()
    if (settings.externalPlayer === 'vlc') {
      // Se copia igual por si VLC no está instalado o el navegador bloquea el esquema.
      const copying = copyText(url)
      launchUrl(isAndroid() ? androidIntent(url, 'org.videolan.vlc') : `vlc://${url}`)
      copying.then((ok) => flash(ok ? 'Abriendo VLC… Si no abre, el enlace ya está copiado: pegalo en VLC' : 'Abriendo VLC…'))
      return
    }
    const intent = externalPlayerUrl(url)
    if (intent) {
      window.location.href = intent
      return
    }
    copyText(url).then((ok) => flash(ok ? 'Enlace copiado: pegalo en VLC' : 'No se pudo copiar el enlace'))
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

  /** Pasa el foco al botón anterior/siguiente dentro de `scope`. Devuelve false si no había adónde ir. */
  const moveFocus = (scope: Element | null | undefined, selector: string, from: Element | null, delta: number) => {
    const items = Array.from(scope?.querySelectorAll<HTMLElement>(selector) ?? [])
    const i = items.indexOf(from as HTMLElement)
    const target = items[i < 0 ? 0 : i + delta]
    target?.focus()
    return !!target
  }

  // Teclado y control remoto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null
      const focusedControl = active?.closest('.player-controls button, .player-menu button')
      // Botones flotantes (saltar intro, siguiente episodio) y carteles (error, temporizador, ¿seguís viendo?).
      const floating = active?.closest('.player-float')
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
          seek(delta * SEEK_STEP)
          return
        }
        case 'MediaFastForward':
          seek(SEEK_STEP * 3)
          return
        case 'MediaRewind':
          seek(-SEEK_STEP * 3)
          return
        case 'ArrowUp':
        case 'ArrowDown': {
          e.preventDefault()
          if (floating?.classList.contains('player-modal')) return
          showControls()
          const delta = e.key === 'ArrowDown' ? 1 : -1
          const menuEl = active?.closest('.player-menu')
          if (menuEl) {
            moveFocus(menuEl, 'button', active, delta)
            return
          }
          const corner = rootRef.current?.querySelector<HTMLElement>('.player-corner button')
          if (e.key === 'ArrowUp' && focusedControl && corner) corner.focus()
          else if (floating || !focusedControl) playBtnRef.current?.focus()
          return
        }
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

  const sortedSubs = [...subs].sort((a, b) => langRank(a.lang, settings.subtitleLangs) - langRank(b.lang, settings.subtitleLangs))
  const external = externalPlayerUrl(state.playUrl)
  const subStyle = settings.subtitleStyle
  const showSkip = !!skipKind && settings.skipSegments === 'button'
  const showCorner = !menu && !error && !askStill && !sleepFired && (showNextCard || showSkip || inCredits)

  return (
    <div
      ref={rootRef}
      className={`player ${controls ? 'show-controls' : ''} sub-size-${subStyle.size} sub-color-${subStyle.color} sub-bg-${subStyle.background}`}
      data-nav-disabled
      onMouseMove={showControls}
      onTouchStart={showControls}
    >
      <video
        ref={videoRef}
        className="player-video"
        playsInline
        autoPlay={!askStill}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
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

      {buffering && !error && !askStill && !sleepFired && <div className="player-spinner" aria-label="Cargando" />}

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

      {toast && (
        <div className="player-toast player-note" role="status">
          {toast}
        </div>
      )}

      {error && (
        <div className="player-error player-float player-modal" role="alert">
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
            <button className="btn" onClick={() => copyText(state.playUrl).then((ok) => flash(ok ? 'Enlace copiado' : 'No se pudo copiar el enlace'))}>
              Copiar enlace
            </button>
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
          {showNextCard ? (
            <div className="next-card" role="status">
              <strong>
                {nextLoading
                  ? 'Cargando el siguiente episodio…'
                  : settings.autoplayNext
                    ? `Siguiente episodio en ${Math.max(0, countdown)} s`
                    : 'Siguiente episodio'}
              </strong>
              <div className="next-card-actions">
                <button className="btn btn-primary btn-small" onClick={() => goNext()} disabled={nextLoading} autoFocus>
                  Ver ahora
                </button>
                <button className="btn btn-small" onClick={() => setNextDismissed(true)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              key={skipKind ?? 'credits'}
              className="btn skip-btn"
              autoFocus
              onClick={() => skipTo(skipKind ? segments?.[skipKind] : segments?.outro)}
            >
              {skipKind === 'intro' ? 'Saltar intro' : skipKind === 'recap' ? 'Saltar resumen' : 'Saltar créditos'}
            </button>
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
      </div>

      {menu && (
        <div className="player-menu" role="menu">
          {menu === 'subs' && (
            <>
              {activeSub && (
                <div className="sub-delay">
                  <button onClick={() => changeSubDelay(-SUB_DELAY_STEP)} aria-label="Subtítulos antes">
                    −
                  </button>
                  <span>
                    <span className="muted small">Retraso </span>
                    {formatDelay(subDelay)}
                  </span>
                  <button onClick={() => changeSubDelay(SUB_DELAY_STEP)} aria-label="Subtítulos después">
                    +
                  </button>
                </div>
              )}
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
            <button onClick={(e) => toggleMenu('subs', e)} aria-label="Subtítulos" aria-expanded={menu === 'subs'}>
              CC
            </button>
          )}
          {audioTracks.length > 1 && (
            <button onClick={(e) => toggleMenu('audio', e)} aria-label="Idioma de audio" aria-expanded={menu === 'audio'}>
              Audio
            </button>
          )}
          <button
            onClick={(e) => toggleMenu('sleep', e)}
            aria-label="Temporizador para dormir"
            aria-expanded={menu === 'sleep'}
            className={sleep.kind !== 'off' ? 'active' : ''}
          >
            ☾{sleep.kind === 'time' ? ` ${sleepMinutesLeft} min` : sleep.kind === 'episode' ? ' Fin' : ''}
          </button>
          {settings.externalPlayer !== 'none' && (
            <button onClick={openExternal} aria-label={settings.externalPlayer === 'vlc' ? 'Abrir en VLC' : 'Abrir en otro reproductor'}>
              Abrir en…
            </button>
          )}
          {state.nextVideoId && (
            <button onClick={() => goNext()} disabled={nextLoading} aria-label="Siguiente episodio">
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
