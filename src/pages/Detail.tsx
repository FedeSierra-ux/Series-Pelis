import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { GenreChips, KeywordChips, PeopleLinks, tmdbPeopleIndex } from '../components/DetailTags'
import { NotInterestedButton } from '../components/NotInterested'
import { ImdbRating } from '../components/Rating'
import { SpoilerText, useEpisodeSpoilers } from '../components/Spoiler'
import { StarRatingInput } from '../components/StarRating'
import { ErrorBox } from '../components/Status'
import { offlineMessage } from '../lib/online'
import { TmdbSections } from '../components/TmdbExtras'
import { WikiTrivia } from '../components/WikiTrivia'
import { episodeLabel, formatTime, relativeDate } from '../lib/format'
import { useMeta, useTitle, useTmdbDetails } from '../lib/hooks'
import { typeLabel } from '../lib/i18n'
import { useRating } from '../lib/ratings'
import { takeReturnVideo } from '../lib/returnVideo'
import { hideTitleSynopsis } from '../lib/spoilers'
import { progressStore, setWatched, setWatchedMany, settingsStore, toggleWatchlist, useStore, watchlistStore } from '../lib/store'
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
import {
  episodeNumber,
  episodeToContinue,
  firstEpisode,
  formatReleaseDate,
  isReleased,
  nextReleased,
  seasonStatus,
  sortVideos,
} from './detail/episodes'
import { StreamList, type DetailLocationState } from './detail/StreamList'
import { NARROW_QUERY, useMediaQuery } from './detail/useMediaQuery'
import './detail/detail-fixes.css'

export type { PlayState } from './detail/StreamList'

const detailSkeleton = <div className="page detail-skeleton"><div className="hero skeleton" /></div>

export function Detail() {
  const { type = 'movie', id: rawId = '' } = useParams()
  const id = decodeURIComponent(rawId)
  const tmdb = parseTmdbId(id)
  // Los ítems de TMDB (`tmdb:movie:603`) se traducen a IMDb, que es lo que usan Cinemeta y los addons.
  if (tmdb) return <TmdbResolver key={id} type={type} tmdbType={tmdb.type} tmdbId={tmdb.id} />
  return <DetailPage type={type} id={id} />
}

/** Error de la ficha (no cargó o el título no existe) con un botón para volver. */
function DetailError({ message }: { message: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  // Sin historial (se abrió el link directo) "Volver" lleva al inicio.
  const back = () => (location.key === 'default' ? navigate('/') : navigate(-1))
  return (
    <div className="page">
      <ErrorBox message={message} />
      <div className="detail-error-actions">
        <button className="btn" onClick={back} data-autofocus>
          Volver
        </button>
      </div>
    </div>
  )
}

function TmdbResolver({ type, tmdbType, tmdbId }: { type: string; tmdbType: TmdbType; tmdbId: number }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [state, setState] = useState<{ details?: TmdbDetails; error?: string }>()

  useEffect(() => {
    let alive = true
    imdbFromTmdb(tmdbId, tmdbType)
      .then(async (tt) => {
        if (!alive) return
        if (tt) return navigate(`/detail/${type}/${tt}${location.search}`, { replace: true })
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
      <div className="page">
        <ErrorBox message={offlineMessage('esta ficha no está guardada') ?? `No se pudo abrir este título de TMDB: ${state.error}`} />
        <p className="muted">
          Revisá la key de TMDB en <Link to="/settings">Ajustes</Link>.
        </p>
      </div>
    )
  if (!state?.details) return detailSkeleton
  return <TmdbOnlyDetail details={state.details} type={type} tmdbType={tmdbType} />
}

/** Ficha armada solo con TMDB, para títulos que no tienen id de IMDb. */
function TmdbOnlyDetail({ details: d, type, tmdbType }: { details: TmdbDetails; type: string; tmdbType: TmdbType }) {
  const title = itemTitle(d)
  const logo = tmdbImg(pickLogo(d), 'w500')
  const poster = tmdbImg(d.poster_path, 'w342')
  const bg = tmdbImg(d.backdrop_path, 'w1280')
  const year = itemYear(d)
  const trailer = pickTrailer(d.videos?.results)
  useTitle(title)

  return (
    <div className="page detail">
      <section className="detail-hero" style={{ backgroundImage: bg ? `url(${bg})` : undefined }}>
        <div className="hero-shade" />
        <div className="detail-head">
          {poster && <img className="detail-poster" src={poster} alt="" />}
          <div className="detail-info">
            {logo ? <img className="detail-logo" src={logo} alt={title} /> : <h1>{title}</h1>}
            {d.tagline && <p className="detail-tagline">{d.tagline}</p>}
            <div className="hero-meta">
              <span>{typeLabel(type, false)}</span>
              {year && <span>{year}</span>}
            </div>
            <GenreChips type={type} tmdbGenres={d.genres} />
            {d.overview && <p className="detail-desc">{d.overview}</p>}
            <KeywordChips type={type} tmdbId={d.id} />
            {trailer && (
              <div className="hero-actions">
                <a className="btn" href={`https://www.youtube.com/watch?v=${trailer.key}`} target="_blank" rel="noreferrer">
                  Tráiler
                </a>
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="movie-streams">
        <p className="tmdb-notice">Este título no está en Cinemeta, así que no podemos buscar fuentes.</p>
      </section>
      <TmdbSections details={d} type={tmdbType} />
    </div>
  )
}

const NOT_FOUND = 'No encontramos este título'

function DetailPage({ type, id }: { type: string; id: string }) {
  const [params, setParams] = useSearchParams()
  const { data: meta, loading, error } = useMeta(type, id)
  const { data: tmdb } = useTmdbDetails(type, id)
  const progress = useStore(progressStore)
  const watchlist = useStore(watchlistStore)
  // v0.5 gustos: tu puntaje y el modo sin spoilers.
  const rated = !!useRating(id)
  const spoilerSettings = useStore(settingsStore)
  const hideEpisodeSpoiler = useEpisodeSpoilers()
  const hideSynopsis = hideTitleSynopsis(spoilerSettings, id, progress, rated)
  // Con TMDB, título, sinopsis, frase y géneros en español; el puntaje sigue siendo el de IMDb (Cinemeta).
  const title = (tmdb && itemTitle(tmdb)) || meta?.name
  useTitle(title)
  // Celular: las fuentes van debajo del episodio elegido (en PC y TV, a la derecha).
  const tv = useTvMode()
  const inlineStreams = useMediaQuery(NARROW_QUERY) && !tv

  const videos = useMemo(() => sortVideos(meta?.videos ?? []), [meta?.videos])

  // Al volver del reproductor, marca el último episodio que se vio (puede haber pasado solo al siguiente)
  // sin que el modo automático lo vuelva a reproducir.
  useEffect(() => {
    const back = takeReturnVideo(id)
    if (!back || params.get('video') === back.videoId) return
    const next = new URLSearchParams(params)
    if (back.season !== undefined) next.set('season', String(back.season))
    next.set('video', back.videoId)
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
  const scrollNext = useRef(false)
  useEffect(() => {
    if (!scrollNext.current || !selectedVideoId) return
    scrollNext.current = false
    const target = inlineStreams ? panelRef.current : listRef.current?.querySelector<HTMLElement>('.episode.selected')
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    target?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [selectedVideoId, inlineStreams])

  if (loading && !meta) return detailSkeleton
  if (error && !meta) return <DetailError message={offlineMessage('esta ficha no está guardada') ?? `No se pudo cargar: ${error}`} />
  // Cinemeta responde con una ficha vacía para ids que no existen (`tt0000000`).
  if (!meta || !meta.name) return <DetailError message={NOT_FOUND} />

  const fullMeta: Meta = { ...meta, type }
  const bg = meta.background ?? (id.startsWith('tt') ? `https://images.metahub.space/background/medium/${id}/img` : undefined)
  const peopleIndex = tmdbPeopleIndex(tmdb)
  const description = tmdb?.overview || meta.description
  const tmdbLogo = tmdbImg(pickLogo(tmdb), 'w500')
  const logo = tmdbLogo ?? meta.logo
  const movieProgress = progress[id]
  const trailer =
    pickTrailer(tmdb?.videos?.results)?.key ??
    meta.trailerStreams?.[0]?.ytId ??
    meta.trailers?.find((t) => t.type === 'Trailer')?.source
  // Con el control remoto, la primera flecha va al episodio elegido o al primero sin ver de la temporada.
  const seasonVideos = videos.filter((v) => (v.season ?? 0) === season)
  const focusVideoId = selectedVideoId ?? (seasonVideos.find((v) => !progress[v.id]?.watched) ?? seasonVideos[0])?.id
  // Si hay fila de reparto con fotos, el elenco en texto sobra.
  const hasTmdbCast = !!(type === 'movie' ? tmdb?.credits?.cast : tmdb?.aggregate_credits?.cast)?.length
  // "Marcar temporada como vista" solo cuenta los episodios ya estrenados.
  const { released: seasonReleased, complete: seasonComplete } = seasonStatus(seasonVideos, progress)
  // Botones de la portada de una serie: "Continuar"/"Ver ahora" y, con progreso, "Ver desde el principio".
  const seriesProgress = isSeries && !!lastWatched
  const continueEp = isSeries ? episodeToContinue(videos, progress) : undefined
  const firstEp = isSeries ? firstEpisode(videos) : undefined

  const selectVideo = (v: Video, opts?: { scroll?: boolean; fromStart?: boolean }) => {
    const next = new URLSearchParams(params)
    next.set('season', String(v.season ?? 0))
    next.set('video', v.id)
    scrollNext.current = !!opts?.scroll
    const state: DetailLocationState | undefined = opts?.fromStart ? { fromStart: true } : undefined
    setParams(next, { replace: true, state })
  }

  const watchBase = (v?: Video) => ({
    videoId: v?.id ?? id,
    metaId: id,
    type,
    name: meta.name,
    poster: meta.poster,
    season: v?.season,
    episode: v ? episodeNumber(v) : undefined,
    episodeTitle: v?.title ?? v?.name,
  })

  const streamsPanel = selectedVideo && (
    <>
      <h2>
        {episodeLabel(selectedVideo.season, episodeNumber(selectedVideo))} · {selectedVideo.title ?? selectedVideo.name}
      </h2>
      <StreamList meta={fullMeta} video={selectedVideo} nextVideoId={nextVideo?.id} />
    </>
  )

  return (
    <div className="page detail">
      <section className="detail-hero" style={{ backgroundImage: bg ? `url(${bg})` : undefined }}>
        <div className="hero-shade" />
        <div className="detail-head">
          {meta.poster && <img className="detail-poster" src={meta.poster} alt="" />}
          <div className="detail-info">
            {logo ? <img className="detail-logo" src={logo} alt={title} /> : <h1>{title}</h1>}
            {tmdb?.tagline && <p className="detail-tagline">{tmdb.tagline}</p>}
            <div className="hero-meta">
              <ImdbRating value={meta.imdbRating} />
              <span>{typeLabel(type, false)}</span>
              {meta.releaseInfo && <span>{meta.releaseInfo}</span>}
              {meta.runtime && <span>{meta.runtime}</span>}
            </div>
            <GenreChips type={type} tmdbGenres={tmdb?.genres} names={meta.genre ?? meta.genres} />
            {description && (
              <SpoilerText key={id} hidden={hideSynopsis}>
                <p className="detail-desc">{description}</p>
              </SpoilerText>
            )}
            <dl className="credits">
              {meta.director?.length ? (<><dt>Dirección</dt><dd><PeopleLinks names={meta.director} index={peopleIndex} /></dd></>) : null}
              {meta.cast?.length && !hasTmdbCast ? (<><dt>Elenco</dt><dd><PeopleLinks names={meta.cast.slice(0, 6)} index={peopleIndex} /></dd></>) : null}
              {meta.awards ? (<><dt>Premios</dt><dd>{meta.awards}</dd></>) : null}
            </dl>
            {tmdb && <KeywordChips type={type} tmdbId={tmdb.id} />}
            <div className="hero-actions">
              {continueEp && (
                <button
                  className="btn btn-primary"
                  title={`${episodeLabel(continueEp.season, episodeNumber(continueEp))} · ${continueEp.title ?? continueEp.name ?? ''}`}
                  onClick={() => selectVideo(continueEp, { scroll: true })}
                >
                  ▶ {seriesProgress ? 'Continuar' : 'Ver ahora'} · {episodeLabel(continueEp.season, episodeNumber(continueEp))}
                </button>
              )}
              {seriesProgress && firstEp && (
                <button className="btn btn-ghost" onClick={() => selectVideo(firstEp, { scroll: true, fromStart: true })}>
                  Ver desde el principio
                </button>
              )}
              <button className="btn" onClick={() => toggleWatchlist(fullMeta)}>
                {watchlist[id] ? '✓ En mi lista' : '+ Mi lista'}
              </button>
              {!isSeries && (
                <button className="btn" onClick={() => setWatched(watchBase(), !movieProgress?.watched)}>
                  {movieProgress?.watched ? '✓ Vista' : 'Marcar como vista'}
                </button>
              )}
              {trailer && (
                <a className="btn" href={`https://www.youtube.com/watch?v=${trailer}`} target="_blank" rel="noreferrer">
                  Tráiler
                </a>
              )}
              {id.startsWith('tt') && (
                <a className="btn" href={`https://www.imdb.com/title/${id}/`} target="_blank" rel="noreferrer">
                  Ver en IMDb
                </a>
              )}
              <NotInterestedButton title={{ id, type, name: meta.name, poster: meta.poster }} tmdbId={tmdb?.id} />
            </div>
            <StarRatingInput title={{ id, type, name: meta.name, poster: meta.poster }} tmdbId={tmdb?.id} />
            {!isSeries && movieProgress && !movieProgress.watched && movieProgress.position > 30 && (
              <p className="muted">
                Te quedaste en {formatTime(movieProgress.position)} de {formatTime(movieProgress.duration)} ·{' '}
                {relativeDate(movieProgress.updatedAt)}
              </p>
            )}
          </div>
        </div>
      </section>

      {isSeries ? (
        <section className="episodes-section">
          <div className="season-bar">
            <div className="season-tabs" role="tablist">
              {seasons.map((s) => (
                <button
                  key={s}
                  role="tab"
                  aria-selected={s === season}
                  className={`tab ${s === season ? 'active' : ''}`}
                  onClick={() => setParams({ season: String(s) }, { replace: true })}
                >
                  {s === 0 ? 'Especiales' : `Temporada ${s}`}
                </button>
              ))}
            </div>
            {seasonReleased.length > 0 && (
              <button
                className="btn btn-ghost season-mark"
                onClick={() => setWatchedMany(seasonReleased.map((v) => watchBase(v)), !seasonComplete)}
              >
                {seasonComplete ? '✓ Marcar temporada como no vista' : 'Marcar temporada como vista'}
              </button>
            )}
          </div>
          <div className="episodes-layout">
            <ol className="episodes" ref={listRef}>
              {seasonVideos.map((v) => {
                const p = progress[v.id]
                const released = formatReleaseDate(v)
                const upcoming = !isReleased(v)
                const rating = Number(v.rating)
                // Sin spoilers: lo que no viste va difuminado hasta que lo elegís.
                const spoil = v.id !== selectedVideoId && hideEpisodeSpoiler({ metaId: id, videoId: v.id, season: v.season, episode: episodeNumber(v) })
                const selected = v.id === selectedVideoId
                return [
                  <li key={v.id} className={`episode ${selected ? 'selected' : ''} ${p?.watched ? 'watched' : ''}`}>
                    <button className="episode-main" data-focus-id={v.id} data-autofocus={v.id === focusVideoId || undefined} onClick={() => selectVideo(v, { scroll: inlineStreams })}>
                      <div className={`episode-thumb${spoil ? ' spoiler-blur' : ''}`}>
                        {v.thumbnail && <img src={v.thumbnail} alt="" loading="lazy" decoding="async" />}
                        {p && p.duration > 0 && !p.watched && (
                          <div className="progress-bar"><div style={{ width: `${(p.position / p.duration) * 100}%` }} /></div>
                        )}
                      </div>
                      <div className="episode-text">
                        <span className="episode-title">
                          {episodeNumber(v)}. {v.title ?? v.name ?? `Episodio ${episodeNumber(v)}`}
                        </span>
                        <span className="muted small">
                          {released}
                          {upcoming && ' · Próximamente'}
                          {rating > 0 && (
                            <>
                              {' · '}
                              <ImdbRating value={rating.toFixed(1)} size="sm" />
                            </>
                          )}
                        </span>
                        {(v.overview ?? v.description) &&
                          (spoil ? (
                            <span className="episode-desc spoiler-hidden">Sinopsis oculta · elegilo para verla</span>
                          ) : (
                            <span className="episode-desc">{v.overview ?? v.description}</span>
                          ))}
                      </div>
                    </button>
                    <button
                      className={`episode-check ${p?.watched ? 'on' : ''}`}
                      title={p?.watched ? 'Marcar como no vista' : 'Marcar como vista'}
                      aria-label={p?.watched ? 'Marcar como no vista' : 'Marcar como vista'}
                      onClick={() => setWatched(watchBase(v), !p?.watched)}
                    >
                      ✓
                    </button>
                  </li>,
                  // Celular: las fuentes justo debajo del episodio elegido, así no quedan fuera de pantalla.
                  inlineStreams && selected && streamsPanel ? (
                    <li key={`${v.id}-streams`} className="episode-streams episode-streams-inline" ref={panelRef}>
                      {streamsPanel}
                    </li>
                  ) : null,
                ]
              })}
            </ol>
            {!inlineStreams && (
              <aside className="episode-streams">
                {streamsPanel ?? <div className="streams-empty muted">Elegí un episodio para ver las fuentes disponibles.</div>}
              </aside>
            )}
          </div>
        </section>
      ) : (
        <section className="movie-streams">
          <h2>Fuentes</h2>
          <StreamList meta={fullMeta} />
        </section>
      )}

      {tmdb && <TmdbSections details={tmdb} type={toTmdbType(type)} />}
      {id.startsWith('tt') && <WikiTrivia imdbId={id} />}
    </div>
  )
}
