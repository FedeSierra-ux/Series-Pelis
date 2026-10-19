import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMeta, getSubtitles } from '../../lib/addons'
import { creditsPlan } from '../../lib/credits'
import { looksLikeStatusVideo } from '../../lib/debrid'
import { episodeLabel } from '../../lib/format'
import { useAddons, useTitle } from '../../lib/hooks'
import { nativePlayer, type NativePlayerEvent } from '../../lib/nativePlayer'
import { findNextStream, nextEpisodeSeason, prefetchNextStreams } from '../../lib/nextEpisode'
import { fetchOnlineSubs, streamText } from '../../lib/onlineSubs'
import { setReturnVideo } from '../../lib/returnVideo'
import { getSegments, imdbIdOf, type Segments } from '../../lib/segments'
import { addonsStore, progressStore, rememberTracks, saveProgress, settingsStore, trackPrefsStore, useStore } from '../../lib/store'
import { addonSubOption, audioPrefs, autoSubtitle, FORCED_RANK, lang3, langRank, type SubOption } from '../../lib/subtitlePrefs'
import { loadSubtitleText } from '../../lib/subtitles'
import type { PlayState } from '../Detail'
import { NEXT_FALLBACK_S, readAutoCount, writeAutoCount } from './autoNext'
import { isEmbedded, nativeStartAt, nativeSubList, nativeSubtitleStyle, shouldSaveProgress, withEmbedded } from './nativeHelpers'
import { nextEpisodeTitle } from './NextCard'
import { daysAway, RECAP_AFTER_DAYS } from './RecapOffer'
import type { Resume } from './SourcesMenu'
import { langName } from './useSubtitles'

// Reproductor nativo de la app de Android TV (v0.20). Android reproduce (Media3) y dibuja los botones encima
// de la web; esta vista no muestra nada: decide igual que el reproductor de la web (subtítulo automático,
// saltar intro/resumen, tarjeta del siguiente episodio, progreso) y se lo manda por `nativePlayer`.

const SAVE_EVERY_MS = 5000

/**
 * Cierre pendiente del reproductor nativo. Al pasar al siguiente episodio esta vista se desmonta y se monta
 * otra con el episodio nuevo: el cierre se posterga un instante y la vista nueva lo cancela, así Android
 * no se cierra entre un episodio y el otro.
 */
let closeTimer: ReturnType<typeof setTimeout> | undefined

/**
 * `onFallback`: Android no pudo con el video; `at` es dónde iba y `message`, lo que dijo Android.
 * `onDebridFail` (v0.27): el link de debrid dio el video de aviso de Torrentio (30 s), no el video.
 */
export function NativePlayerView({
  state,
  resume,
  onFallback,
  onDebridFail,
}: {
  state: PlayState
  resume?: Resume
  onFallback: (at: number, message?: string) => void
  onDebridFail?: (at: number) => void
}) {
  const navigate = useNavigate()
  const settings = useStore(settingsStore)
  const addons = useAddons()
  const { meta, video } = state
  const videoId = video?.id ?? meta.id
  const pref = useStore(trackPrefsStore)[meta.id]
  useTitle(video ? `${meta.name} ${episodeLabel(video.season, video.episode)}` : meta.name)

  /** Android ya cargó este video (hasta entonces los eventos pueden ser del episodio anterior). */
  const [ready, setReady] = useState(false)
  const readyRef = useRef(false)
  const [duration, setDuration] = useState(0)
  const [segments, setSegments] = useState<Segments | null>(null)
  const [subs, setSubs] = useState<SubOption[]>(() => (state.stream.subtitles ?? []).map(addonSubOption))
  const subsRef = useRef(subs)
  subsRef.current = subs
  const [audioLang, setAudioLang] = useState<string>()
  const [nextLabel, setNextLabel] = useState<string>()
  const alive = useRef(true)
  const advancing = useRef(false)
  const leaving = useRef(false)
  const last = useRef({ position: 0, duration: 0 })
  const lastSave = useRef(0)
  const prefetched = useRef(false)
  const active = useRef('')
  const userPicked = useRef(false)
  const autoRank = useRef(99)
  const request = useRef(0)
  // Después de N episodios seguidos sin tocar nada, arranca en pausa y pregunta.
  const askStill = useRef(settings.stillWatchingAfter > 0 && readAutoCount() >= settings.stillWatchingAfter)
  // Si hace mucho que no ve la serie, el resumen no se saltea solo (se calcula antes de guardar este episodio).
  const [awayDays] = useState(() => (video ? daysAway(meta.id) : undefined))
  const longAway = awayDays !== undefined && awayDays >= RECAP_AFTER_DAYS

  // ---------- Abrir / cerrar ----------
  useEffect(() => {
    clearTimeout(closeTimer)
    alive.current = true
    const s = settingsStore.get()
    nativePlayer.open({
      url: state.playUrl,
      title: meta.name,
      subtitle: video ? [episodeLabel(video.season, video.episode), video.title ?? video.name].filter(Boolean).join(' · ') : undefined,
      startAt: nativeStartAt(resume?.at, progressStore.get()[videoId]),
      paused: askStill.current || undefined,
      // Al venir de otra fuente, primero el idioma que se estaba escuchando.
      audioLangs: [...(resume?.audioLang ? [resume.audioLang] : []), ...audioPrefs(trackPrefsStore.get()[meta.id], s.audioLangs ?? [])],
      // Siempre 1× (sin botón ni teclas de velocidad).
      rate: 1,
      subtitleStyle: nativeSubtitleStyle(s.subtitleStyle),
    })
    return () => {
      alive.current = false
      closeTimer = setTimeout(() => nativePlayer.close(), 0)
    }
  }, [])

  // ---------- Progreso ----------
  const persist = useCallback(
    (position: number, dur: number) => {
      if (!shouldSaveProgress(position, dur, !!video)) return
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
        position,
        duration: dur,
      })
    },
    [videoId, meta, video],
  )

  const exit = () => {
    if (leaving.current) return
    leaving.current = true
    // Si pasó solo al siguiente episodio, la ficha de atrás todavía marca el anterior: le avisamos cuál se vio último.
    if (video) setReturnVideo({ metaId: meta.id, videoId: video.id, season: video.season })
    if (window.history.length > 1) navigate(-1)
    else navigate(`/detail/${meta.type}/${encodeURIComponent(meta.id)}`, { replace: true })
  }

  /** `auto`: lo pidió la cuenta regresiva o el final del video, no el usuario. */
  const goNext = async (auto: boolean) => {
    if (!state.nextVideoId || advancing.current || leaving.current) return
    advancing.current = true
    writeAutoCount(auto ? readAutoCount() + 1 : 0)
    persist(last.current.position, last.current.duration)
    nativePlayer.update({ loadingNext: true })
    const next = settingsStore.get().autoplayNext ? await findNextStream(state).catch(() => undefined) : undefined
    if (!alive.current) return
    if (next) {
      // Android sigue abierto: la vista del episodio nuevo le manda el video (ver `closeTimer`).
      navigate(`/watch/${meta.type}/${encodeURIComponent(next.video!.id)}`, { state: next, replace: true })
      return
    }
    // Sin stream para seguir solo, a la ficha en el siguiente episodio (con su temporada).
    const season = (await nextEpisodeSeason(state).catch(() => undefined)) ?? video?.season ?? 1
    if (!alive.current) return
    leaving.current = true
    nativePlayer.close()
    navigate(`/detail/${meta.type}/${encodeURIComponent(meta.id)}?season=${season}&video=${encodeURIComponent(state.nextVideoId)}`, { replace: true })
  }

  // ---------- Subtítulos ----------
  // Los de los addons de subtítulos (OpenSubtitles, etc.).
  useEffect(() => {
    let on = true
    getSubtitles(addons, meta.type, videoId).then((found) => {
      if (!on || found.length === 0) return
      setSubs((prev) => {
        const seen = new Set(prev.map((s) => s.url))
        return [...prev, ...found.filter((s) => !seen.has(s.url)).map(addonSubOption)]
      })
    })
    return () => {
      on = false
    }
  }, [addons, meta.type, videoId])

  // Los online en latino, si el español está entre los idiomas.
  const wantsSpanish = langRank('spa', settings.subtitleLangs) < 99 || pref?.subLang === 'spa'
  const hint = streamText(state.stream)
  useEffect(() => {
    if (!wantsSpanish) return
    let on = true
    fetchOnlineSubs(meta.type, videoId, hint).then((found) => {
      if (!on || found.length === 0) return
      setSubs((prev) => {
        const seen = new Set(prev.map((s) => s.url))
        return [...prev, ...found.filter((s) => !seen.has(s.url))]
      })
    })
    return () => {
      on = false
    }
  }, [wantsSpanish, meta.type, videoId, hint])

  /** Activa un subtítulo: '' apaga, `emb:` es del video, el resto se baja acá (con la sesión) y va como VTT. */
  const pickSub = async (id: string, user: boolean) => {
    const req = ++request.current
    if (user) {
      userPicked.current = true
      writeAutoCount(0)
    }
    const option = subsRef.current.find((s) => s.url === id)
    if (id && !isEmbedded(id)) {
      let vtt: string
      try {
        vtt = await loadSubtitleText(id, { stripSdh: settingsStore.get().hideSdh })
      } catch {
        if (req !== request.current || !alive.current) return
        // Sigue el que estaba.
        nativePlayer.update({ selectSub: active.current, ...(user ? { toast: 'No se pudo cargar ese subtítulo' } : {}) })
        return
      }
      if (req !== request.current || !alive.current) return
      nativePlayer.update({ selectSub: id })
      nativePlayer.subtitleData(id, vtt)
    } else {
      nativePlayer.update({ selectSub: id })
    }
    active.current = id
    if (user) {
      if (!id) rememberTracks(meta.id, { subOff: true, subLang: undefined, subForced: undefined })
      else if (option?.lang) rememberTracks(meta.id, { subOff: false, subLang: lang3(option.lang), subForced: !!option.forced })
    }
  }

  // Al venir de otra fuente: el subtítulo que estaba, sin pisarlo con el automático.
  useEffect(() => {
    if (!ready || resume?.sub === undefined) return
    userPicked.current = true
    void pickSub(resume.sub, false)
  }, [ready])

  // Subtítulo automático, con las mismas reglas que la web (si después llega uno mejor, se cambia).
  useEffect(() => {
    if (!ready || userPicked.current || subs.length === 0) return
    const found = autoSubtitle(subs, {
      pref,
      autoSubtitles: settings.autoSubtitles,
      subtitleLangs: settings.subtitleLangs,
      audioLangs: settings.audioLangs,
      audioLang,
      hideSdh: settings.hideSdh,
    })
    if (found && (found.rank < autoRank.current || (found.rank === FORCED_RANK && found.option.url !== active.current && autoRank.current === FORCED_RANK))) {
      autoRank.current = found.rank
      void pickSub(found.option.url, false)
    } else if (!found && autoRank.current === FORCED_RANK) {
      // Cambió el audio a uno que no necesita forzados.
      autoRank.current = 99
      void pickSub('', false)
    }
  }, [ready, subs, pref, settings.autoSubtitles, settings.subtitleLangs, settings.audioLangs, settings.hideSdh, audioLang])

  // La lista para el menú de Android (las pistas del video las agrega Android).
  useEffect(() => {
    if (!ready) return
    const langs = pref?.subLang ? [pref.subLang, ...settings.subtitleLangs] : settings.subtitleLangs
    nativePlayer.update({ subtitles: nativeSubList(subs, { hideSdh: settings.hideSdh, langs, active: active.current }, langName) })
  }, [ready, subs, settings.hideSdh, settings.subtitleLangs, pref?.subLang])

  // ---------- Intro / resumen / siguiente episodio ----------
  useEffect(() => {
    let on = true
    getSegments(imdbIdOf(meta.id, video?.id), video?.season, video?.episode).then((s) => {
      if (on) setSegments(s)
    })
    return () => {
      on = false
    }
  }, [meta.id, video?.id, video?.season, video?.episode])

  useEffect(() => {
    const nextId = state.nextVideoId
    if (!nextId) return
    let on = true
    getMeta(addonsStore.get(), meta.type, meta.id)
      .then((m) => {
        if (on) setNextLabel(nextEpisodeTitle(m.videos?.find((v) => v.id === nextId)) || undefined)
      })
      .catch(() => {})
    return () => {
      on = false
    }
  }, [meta.type, meta.id, state.nextVideoId])

  // Con escena post-créditos, la tarjeta sale al terminar los créditos y no cuenta sola (como en la web).
  const plan = creditsPlan(segments, duration, !!state.nextVideoId, NEXT_FALLBACK_S)
  useEffect(() => {
    if (!ready) return
    nativePlayer.update({
      intro: segments?.intro ?? null,
      recap: segments?.recap ?? null,
      skipMode: settings.skipSegments,
      recapAuto: !longAway,
      nextAt: plan.nextAt ?? null,
      autoplayNext: settings.autoplayNext && !plan.afterCredits,
    })
  }, [ready, segments, settings.skipSegments, longAway, plan.nextAt, plan.afterCredits, settings.autoplayNext])

  useEffect(() => {
    if (ready && nextLabel) nativePlayer.update({ nextLabel })
  }, [ready, nextLabel])

  // ---------- Eventos de Android ----------
  const onEvent = (e: NativePlayerEvent) => {
    switch (e.type) {
      case 'ready':
        // Sin marcarlo como listo: así no se guarda el progreso del aviso.
        if (onDebridFail && looksLikeStatusVideo(e.duration)) {
          onDebridFail(resume?.at ?? 0)
          return
        }
        readyRef.current = true
        setReady(true)
        if (e.duration > 0) setDuration(e.duration)
        // v0.27: por qué arrancó así (por ejemplo, por torrent en vez del debrid).
        if (resume?.note) nativePlayer.update({ toast: resume.note })
        if (askStill.current) nativePlayer.update({ toast: '¿Seguís viendo? Apretá OK para seguir' })
        break
      case 'progress': {
        // Retomando más allá del final del aviso, Android puede no mandar nunca `ready`.
        if (!readyRef.current && onDebridFail && looksLikeStatusVideo(e.duration)) return onDebridFail(resume?.at ?? 0)
        if (!readyRef.current) return
        last.current = { position: e.position, duration: e.duration }
        if (e.duration > 0) setDuration(e.duration)
        if (e.playing && askStill.current) {
          // Le dio play a la pregunta: hay alguien mirando.
          askStill.current = false
          writeAutoCount(0)
        }
        const now = Date.now()
        if (e.playing && now - lastSave.current >= SAVE_EVERY_MS) {
          lastSave.current = now
          persist(e.position, e.duration)
        }
        // Al pasar el 70% se buscan de antemano los streams del siguiente episodio.
        if (!prefetched.current && state.nextVideoId && e.duration > 0 && e.position / e.duration >= 0.7) {
          prefetched.current = true
          prefetchNextStreams(state)
        }
        break
      }
      case 'tracks':
        if (!readyRef.current) return
        setSubs((prev) => withEmbedded(prev, e.text))
        setAudioLang(e.audio.find((a) => a.selected)?.lang)
        break
      case 'audioPicked':
        writeAutoCount(0)
        setAudioLang(e.lang)
        if (e.lang) rememberTracks(meta.id, { audioLang: lang3(e.lang) })
        break
      case 'subPicked':
        void pickSub(e.id, true)
        break
      case 'next':
        void goNext(e.auto)
        break
      case 'ended':
        if (!readyRef.current && onDebridFail) return onDebridFail(resume?.at ?? 0)
        if (!readyRef.current) return
        persist(last.current.duration, last.current.duration)
        if (state.nextVideoId && settingsStore.get().autoplayNext) void goNext(true)
        else {
          nativePlayer.close()
          exit()
        }
        break
      case 'closed':
        if (readyRef.current) persist(e.position, e.duration)
        exit()
        break
      case 'error':
        // v0.27: un link de debrid que falla antes de arrancar es casi siempre el debrid (Android sí abre MKV).
        if (!readyRef.current && onDebridFail) return onDebridFail(resume?.at ?? 0)
        // Android no pudo con este video: sigue el reproductor de la web desde el mismo lugar.
        if (readyRef.current) persist(last.current.position, last.current.duration)
        onFallback(readyRef.current ? e.position || last.current.position : 0, e.message)
        break
    }
  }
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  useEffect(() => {
    const stop = nativePlayer.listen((e) => onEventRef.current(e))
    return stop
  }, [])

  // Android dibuja todo encima; atrás queda negro (por si se ve un instante al abrir o cerrar).
  return <div className="player player-native" aria-label={`Reproduciendo ${meta.name}`} />
}
