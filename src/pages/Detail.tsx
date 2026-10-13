import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ImdbRating } from '../components/Rating'
import { ErrorBox } from '../components/Status'
import { getStreams, streamingServerUrl } from '../lib/addons'
import { episodeLabel, formatTime, relativeDate } from '../lib/format'
import { useAddons, useMeta, useTitle } from '../lib/hooks'
import { genreLabel, typeLabel } from '../lib/i18n'
import { progressStore, setWatched, settingsStore, toggleWatchlist, useStore, watchlistStore } from '../lib/store'
import type { AddonStreams, Meta, Stream, Video } from '../lib/types'

export interface PlayState {
  stream: Stream
  playUrl: string
  meta: Pick<Meta, 'id' | 'type' | 'name' | 'poster' | 'background' | 'logo'>
  video?: Pick<Video, 'id' | 'season' | 'episode' | 'title' | 'name'>
  /** Siguiente episodio, para el botón del reproductor. */
  nextVideoId?: string
  addonName: string
}

function episodeNumber(v: Video) {
  return v.episode ?? v.number
}

function sortVideos(videos: Video[]) {
  return [...videos].sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (episodeNumber(a) ?? 0) - (episodeNumber(b) ?? 0))
}

function streamLabel(s: Stream) {
  const lines = (s.title ?? s.description ?? '').split('\n').filter(Boolean)
  return { name: (s.name ?? '').replace(/\n/g, ' '), lines }
}

/** Cómo se va a reproducir este stream en la app, o por qué no se puede. */
function playable(s: Stream, server: string): { url?: string; external?: string; reason?: string } {
  if (s.url) return { url: s.url }
  if (s.ytId) return { external: `https://www.youtube.com/watch?v=${s.ytId}` }
  if (s.externalUrl) return { external: s.externalUrl }
  if (s.infoHash) {
    const url = streamingServerUrl(server, s)
    return url ? { url } : { reason: 'Torrent: necesita el servidor de Stremio (ver Ajustes) o un addon con debrid' }
  }
  return { reason: 'Formato no soportado' }
}

function StreamList({
  meta,
  video,
  nextVideoId,
}: {
  meta: Meta
  video?: Video
  nextVideoId?: string
}) {
  const addons = useAddons()
  const settings = useStore(settingsStore)
  const navigate = useNavigate()
  const [groups, setGroups] = useState<AddonStreams[]>([])
  const videoId = video?.id ?? meta.id

  useEffect(() => getStreams(addons, meta.type, videoId, setGroups), [addons, meta.type, videoId])

  if (groups.length === 0) {
    return (
      <div className="streams-empty">
        <p>Ningún addon instalado ofrece streams para este título.</p>
        <p className="muted">
          Agregá tus addons de Stremio (por ejemplo uno configurado con tu Real-Debrid o TorBox) en{' '}
          <Link to="/settings">Ajustes</Link>.
        </p>
      </div>
    )
  }

  const play = (s: Stream, url: string, addonName: string) => {
    const state: PlayState = {
      stream: s,
      playUrl: url,
      meta: { id: meta.id, type: meta.type, name: meta.name, poster: meta.poster, background: meta.background, logo: meta.logo },
      video: video && { id: video.id, season: video.season, episode: episodeNumber(video), title: video.title, name: video.name },
      nextVideoId,
      addonName,
    }
    navigate(`/watch/${meta.type}/${encodeURIComponent(videoId)}`, { state })
  }

  const total = groups.reduce((n, g) => n + g.streams.length, 0)
  const loading = groups.some((g) => g.loading)

  return (
    <div className="streams">
      <div className="streams-status muted">
        {loading ? `Buscando streams… (${total} hasta ahora)` : `${total} streams encontrados`}
      </div>
      {groups.map((g) => (
        <section key={g.addon.transportUrl} className="stream-group">
          <h3>
            {g.addon.manifest.name}
            {g.loading && <span className="spinner" aria-label="Cargando" />}
          </h3>
          {g.error && <p className="muted small">No respondió: {g.error}</p>}
          {!g.loading && !g.error && g.streams.length === 0 && <p className="muted small">Sin resultados.</p>}
          <div className="stream-items">
            {g.streams.map((s, i) => {
              const { name, lines } = streamLabel(s)
              const p = playable(s, settings.streamingServerUrl)
              const content = (
                <>
                  <span className="stream-name">{name || g.addon.manifest.name}</span>
                  <span className="stream-title">
                    {lines.map((l, j) => (
                      <span key={j}>{l}</span>
                    ))}
                  </span>
                  {p.reason && <span className="stream-warn">{p.reason}</span>}
                  {s.behaviorHints?.notWebReady && p.url && (
                    <span className="stream-warn">Puede no reproducirse en el navegador (formato MKV/HEVC)</span>
                  )}
                </>
              )
              if (p.url)
                return (
                  <button key={i} className="stream-item" onClick={() => play(s, p.url!, g.addon.manifest.name)}>
                    {content}
                  </button>
                )
              if (p.external)
                return (
                  <a key={i} className="stream-item" href={p.external} target="_blank" rel="noreferrer">
                    {content}
                  </a>
                )
              return (
                <div key={i} className="stream-item disabled" tabIndex={-1}>
                  {content}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

export function Detail() {
  const { type = 'movie', id: rawId = '' } = useParams()
  const id = decodeURIComponent(rawId)
  const [params, setParams] = useSearchParams()
  const { data: meta, loading, error } = useMeta(type, id)
  const progress = useStore(progressStore)
  const watchlist = useStore(watchlistStore)
  useTitle(meta?.name)

  const videos = useMemo(() => sortVideos(meta?.videos ?? []), [meta?.videos])
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
  const nextVideo = selectedVideo ? videos[videos.indexOf(selectedVideo) + 1] : undefined

  if (loading && !meta) return <div className="page detail-skeleton"><div className="hero skeleton" /></div>
  if (error && !meta) return <div className="page"><ErrorBox message={`No se pudo cargar: ${error}`} /></div>
  if (!meta) return null

  const fullMeta: Meta = { ...meta, type }
  const bg = meta.background ?? (id.startsWith('tt') ? `https://images.metahub.space/background/medium/${id}/img` : undefined)
  const genres = (meta.genre ?? meta.genres ?? []).map(genreLabel)
  const movieProgress = progress[id]
  const trailer = meta.trailerStreams?.[0]?.ytId ?? meta.trailers?.find((t) => t.type === 'Trailer')?.source

  const selectVideo = (v: Video) => {
    const next = new URLSearchParams(params)
    next.set('season', String(v.season ?? 0))
    next.set('video', v.id)
    setParams(next, { replace: true })
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

  return (
    <div className="page detail">
      <section className="detail-hero" style={{ backgroundImage: bg ? `url(${bg})` : undefined }}>
        <div className="hero-shade" />
        <div className="detail-head">
          {meta.poster && <img className="detail-poster" src={meta.poster} alt="" />}
          <div className="detail-info">
            {meta.logo ? <img className="detail-logo" src={meta.logo} alt={meta.name} /> : <h1>{meta.name}</h1>}
            <div className="hero-meta">
              <ImdbRating value={meta.imdbRating} />
              <span>{typeLabel(type, false)}</span>
              {meta.releaseInfo && <span>{meta.releaseInfo}</span>}
              {meta.runtime && <span>{meta.runtime}</span>}
            </div>
            {genres.length > 0 && <div className="chips">{genres.map((g) => <span key={g} className="chip">{g}</span>)}</div>}
            {meta.description && <p className="detail-desc">{meta.description}</p>}
            <dl className="credits">
              {meta.director?.length ? (<><dt>Dirección</dt><dd>{meta.director.join(', ')}</dd></>) : null}
              {meta.cast?.length ? (<><dt>Elenco</dt><dd>{meta.cast.slice(0, 6).join(', ')}</dd></>) : null}
              {meta.awards ? (<><dt>Premios</dt><dd>{meta.awards}</dd></>) : null}
            </dl>
            <div className="hero-actions">
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
            </div>
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
          <div className="episodes-layout">
            <ol className="episodes">
              {videos
                .filter((v) => (v.season ?? 0) === season)
                .map((v) => {
                  const p = progress[v.id]
                  const released = v.released ?? v.firstAired
                  const upcoming = released ? new Date(released).getTime() > Date.now() : false
                  return (
                    <li key={v.id} className={`episode ${v.id === selectedVideoId ? 'selected' : ''} ${p?.watched ? 'watched' : ''}`}>
                      <button className="episode-main" onClick={() => selectVideo(v)}>
                        <div className="episode-thumb">
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
                            {released && new Date(released).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {upcoming && ' · Próximamente'}
                            {v.rating && ` · ★ ${v.rating}`}
                          </span>
                          {(v.overview ?? v.description) && <span className="episode-desc">{v.overview ?? v.description}</span>}
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
                    </li>
                  )
                })}
            </ol>
            <aside className="episode-streams">
              {selectedVideo ? (
                <>
                  <h2>
                    {episodeLabel(selectedVideo.season, episodeNumber(selectedVideo))} ·{' '}
                    {selectedVideo.title ?? selectedVideo.name}
                  </h2>
                  <StreamList meta={fullMeta} video={selectedVideo} nextVideoId={nextVideo?.id} />
                </>
              ) : (
                <div className="streams-empty muted">Elegí un episodio para ver los streams disponibles.</div>
              )}
            </aside>
          </div>
        </section>
      ) : (
        <section className="movie-streams">
          <h2>Streams</h2>
          <StreamList meta={fullMeta} />
        </section>
      )}
    </div>
  )
}
