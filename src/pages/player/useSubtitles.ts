import type Hls from 'hls.js'
import type { MediaPlaylist } from 'hls.js'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type RefObject } from 'react'
import { getSubtitles } from '../../lib/addons'
import { useAddons } from '../../lib/hooks'
import { langLabel } from '../../lib/i18n'
import { forgetTracks, rememberTracks, settingsStore, trackPrefsStore, useStore } from '../../lib/store'
import { FORCED_RANK, addonSubOption, autoSubtitle, lang3, langRank, looksForced, looksSdh, placeCue, type SubOption } from '../../lib/subtitlePrefs'
import { SUBTITLE_FILE_RE, loadSubtitle, loadSubtitleFile } from '../../lib/subtitles'
import type { PlayState } from '../Detail'

// Subtítulos del reproductor: los de los addons, los del stream HLS y los archivos propios.

const hlsKey = (i: number) => `hls:${i}`
/** Pistas HLS que marcan descripciones de sonidos (subtítulos para sordos). */
const SDH_CHARACTERISTICS = /describes-music-and-sound|transcribes-spoken-dialog/

export function subLabel(o: SubOption) {
  // La marca va solo si el nombre no la dice ya.
  const tags = [o.forced && !looksForced(o.label, o.id) && 'Forzados', o.sdh && !looksSdh(o.label) && !looksSdh(o.id) && 'SDH'].filter(Boolean)
  return { main: o.label ?? langLabel(o.lang), extra: [o.file || o.hls !== undefined ? undefined : o.id, ...tags].filter(Boolean).join(' · ') }
}

export function useSubtitles({
  videoRef,
  hlsRef,
  state,
  audioLang,
  flash,
  closeMenu,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  hlsRef: RefObject<Hls | null>
  state: PlayState
  /** Idioma del audio que suena, para los forzados automáticos. */
  audioLang?: string
  flash: (msg: string) => void
  closeMenu: () => void
}) {
  const addons = useAddons()
  const settings = useStore(settingsStore)
  const metaId = state.meta.id
  const pref = useStore(trackPrefsStore)[metaId]
  const videoId = state.video?.id ?? metaId
  const [subs, setSubs] = useState<SubOption[]>(() => (state.stream.subtitles ?? []).map(addonSubOption))
  const subsRef = useRef(subs)
  subsRef.current = subs
  const [active, setActiveState] = useState('')
  const activeRef = useRef('')
  const [delay, setDelay] = useState(0)
  const delayRef = useRef(0)
  const positionRef = useRef(settings.subtitleStyle.position)
  positionRef.current = settings.subtitleStyle.position
  const userPicked = useRef(false)
  const autoRank = useRef(99)
  const request = useRef(0)
  const cueOrigin = useRef(new WeakMap<TextTrackCue, [number, number]>())
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

  /** Retraso (positivo = los subtítulos aparecen más tarde) y altura de los cues de la pista activa. */
  const adjustCues = useCallback(() => {
    const el = videoRef.current
    if (!el) return
    const d = delayRef.current
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
        placeCue(cue, positionRef.current)
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

  useEffect(adjustCues, [settings.subtitleStyle.position, adjustCues])

  const changeDelay = (delta: number) => {
    const next = Math.round((delayRef.current + delta) * 10) / 10
    delayRef.current = next
    setDelay(next)
    adjustCues()
  }

  const select = async (url: string, auto = false, given?: SubOption) => {
    const el = videoRef.current
    const req = ++request.current
    const option = given ?? subsRef.current.find((s) => s.url === url)
    if (!auto) {
      userPicked.current = true
      closeMenu()
      // Se recuerda para este título; los archivos propios no tienen idioma.
      if (!url) rememberTracks(metaId, { subOff: true, subLang: undefined, subForced: undefined })
      else if (option && !option.file && option.lang) rememberTracks(metaId, { subOff: false, subLang: lang3(option.lang), subForced: !!option.forced })
    }
    setActive(url)
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
    if (!url || option?.hls !== undefined) return
    try {
      const src = await loadSubtitle(url, { stripSdh: settingsStore.get().hideSdh })
      if (req !== request.current) return
      const track = document.createElement('track')
      track.kind = 'subtitles'
      track.label = option ? subLabel(option).main : ''
      track.src = src
      track.default = true
      track.dataset.spSub = ''
      track.addEventListener('load', adjustCues)
      el.appendChild(track)
      track.track.mode = 'showing'
    } catch {
      if (req !== request.current) return
      setActive('')
      if (!auto) flash('No se pudo cargar ese subtítulo')
    }
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
        label: t.name || langLabel(t.lang ?? '') || `Pista ${i + 1}`,
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
    // Los archivos propios arriba; después por idioma preferido.
    return visible.sort((a, b) => Number(!!b.file) - Number(!!a.file) || langRank(a.lang, langs) - langRank(b.lang, langs))
  }, [subs, settings.hideSdh, settings.subtitleLangs, pref?.subLang, active])

  const forget = () => {
    forgetTracks(metaId)
    closeMenu()
    flash('Listo: se vuelven a usar los idiomas de Ajustes')
  }

  return { options, active, delay, changeDelay, select, pickFile, dropProps, dragging, onHlsTracks, onHlsSwitch, hasPref: !!pref, forget }
}

export type SubtitlesApi = ReturnType<typeof useSubtitles>
