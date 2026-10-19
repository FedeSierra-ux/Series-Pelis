import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { GenreChips, PeopleLinks, tmdbPeopleIndex } from '../components/DetailTags'
import { ImdbRating } from '../components/Rating'
import { SpoilerText, useEpisodeSpoilers } from '../components/Spoiler'
import { ErrorBox } from '../components/Status'
import { CastRow, hasMoreLikeThis, MoreLikeThis, SagaBlock, TmdbSections } from '../components/TmdbExtras'
import { TrailerPlayer } from '../components/TrailerPlayer'
import { offlineMessage } from '../lib/online'
import { episodeLabel, formatTime, relativeDate, seasonCount, seriesYear } from '../lib/format'
import { useMeta, useTitle, useTmdbDetails } from '../lib/hooks'
import { trailerKeyFromMeta } from '../lib/hoverTrailer'
import { typeLabel } from '../lib/i18n'
import { useLogoTone } from '../lib/logoTone'
import { useRating } from '../lib/ratings'
import { remainingLabel } from '../lib/remaining'
import { takeReturnVideo } from '../lib/returnVideo'
import { hideTitleSynopsis } from '../lib/spoilers'
import { findResumeStream } from '../lib/nextEpisode'
import { hasSeriesDetails, seriesFacts } from '../lib/seriesDetails'
import { lastSourceStore, progressStore, RESUME_MIN_S, setWatched, settingsStore, toggleWatchlist, useStore, watchlistStore } from '../lib/store'
import {
  getDetails,
  imdbFromTmdb,
  itemTitle,
  itemYear,
  parseTmdbId,
  pickLogo,
  pickTrailer,
  tmdbImg,
  toTmdbType,
  type TmdbDetails,
  type TmdbType,
} from '../lib/tmdb'
import { useTvMode } from '../lib/tv'
import type { Meta, Video } from '../lib/types'
import { errorText } from '../lib/errors'
import { DetailActions, type PrimaryAction } from './detail/DetailActions'
import { DetailIcon } from './detail/DetailIcons'
import { DetailTabs, type DetailTab } from './detail/DetailTabs'
import { EpisodesPanel } from './detail/EpisodesPanel'
import { episodeNumber, episodeToContinue, firstEpisode, nextReleased, sortVideos } from './detail/episodes'
import { HeroTrailer, useBackdropTrailerAllowed } from './detail/HeroTrailer'
import type { MoreItem } from './detail/MoreMenu'
import { safeMeta } from './detail/safeData'
import { SectionBoundary } from './detail/SectionBoundary'
import { SeriesDetailsPanel } from './detail/SeriesDetailsPanel'
import { StreamList, type DetailLocationState } from './detail/StreamList'
import { isYtId, originalTitle } from './detail/trailers'
import { NARROW_QUERY, useMediaQuery } from './detail/useMediaQuery'
import { ReadMore } from './detail/ReadMore'
import './detail/detail-fixes.css'
import './detail/detail-v14.css'
import './detail/detail-v26.css'

export type { PlayState } from './detail/StreamList'

const detailSkeleton = <div className="page detail-skeleton"><div className="hero skeleton" /></div>

export function Detail() {
  // El router ya decodifica el parámetro: decodificarlo otra vez rompía ids con `%` (auditoría de código #11).
  const { type = 'movie', id = '' } = useParams()
  // "Reintentar" en el error: se vuelve a montar la ficha y se piden los datos de nuevo.
  const [attempt, setAttempt] = useState(0)
  const retry = () => setAttempt((n) => n + 1)
  const tmdb = parseTmdbId(id)
  // Los ítems de TMDB (`tmdb:movie:603`) se traducen a IMDb, que es lo que usan Cinemeta y los addons.
  if (tmdb) return <TmdbResolver key={`${id}|${attempt}`} type={type} tmdbType={tmdb.type} tmdbId={tmdb.id} onRetry={retry} />
  return <DetailPage key={`${id}|${attempt}`} type={type} id={id} onRetry={retry} />
}

/** "Volver" a donde estaba. Sin historial (se abrió el link directo) lleva al inicio. */
function useGoBack() {
  const navigate = useNavigate()
  const location = useLocation()
  return () => (location.key === 'default' ? navigate('/') : navigate(-1))
}

/** v0.22.4: botón de atrás arriba de todo en la ficha (en la TV no se muestra: está el Atrás del control). */
function DetailBack() {
  const back = useGoBack()
  return (
    <button type="button" className="detail-back" onClick={back} aria-label="Volver" title="Volver" data-nav-skip>
      <DetailIcon name="back" size={22} />
    </button>
  )
}

/** Error de la ficha (no cargó o el título no existe): "Reintentar" (si puede servir) y "Volver". */
function DetailError({ message, onRetry, children }: { message: string; onRetry?: () => void; children?: ReactNode }) {
  const back = useGoBack()
  return (
    <div className="page">
      <h1 className="d-sr-only">No se pudo abrir la ficha</h1>
      <ErrorBox message={message} />
      {children}
      <div className="detail-error-actions">
        {onRetry && (
          <button className="btn btn-primary" onClick={onRetry} data-autofocus>
            Reintentar
          </button>
        )}
        <button className="btn" onClick={back} data-autofocus={!onRetry || undefined}>
          Volver
        </button>
      </div>
    </div>
  )
}

function TmdbResolver({ type, tmdbType, tmdbId, onRetry }: { type: string; tmdbType: TmdbType; tmdbId: number; onRetry: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [state, setState] = useState<{ details?: TmdbDetails; error?: string }>()

  useEffect(() => {
    let alive = true
    imdbFromTmdb(tmdbId, tmdbType)
      .then(async (tt) => {
        if (!alive) return
        // Con el estado: "Más info" de la portada llega con `noAuto` y no tiene que perderse acá.
        if (tt) return navigate(`/detail/${type}/${tt}${location.search}`, { replace: true, state: location.state })
        const details = await getDetails(tmdbType, tmdbId)
        if (alive) setState({ details })
      })
      .catch((err: unknown) => alive && setState({ error: errorText(err) }))
    return () => {
      alive = false
    }
  }, [tmdbType, tmdbId])

  if (state?.error)
    return (
      <DetailError message={offlineMessage('esta ficha no está guardada') ?? `No se pudo abrir este título de TMDB: ${state.error}`} onRetry={onRetry}>
        <p className="muted detail-error-hint">
          Revisá la key de TMDB en <Link to="/settings">Ajustes</Link>.
        </p>
      </DetailError>
    )
  if (!state?.details) return detailSkeleton
  return <TmdbOnlyDetail details={state.details} type={type} tmdbType={tmdbType} />
}

/** Ficha armada solo con TMDB, para títulos que no tienen id de IMDb. */
function TmdbOnlyDetail({ details: d, type, tmdbType }: { details: TmdbDetails; type: string; tmdbType: TmdbType }) {
  // El nombre original, no el traducido (el usuario no quiere títulos en español).
  const title = originalTitle(d, itemTitle(d))
  const logo = tmdbImg(pickLogo(d), 'w500')
  const poster = tmdbImg(d.poster_path, 'w342')
  const bg = tmdbImg(d.backdrop_path, 'w1280')
  const year = itemYear(d)
  const trailer = pickTrailer(d.videos?.results, d.original_language)
  const [trailerOpen, setTrailerOpen] = useState(false)
  useTitle(title)

  return (
    <div className="page detail">
      <section className={`detail-hero${bg ? ' has-bg' : ''}`} style={{ backgroundImage: bg ? `url(${bg})` : undefined }}>
        <DetailBack />
        <div className="hero-shade" />
        <div className="detail-head">
          {poster && <img className="detail-poster" src={poster} alt="" />}
          <div className="detail-info">
            <h1 className={`detail-title${!logo && isLongTitle(title) ? ' is-long' : ''}`}>
              {logo ? <DetailLogo src={logo} alt={title} /> : title}
            </h1>
            {d.tagline && <p className="detail-tagline">{d.tagline}</p>}
            <div className="hero-meta">
              <span>{typeLabel(type, false)}</span>
              {year && <span>{year}</span>}
            </div>
            <GenreChips type={type} tmdbGenres={d.genres} />
            {d.overview && <ReadMore className="detail-desc" text={d.overview} />}
            {trailer && isYtId(trailer.key) && (
              <div className="hero-actions">
                <button type="button" className="btn" onClick={() => setTrailerOpen(true)} data-autofocus>
                  ▶ Tráiler
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="movie-streams">
        <p className="tmdb-notice">Este título no está en Cinemeta, así que no podemos buscar fuentes.</p>
      </section>
      <TmdbSections details={d} type={tmdbType} />
      {trailerOpen && trailer && <TrailerPlayer ytId={trailer.key} title={title} backdrop={bg} onClose={() => setTrailerOpen(false)} />}
    </div>
  )
}

const NOT_FOUND = 'No encontramos este título'
/** Logo del título; un logo oscuro (Severance) lleva halo claro para leerse sobre la portada (`lib/logoTone`). */
function DetailLogo({ src, alt, onError }: { src: string; alt: string; onError?: () => void }) {
  const tone = useLogoTone(src)
  return <img className="detail-logo" {...tone} src={src} alt={alt} onError={onError} />
}

/** v0.26 (ficha-02): un título en texto (sin logo) de más de 40 letras va con la letra un poco más chica. */
const isLongTitle = (t: string) => t.length > 40
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
/** "T2 E4" para el botón principal. */
const shortEp = (v: Video) => `T${v.season ?? 0} E${episodeNumber(v) ?? '?'}`

function DetailPage({ type, id, onRetry }: { type: string; id: string; onRetry: () => void }) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { data: rawMeta, loading, error } = useMeta(type, id)
  // Lo que manda el addon se valida acá: una lista que no es lista no tira abajo la ficha.
  const meta = useMemo(() => (rawMeta ? safeMeta(rawMeta) : undefined), [rawMeta])
  const { data: tmdb, loading: tmdbLoading } = useTmdbDetails(type, id)
  const progress = useStore(progressStore)
  const watchlist = useStore(watchlistStore)
  // v0.5 gustos: tu puntaje y el modo sin spoilers.
  const rated = !!useRating(id)
  const spoilerSettings = useStore(settingsStore)
  const hideEpisodeSpoiler = useEpisodeSpoilers()
  const hideSynopsis = hideTitleSynopsis(spoilerSettings, id, progress, rated)
  // El título es el de Cinemeta (el original): con TMDB solo van en español la sinopsis y los datos.
  const title = meta?.name || undefined
  useTitle(title)
  // Celular: las fuentes van debajo del episodio elegido (en PC y TV, a la derecha).
  const tv = useTvMode()
  const inlineStreams = useMediaQuery(NARROW_QUERY) && !tv
  const backdropAllowed = useBackdropTrailerAllowed()
  const [trailer, setTrailer] = useState<{ ytId: string; kind?: string }>()
  // Si el logo no carga, va el nombre en texto (y no la imagen rota).
  const [logoFailed, setLogoFailed] = useState(false)
  // "Reproducir" directo (U16): mientras busca la fuente de la última vez.
  const lastSources = useStore(lastSourceStore)
  const [starting, setStarting] = useState(false)
  const startAbort = useRef<AbortController>(undefined)
  useEffect(() => () => startAbort.current?.abort(), [])

  const videos = useMemo(() => sortVideos(meta?.videos ?? []), [meta?.videos])

  // Al volver del reproductor, marca el último episodio que se vio (puede haber pasado solo al siguiente)
  // sin que el modo automático lo vuelva a reproducir.
  useEffect(() => {
    const back = takeReturnVideo(id)
    if (!back || params.get('video') === back.videoId) return
    const next = new URLSearchParams(params)
    if (back.season !== undefined) next.set('season', String(back.season))
    next.set('video', back.videoId)
    next.delete('tab')
    const state: DetailLocationState = { noAuto: true }
    setParams(next, { replace: true, state })
  }, [id])
  const isSeries = type === 'series' || videos.length > 1
  const seasons = useMemo(() => {
    const set = new Set(videos.map((v) => v.season ?? 0))
    const list = [...set].sort((a, b) => a - b)
    // Los especiales (temporada 0) van al final.
    return list.filter((s) => s !== 0).concat(list.includes(0) ? [0] : [])
  }, [videos])
  const releaseInfo = isSeries ? seriesYear(meta?.releaseInfo, seasonCount(videos)) : meta?.releaseInfo

  // Temporada inicial: la del último episodio visto, o la 1.
  const lastWatched = useMemo(
    () =>
      Object.values(progress)
        .filter((e) => e.metaId === id)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0],
    [progress, id],
  )
  const seasonParam = params.get('season')
  const season = seasonParam !== null ? Number(seasonParam) : (lastWatched?.season ?? seasons[0] ?? 1)
  const selectedVideoId = params.get('video') ?? undefined
  const selectedVideo = videos.find((v) => v.id === selectedVideoId)
  // El siguiente episodio ya estrenado (los "Próximamente" no cuentan).
  const nextVideo = selectedVideo ? nextReleased(videos, selectedVideo) : undefined

  // Al elegir desde los botones de la portada o en celular, se lleva la vista a las fuentes.
  const listRef = useRef<HTMLOListElement>(null)
  const panelRef = useRef<HTMLLIElement>(null)
  const sourcesRef = useRef<HTMLElement>(null)
  const scrollNext = useRef(false)
  const focusSources = useRef(false)
  useEffect(() => {
    if (!scrollNext.current || !selectedVideoId) return
    scrollNext.current = false
    // En el celular, el episodio elegido arriba y sus fuentes justo debajo (antes quedaban tapadas por la barra de abajo).
    const target = listRef.current?.querySelector<HTMLElement>('.episode.selected') ?? panelRef.current
    target?.scrollIntoView({ block: inlineStreams ? 'start' : 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [selectedVideoId, inlineStreams])

  const firstTab = isSeries ? 'episodes' : 'sources'
  const activeTab = params.get('tab') ?? firstTab

  // Película: "Reproducir" lleva a las fuentes y deja el foco en la recomendada (o en la primera).
  useEffect(() => {
    if (!focusSources.current || activeTab !== firstTab) return
    focusSources.current = false
    const section = sourcesRef.current
    if (!section) return
    section.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' })
    const target =
      section.querySelector<HTMLElement>('.stream-item.recommended') ??
      section.querySelector<HTMLElement>('button.stream-item, a.stream-item') ??
      section.querySelector<HTMLElement>('h2')
    target?.focus({ preventScroll: true })
  })


  if (loading && !meta) return detailSkeleton
  if (error && !meta) return <DetailError message={offlineMessage('esta ficha no está guardada') ?? `No se pudo cargar: ${error}`} onRetry={onRetry} />
  // Cinemeta responde con una ficha vacía para ids que no existen (`tt0000000`).
  if (!meta || !meta.name) return <DetailError message={NOT_FOUND} />

  const name = meta.name
  const fullMeta: Meta = { ...meta, type }
  const bg = meta.background ?? (id.startsWith('tt') ? `https://images.metahub.space/background/medium/${id}/img` : undefined)
  const peopleIndex = tmdbPeopleIndex(tmdb)
  const description = tmdb?.overview || meta.description
  const tmdbLogo = tmdbImg(pickLogo(tmdb), 'w500')
  const logo = logoFailed ? undefined : (tmdbLogo ?? meta.logo)
  const movieProgress = progress[id]
  const tmdbTrailer = pickTrailer(tmdb?.videos?.results, tmdb?.original_language)?.key
  const trailerKey = isYtId(tmdbTrailer) ? tmdbTrailer : trailerKeyFromMeta(meta)
  const tmdbType = toTmdbType(type)
  // Con el control remoto, la primera flecha va al botón principal; sin él, al episodio elegido o al primero sin ver.
  const seasonVideos = videos.filter((v) => (v.season ?? 0) === season)
  const focusVideoId = selectedVideoId ?? (seasonVideos.find((v) => !progress[v.id]?.watched) ?? seasonVideos[0])?.id
  // Si hay fila de reparto con fotos, el elenco en texto sobra.
  const hasTmdbCast = !!(type === 'movie' ? tmdb?.credits?.cast : tmdb?.aggregate_credits?.cast)?.length
  // Series: "Detalles" (reparto, creación, país y dónde ver). Sin TMDB, con lo que traiga Cinemeta.
  const seriesInfo = isSeries ? seriesFacts(tmdb, { writer: meta.writer, country: meta.country }) : undefined
  const seriesCastCount = tmdb?.aggregate_credits?.cast?.length ?? 0
  const seriesProgress = isSeries && !!lastWatched
  const continueEp = isSeries ? episodeToContinue(videos, progress) : undefined
  const firstEp = isSeries ? firstEpisode(videos) : undefined

  /** Cambia parámetros de la URL sin disparar el modo automático (cambiar de pestaña no es elegir). */
  const updateParams = (mutate: (p: URLSearchParams) => void, state: DetailLocationState = { noAuto: true }) => {
    const next = new URLSearchParams(params)
    mutate(next)
    setParams(next, { replace: true, state })
  }

  const setTab = (tab: string) =>
    updateParams((p) => {
      if (tab === firstTab) p.delete('tab')
      else p.set('tab', tab)
    }, { ...(location.state as DetailLocationState | null), noAuto: true })

  const selectVideo = (v: Video, opts?: { scroll?: boolean; fromStart?: boolean }) => {
    scrollNext.current = !!opts?.scroll
    // Elegir un episodio sí puede arrancar el modo automático (sin `noAuto`).
    updateParams(
      (p) => {
        p.set('season', String(v.season ?? 0))
        p.set('video', v.id)
        p.delete('tab')
      },
      opts?.fromStart ? { fromStart: true } : {},
    )
  }

  const goToSources = (fromStart = false) => {
    focusSources.current = true
    updateParams((p) => p.delete('tab'), fromStart ? { fromStart: true } : { ...(location.state as DetailLocationState | null) })
  }

  const watchBase = (v?: Video) => ({
    videoId: v?.id ?? id,
    metaId: id,
    type,
    name,
    poster: meta.poster,
    season: v?.season,
    episode: v ? episodeNumber(v) : undefined,
    episodeTitle: v?.title ?? v?.name,
  })

  /**
   * "Reproducir" / "Continuar" directo, sin pasar por la lista de fuentes: la misma fuente que la última
   * vez (o, en modo automático, la mejor) con `findResumeStream`. Si no hay una (modo manual sin fuente
   * recordada, o no apareció), se hace lo de siempre: elegir el episodio y mostrar las fuentes.
   */
  const play = async (fallback: () => void, video?: Video, fromStart = false) => {
    if (starting) {
      // Segundo toque mientras busca: deja de buscar y muestra las fuentes.
      startAbort.current?.abort()
      setStarting(false)
      return fallback()
    }
    const rules = spoilerSettings.sourceRules
    if (rules.mode !== 'auto' && !(rules.rememberLast && lastSources[id])) return fallback()
    const ctrl = new AbortController()
    startAbort.current = ctrl
    setStarting(true)
    try {
      const state = await findResumeStream({ type, metaId: id, videoId: video?.id }, ctrl.signal)
      if (ctrl.signal.aborted) return
      if (!state) return fallback()
      const full = fromStart ? { ...state, resume: { at: 0 } } : state
      navigate(`/watch/${type}/${encodeURIComponent(state.video?.id ?? id)}`, { state: full })
    } catch {
      if (!ctrl.signal.aborted) fallback()
    } finally {
      if (startAbort.current === ctrl) setStarting(false)
    }
  }

  // ---------- Botón principal y menú ⋯ ----------
  const movieStarted = !isSeries && !!movieProgress && !movieProgress.watched && movieProgress.position > RESUME_MIN_S
  let primary: PrimaryAction | undefined
  if (isSeries) {
    const ep = continueEp ?? firstEp
    if (ep) {
      const w = progress[ep.id]
      // Mismo umbral que Seguir viendo y el reproductor: con 18 s vistos no dice "quedan…" (arranca de cero).
      const midway = !!w && !w.watched && w.position > RESUME_MIN_S
      const epTitle = ep.title ?? ep.name
      primary = {
        label: continueEp ? `${seriesProgress ? 'Continuar' : 'Reproducir'} ${shortEp(ep)}` : `Volver a ver ${shortEp(ep)}`,
        sub: midway ? remainingLabel(w.position, w.duration) : epTitle,
        title: `${episodeLabel(ep.season, episodeNumber(ep))}${epTitle ? ` · ${epTitle}` : ''}`,
        onClick: () => void play(() => selectVideo(ep, { scroll: true, fromStart: !continueEp }), ep, !continueEp),
      }
    }
  } else {
    primary = {
      label: movieStarted ? 'Continuar' : 'Reproducir',
      sub: movieStarted ? remainingLabel(movieProgress.position, movieProgress.duration) : undefined,
      title: movieStarted
        ? `Te quedaste en ${formatTime(movieProgress.position)} de ${formatTime(movieProgress.duration)} · ${relativeDate(movieProgress.updatedAt)}`
        : 'Elegir una fuente',
      onClick: () => void play(() => goToSources()),
    }
  }
  if (primary && starting) primary = { ...primary, sub: 'Buscando la fuente…', busy: true }

  const more: MoreItem[] = []
  if (seriesProgress && firstEp)
    more.push({
      id: 'restart',
      label: 'Ver desde el principio',
      icon: 'restart',
      onSelect: () => void play(() => selectVideo(firstEp, { scroll: true, fromStart: true }), firstEp, true),
    })
  if (movieStarted)
    more.push({ id: 'restart', label: 'Ver desde el principio', icon: 'restart', onSelect: () => void play(() => goToSources(true), undefined, true) })
  if (!isSeries)
    more.push({
      id: 'watched',
      label: movieProgress?.watched ? 'Vista (desmarcar)' : 'Marcar como vista',
      icon: 'eye',
      checked: !!movieProgress?.watched,
      onSelect: () => setWatched(watchBase(), !movieProgress?.watched),
    })
  if (id.startsWith('tt')) more.push({ id: 'imdb', label: 'Ver en IMDb', icon: 'external', href: `https://www.imdb.com/title/${id}/` })

  /** ↑ desde las pestañas: al botón principal (o a las estrellas abiertas), no al chip que quede más cerca. */
  const focusHeroActions = () => {
    const el = ['.d-rate .star-input', '.d-actions .d-play', '.d-actions .d-icon-btn']
      .map((sel) => document.querySelector<HTMLElement>(sel))
      .find(Boolean)
    if (!el) return false
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
    return true
  }

  // ---------- Pestañas ----------
  const streamsPanel = selectedVideo && (
    <>
      <h2>
        {episodeLabel(selectedVideo.season, episodeNumber(selectedVideo))} · {selectedVideo.title ?? selectedVideo.name}
      </h2>
      <SectionBoundary what="las fuentes" resetKey={selectedVideo.id}>
        <StreamList meta={fullMeta} video={selectedVideo} nextVideoId={nextVideo?.id} />
      </SectionBoundary>
    </>
  )

  const tabs: DetailTab[] = [
    isSeries
      ? {
          id: 'episodes',
          label: 'Episodios',
          content: (
            <EpisodesPanel
              videos={videos}
              seasons={seasons}
              season={season}
              onSeason={(s) => updateParams((p) => {
                p.set('season', String(s))
                p.delete('video')
              })}
              progress={progress}
              selectedVideoId={selectedVideoId}
              onSelect={(v) => selectVideo(v, { scroll: inlineStreams })}
              focusVideoId={focusVideoId}
              suggested={continueEp}
              started={seriesProgress}
              first={firstEp}
              tmdbId={tmdb?.id}
              hideSpoiler={(v) => hideEpisodeSpoiler({ metaId: id, videoId: v.id, season: v.season, episode: episodeNumber(v) })}
              watchBase={watchBase}
              inlineStreams={inlineStreams}
              streamsPanel={streamsPanel}
              listRef={listRef}
              panelRef={panelRef}
            />
          ),
        }
      : {
          id: 'sources',
          label: 'Fuentes',
          content: (
            <section className="movie-streams" ref={sourcesRef}>
              <h2 className="d-sr-only" tabIndex={-1}>
                Fuentes
              </h2>
              <SectionBoundary what="las fuentes">
                <StreamList meta={fullMeta} />
              </SectionBoundary>
            </section>
          ),
        },
  ]
  if (hasMoreLikeThis(tmdb, tmdbType) && tmdb)
    tabs.push({
      id: 'more',
      label: 'Más como esto',
      content: (
        <SectionBoundary>
          {tmdbType === 'movie' && tmdb.belongs_to_collection && <SagaBlock details={tmdb} />}
          <MoreLikeThis details={tmdb} type={tmdbType} />
        </SectionBoundary>
      ),
    })
  // Última pestaña, solo en series y si tiene algo (sin TMDB muchas veces no hay nada).
  if (seriesInfo && hasSeriesDetails(seriesInfo, seriesCastCount))
    tabs.push({
      id: 'details',
      label: 'Detalles',
      content: (
        <SectionBoundary what="los detalles">
          <SeriesDetailsPanel tmdb={seriesCastCount > 0 ? tmdb : undefined} facts={seriesInfo} peopleIndex={peopleIndex} />
        </SectionBoundary>
      ),
    })
  // Un enlace con ?tab=more|details mientras TMDB carga: la pestaña queda puesta (con su aviso) en vez de caer en la
  // primera y saltar después.
  const waitingTab = ({ more: 'Más como esto', details: 'Detalles' } as Record<string, string>)[activeTab]
  if (tmdbLoading && waitingTab && !tabs.some((t) => t.id === activeTab))
    tabs.push({
      id: activeTab,
      label: waitingTab,
      content: (
        <p className="muted small" role="status">
          <span className="spinner" aria-hidden="true" /> Cargando…
        </p>
      ),
    })
  return (
    <div className="page detail">
      <section className={`detail-hero${bg ? ' has-bg' : ''}`} style={{ backgroundImage: bg ? `url(${bg})` : undefined }}>
        <DetailBack />
        {trailerKey && backdropAllowed && <HeroTrailer ytId={trailerKey} title={name} suspended={!!trailer} />}
        <div className="hero-shade" />
        <div className="detail-head">
          {meta.poster && <img className="detail-poster" src={meta.poster} alt="" />}
          <div className="detail-info">
            {/* El h1 siempre está (auditoría de uso, UX 4): con logo, el logo es su contenido y su texto alternativo, el nombre. */}
            <h1 className={`detail-title${!logo && isLongTitle(name) ? ' is-long' : ''}`}>
              {logo ? <DetailLogo src={logo} alt={name} onError={() => setLogoFailed(true)} /> : name}
            </h1>
            {tmdb?.tagline && <p className="detail-tagline">{tmdb.tagline}</p>}
            <div className="hero-meta">
              <ImdbRating value={meta.imdbRating} />
              <span>{typeLabel(type, false)}</span>
              {releaseInfo && <span>{releaseInfo}</span>}
              {/* En las series la duración cambia en cada episodio: solo en las pelis. */}
              {meta.runtime && !isSeries && <span>{meta.runtime}</span>}
            </div>
            <GenreChips type={type} tmdbGenres={tmdb?.genres} names={meta.genre ?? meta.genres} />
            {description && (
              <SpoilerText key={id} hidden={hideSynopsis}>
                <ReadMore key={description} className="detail-desc" text={description} />
              </SpoilerText>
            )}
            {(meta.director?.length || (meta.cast?.length && !hasTmdbCast)) ? (
              <dl className="credits">
                {meta.director?.length ? (<><dt>Dirección</dt><dd><PeopleLinks names={meta.director} index={peopleIndex} /></dd></>) : null}
                {meta.cast?.length && !hasTmdbCast ? (<><dt>Elenco</dt><dd><PeopleLinks names={meta.cast.slice(0, 6)} index={peopleIndex} /></dd></>) : null}
              </dl>
            ) : null}
            <DetailActions
              title={{ id, type, name, poster: meta.poster }}
              tmdbId={tmdb?.id}
              primary={primary}
              inList={!!watchlist[id]}
              onToggleList={() => toggleWatchlist(fullMeta)}
              onTrailer={trailerKey ? () => setTrailer({ ytId: trailerKey, kind: 'Tráiler' }) : undefined}
              more={more}
            />
          </div>
        </div>
      </section>

      {/* En las pelis el reparto va fuera de las pestañas, arriba de las fuentes (v0.24); en las series, en "Detalles" (v0.25). */}
      {tmdb && !isSeries && <CastRow details={tmdb} type={tmdbType} />}

      <DetailTabs tabs={tabs} active={activeTab} onChange={setTab} onExitUp={focusHeroActions} />

      {trailer && <TrailerPlayer ytId={trailer.ytId} kind={trailer.kind} title={name} backdrop={bg} onClose={() => setTrailer(undefined)} />}
    </div>
  )
}
