import type Hls from 'hls.js'
import type { MediaPlaylist } from 'hls.js'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type RefObject } from 'react'
import { getSubtitles } from '../../lib/addons'
import { emptyVttUrl, feedVideoSubs, videoSubOptions, type VideoSubsSource } from '../../lib/embeddedSubs'
import { useAddons } from '../../lib/hooks'
import { langLabel } from '../../lib/i18n'
import { fetchOnlineSubs, streamText } from '../../lib/onlineSubs'
import { forgetTracks, rememberTracks, settingsStore, trackPrefsStore, useStore } from '../../lib/store'
import {
  FORCED_RANK,
  addonSubOption,
  autoSubtitle,
  canShiftCueBox,
  cuePlacement,
  lang3,
  langRank,
  langTag,
  looksForced,
  looksSdh,
  placeCue,
  subLangName,
  subMenuLabels,
  type SubOption,
} from '../../lib/subtitlePrefs'
import { SUBTITLE_FILE_RE, loadSubtitle, loadSubtitleFile } from '../../lib/subtitles'
import type { PlayState } from '../Detail'

// Subtítulos del reproductor: los de los addons, los del stream HLS, los del propio video (app de Windows) y los
// archivos propios.

const hlsKey = (i: number) => `hls:${i}`
/** Pistas HLS que marcan descripciones de sonidos (subtítulos para sordos). */
const SDH_CHARACTERISTICS = /describes-music-and-sound|transcribes-spoken-dialog/

/** Nombre del idioma en español, con la tabla de la app primero ("tur" → "Turco"). */
export const langName = (code: string | undefined) => subLangName(code, langLabel)

/** Nombre de un subtítulo (para la pista `<track>`, que ven el menú nativo, PiP y los lectores de pantalla). */
export function subLabel(o: SubOption) {
  return o.label ?? langName(o.lang)
}

export function useSubtitles({
  videoRef,
  hlsRef,
  state,
  audioLang,
  flash,
  closeMenu,
  controlsClear = 0,
  cueBottom = 0,
  videoSubs,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  hlsRef: RefObject<Hls | null>
  state: PlayState
  /** Idioma del audio que suena, para los forzados automáticos. */
  audioLang?: string
  flash: (msg: string) => void
  closeMenu: () => void
  /** % de abajo que tapa la barra de controles (0 si está oculta): los subtítulos suben para no quedar debajo. */
  controlsClear?: number
  /**
   * % desde arriba donde tiene que terminar el subtítulo, tenga los renglones que tenga (0 = no se usa). Lo
   * pone el celular con controles cuando hay algo en la esquina ("Saltar", siguiente episodio…).
   */
  cueBottom?: number
  /** v0.30.1: pistas de texto del video que saca el motor de la app de Windows. */
  videoSubs?: VideoSubsSource
}) {
  const addons = useAddons()
  const settings = useStore(settingsStore)
  const metaId = state.meta.id
  const pref = useStore(trackPrefsStore)[metaId]
  const videoId = state.video?.id ?? metaId
  const [subs, setSubs] = useState<SubOption[]>(() => [
    ...(state.stream.subtitles ?? []).map(addonSubOption),
    ...(videoSubs ? videoSubOptions(videoSubs.probe, langName) : []),
  ])
  const subsRef = useRef(subs)
  subsRef.current = subs
  const [active, setActiveState] = useState('')
  const activeRef = useRef('')
  const [delay, setDelay] = useState(0)
  const delayRef = useRef(0)
  const positionRef = useRef(settings.subtitleStyle.position)
  positionRef.current = settings.subtitleStyle.position
  const clearRef = useRef(controlsClear)
  clearRef.current = controlsClear
  const bottomRef = useRef(cueBottom)
  bottomRef.current = cueBottom
  const userPicked = useRef(false)
  const autoRank = useRef(99)
  const request = useRef(0)
  const cueOrigin = useRef(new WeakMap<TextTrackCue, [number, number]>())
  /** Frena la carga por tramos de la pista del video activa. */
  const stopFeed = useRef<(() => void) | undefined>(undefined)
  useEffect(
    () => () => {
      stopFeed.current?.()
    },
    [],
  )
  /** Pista HLS a recuperar al cambiar de fuente: se elige cuando hls.js la anuncia. */
  const pendingHls = useRef('')
  const [dragging, setDragging] = useState(false)

  const setActive = (url: string) => {
    activeRef.current = url
    setActiveState(url)
  }

  // Subtítulos de los addons de subtítulos (OpenSubtitles, etc.).
  useEffect(() => {
    let alive = true
    getSubtitles(addons, state.meta.type, videoId).then((found) => {
      if (!alive || found.length === 0) return
      setSubs((prev) => {
        const seen = new Set(prev.map((s) => s.url))
        return [...prev, ...found.filter((s) => !seen.has(s.url)).map(addonSubOption)]
      })
    })
    return () => {
      alive = false
    }
  }, [addons, state.meta.type, videoId])

  // Subtítulos online en español (SubDL / OpenSubtitles por /api/subs), si el español está entre los idiomas.
  const wantsSpanish = langRank('spa', settings.subtitleLangs) < 99 || pref?.subLang === 'spa'
  const hint = streamText(state.stream)
  useEffect(() => {
    if (!wantsSpanish) return
    let alive = true
    fetchOnlineSubs(state.meta.type, videoId, hint).then((found) => {
      if (!alive || found.length === 0) return
      setSubs((prev) => {
        const seen = new Set(prev.map((s) => s.url))
        return [...prev, ...found.filter((s) => !seen.has(s.url))]
      })
    })
    return () => {
      alive = false
    }
  }, [wantsSpanish, state.meta.type, videoId, hint])

  /** Retraso (positivo = los subtítulos aparecen más tarde) y altura de los cues de la pista activa. */
  const adjustCues = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    const d = delayRef.current
    // Con `cueBottom` en Chromium los cues quedan en auto y sube la caja entera (ver `cuePlacement`).
    const shiftBox = canShiftCueBox()
    const { shift } = cuePlacement(positionRef.current, clearRef.current, bottomRef.current, shiftBox)
    const shiftPx = shift > 0 ? Math.round((shift / 100) * el.clientHeight) : 0
    if (shiftPx > 0) {
      el.style.setProperty('--sp-sub-shift', `${shiftPx}px`)
      el.dataset.subShift = ''
    } else if (el.dataset.subShift !== undefined) {
      el.style.removeProperty('--sp-sub-shift')
      delete el.dataset.subShift
    }
    for (const track of Array.from(el.textTracks)) {
      if (track.mode !== 'showing' || !track.cues) continue
      for (const cue of Array.from(track.cues)) {
        let orig = cueOrigin.current.get(cue)
        if (!orig) {
          orig = [cue.startTime, cue.endTime]
          cueOrigin.current.set(cue, orig)
        }
        const start = Math.max(0, orig[0] + d)
        const end = Math.max(0, orig[1] + d)
        if (cue.startTime !== start) cue.startTime = start
        if (cue.endTime !== end) cue.endTime = end
        placeCue(cue, positionRef.current, clearRef.current, bottomRef.current, shiftBox)
      }
    }
  }, [videoRef])

  // Las pistas HLS van recibiendo cues mientras se reproduce.
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const tracks = el.textTracks
    const watch = (t: TextTrack) => t.addEventListener('cuechange', adjustCues)
    Array.from(tracks).forEach(watch)
    const onAdd = (e: TrackEvent) => e.track && watch(e.track as TextTrack)
    tracks.addEventListener('addtrack', onAdd)
    return () => {
      tracks.removeEventListener('addtrack', onAdd)
      Array.from(tracks).forEach((t) => t.removeEventListener('cuechange', adjustCues))
    }
  }, [videoRef, adjustCues])

  useEffect(adjustCues, [settings.subtitleStyle.position, controlsClear, cueBottom, adjustCues])

  const changeDelay = (delta: number) => {
    const next = Math.round((delayRef.current + delta) * 10) / 10
    delayRef.current = next
    setDelay(next)
    adjustCues()
  }

  const select = async (url: string, auto = false, given?: SubOption, fallbackLabel?: string) => {
    const el = videoRef.current
    const req = ++request.current
    const option = given ?? subsRef.current.find((s) => s.url === url)
    if (!auto) {
      userPicked.current = true
      closeMenu()
    }
    // Primero se baja el archivo: si falla, sigue el subtítulo que estaba (antes quedaban apagados).
    let src: string | undefined
    const fromVideo = option?.embedded !== undefined && videoSubs ? option.embedded : undefined
    if (url && option?.hls === undefined && fromVideo === undefined) {
      try {
        src = await loadSubtitle(url, { stripSdh: settingsStore.get().hideSdh })
      } catch {
        if (req !== request.current) return
        if (!auto) flash(activeRef.current ? 'No se pudo cargar ese subtítulo: sigue el anterior' : 'No se pudo cargar ese subtítulo')
        return
      }
      if (req !== request.current) return
    }
    if (!auto) {
      // Se recuerda para este título; los archivos propios no tienen idioma.
      if (!url) rememberTracks(metaId, { subOff: true, subLang: undefined, subForced: undefined })
      else if (option && !option.file && option.lang) rememberTracks(metaId, { subOff: false, subLang: lang3(option.lang), subForced: !!option.forced })
    }
    setActive(url)
    stopFeed.current?.()
    stopFeed.current = undefined
    if (!el) return
    // Solo se borran los <track> propios: hls.js también crea los suyos (y uno de metadatos).
    Array.from(el.querySelectorAll('track[data-sp-sub]')).forEach((t) => t.remove())
    for (const t of Array.from(el.textTracks)) if (t.kind !== 'metadata') t.mode = 'disabled'
    const hls = hlsRef.current
    if (hls) {
      hls.subtitleTrack = -1
      if (option?.hls !== undefined) {
        hls.subtitleDisplay = true
        hls.subtitleTrack = option.hls
      }
    }
    // La del video arranca vacía y se va llenando por tramos.
    if (fromVideo !== undefined) src = emptyVttUrl()
    if (!src) return
    const track = document.createElement('track')
    track.kind = 'subtitles'
    // Idioma de la pista (BCP 47): los archivos propios no lo saben.
    const srclang = option?.lang ? langTag(option.lang) : ''
    if (srclang) track.srclang = srclang
    // Al cambiar de fuente la lista todavía no llegó: vale el nombre que traía la fuente anterior.
    track.label = option ? subLabel(option) : fallbackLabel || 'Subtítulos'
    track.src = src
    track.default = true
    track.dataset.spSub = ''
    track.addEventListener('load', adjustCues)
    if (fromVideo !== undefined && videoSubs) {
      // Recién con el archivo vacío cargado: antes, el navegador borraría los cues que se suman.
      track.addEventListener(
        'load',
        () => {
          if (activeRef.current !== url || !track.isConnected) return
          stopFeed.current?.()
          stopFeed.current = feedVideoSubs({
            video: el,
            track: track.track,
            source: videoSubs,
            index: fromVideo,
            stripSdh: settingsStore.get().hideSdh,
            onCues: adjustCues,
          })
        },
        { once: true },
      )
    }
    el.appendChild(track)
    track.track.mode = 'showing'
  }

  // Subtítulo automático: lo elegido para este título, el primer idioma preferido o, si no hay
  // ninguno activo, los forzados en el idioma del audio. Si después llega uno mejor ubicado
  // (otro addon), se cambia mientras el usuario no elija.
  useEffect(() => {
    if (userPicked.current || subs.length === 0) return
    const found = autoSubtitle(subs, {
      pref,
      autoSubtitles: settings.autoSubtitles,
      subtitleLangs: settings.subtitleLangs,
      audioLangs: settings.audioLangs,
      audioLang,
      hideSdh: settings.hideSdh,
    })
    if (found && (found.rank < autoRank.current || (found.rank === FORCED_RANK && found.option.url !== activeRef.current && autoRank.current === FORCED_RANK))) {
      autoRank.current = found.rank
      select(found.option.url, true)
    } else if (!found && autoRank.current === FORCED_RANK) {
      // Cambió el audio a uno que no necesita forzados.
      autoRank.current = 99
      select('', true)
    }
  }, [subs, pref, settings.autoSubtitles, settings.subtitleLangs, settings.audioLangs, settings.hideSdh, audioLang])

  // ---------- HLS ----------
  const onHlsTracks = useCallback((tracks: MediaPlaylist[]) => {
    setSubs((prev) => [
      ...prev.filter((s) => s.hls === undefined),
      ...tracks.map((t, i) => ({
        url: hlsKey(i),
        lang: t.lang ?? '',
        label: t.name || (t.lang ? langName(t.lang) : `Pista ${i + 1}`),
        hls: i,
        forced: t.forced || looksForced(t.name),
        sdh: looksSdh(t.name) || SDH_CHARACTERISTICS.test(t.characteristics ?? ''),
      })),
    ])
  }, [])

  /**
   * hls.js puede activar solo una pista marcada por defecto: si no hay nada elegido, que el menú
   * lo muestre; si había otra cosa elegida, se vuelve a lo elegido.
   */
  const onHlsSwitch = useCallback(
    (id: number) => {
      const want = activeRef.current
      if (id < 0 || want === hlsKey(id)) return
      if (want === '' && !userPicked.current) {
        activeRef.current = hlsKey(id)
        setActiveState(hlsKey(id))
      } else if (hlsRef.current) {
        hlsRef.current.subtitleTrack = want.startsWith('hls:') ? Number(want.slice(4)) : -1
      }
    },
    [hlsRef],
  )

  useEffect(() => {
    const want = pendingHls.current
    if (!want || !subs.some((s) => s.url === want)) return
    pendingHls.current = ''
    select(want, true)
  }, [subs])

  /** Al cambiar de fuente: el subtítulo y el retraso que estaban activos, sin pisarlos con el automático. */
  const restore = (url: string, d: number, label?: string) => {
    userPicked.current = true
    delayRef.current = d
    setDelay(d)
    // Estaban apagados: también hay que invalidar el automático que ya arrancó (los forzados no miran `subOff`).
    if (!url) {
      void select('', true)
      return
    }
    if (url.startsWith('hls:')) pendingHls.current = url
    else select(url, true, undefined, label)
  }

  // ---------- Archivo propio ----------
  const loadFile = async (file: File) => {
    try {
      const url = await loadSubtitleFile(file)
      const option: SubOption = { url, lang: '', id: file.name, label: `Archivo: ${file.name}`, file: true }
      setSubs((prev) => [...prev, option])
      await select(url, false, option)
      flash(`Subtítulo cargado: ${file.name}`)
    } catch (err) {
      flash(err instanceof Error && err.message === 'Formato no soportado' ? 'Solo se pueden cargar archivos .srt, .vtt, .ass o .ssa' : 'No se pudo leer ese archivo de subtítulos')
    }
  }

  /** Abre el selector de archivos (el input no vive en el menú: el menú se cierra solo). */
  const pickFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.srt,.vtt,.ass,.ssa,text/vtt'
    input.onchange = () => {
      const file = input.files?.[0]
      if (file) loadFile(file)
    }
    input.click()
  }

  const isFileDrag = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files')
  const dropProps = {
    onDragOver: (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDragging(true)
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
    },
    onDrop: (e: DragEvent) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      setDragging(false)
      const file = Array.from(e.dataTransfer.files).find((f) => SUBTITLE_FILE_RE.test(f.name)) ?? e.dataTransfer.files[0]
      if (file) loadFile(file)
    },
  }

  // ---------- Menú ----------
  const options = useMemo(() => {
    const visible = subs.filter((s) => !(settings.hideSdh && s.sdh) || s.url === active)
    const langs = pref?.subLang ? [pref.subLang, ...settings.subtitleLangs] : settings.subtitleLangs
    // Los archivos propios arriba; después los idiomas preferidos y el resto por nombre ("Alemán", "Turco"…).
    return visible.sort(
      (a, b) =>
        Number(!!b.file) - Number(!!a.file) ||
        langRank(a.lang, langs) - langRank(b.lang, langs) ||
        (a.label ?? langName(a.lang)).localeCompare(b.label ?? langName(b.lang), 'es'),
    )
  }, [subs, settings.hideSdh, settings.subtitleLangs, pref?.subLang, active])

  /** Textos del menú, sin ids internos: los repetidos se numeran. */
  const labels = useMemo(() => subMenuLabels(options, langName), [options])

  /**
   * Los que se ven de entrada: idiomas preferidos, archivos propios, pistas del stream y el activo. El resto
   * (OpenSubtitles trae decenas de idiomas) queda detrás de "Otros idiomas", así en la TV no es una lista eterna.
   */
  const featured = useMemo(() => {
    const langs = pref?.subLang ? [pref.subLang, ...settings.subtitleLangs] : settings.subtitleLangs
    return options.map((o) => !!o.file || o.hls !== undefined || o.url === active || langRank(o.lang, langs) < 99)
  }, [options, pref?.subLang, settings.subtitleLangs, active])

  /** Nombre del subtítulo activo (para llevarlo al cambiar de fuente). */
  const activeLabel = () => {
    const o = subsRef.current.find((s) => s.url === activeRef.current)
    return o ? subLabel(o) : undefined
  }

  const forget = () => {
    forgetTracks(metaId)
    closeMenu()
    flash('Listo: se vuelven a usar los idiomas de Ajustes')
  }

  return { options, labels, featured, activeLabel, active, delay, changeDelay, select, pickFile, dropProps, dragging, onHlsTracks, onHlsSwitch, hasPref: !!pref, forget, restore }
}

export type SubtitlesApi = ReturnType<typeof useSubtitles>
