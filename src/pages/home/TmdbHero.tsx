import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ImdbRating } from '../../components/Rating'
import { getMeta } from '../../lib/addons'
import { ytCommand, YT_LISTEN, YT_ORIGIN, ytPlayerState } from '../../lib/hoverTrailer'
import { addonsStore, settingsStore, toggleWatchlist, useStore, watchlistStore } from '../../lib/store'
import {
  formatRuntime,
  getDetails,
  imdbFromTmdb,
  itemTitle,
  itemYear,
  pickLogo,
  pickTrailer,
  tmdbDetailPath,
  tmdbImg,
  toAppType,
  type TmdbDetails,
  type TmdbListItem,
  type TmdbType,
} from '../../lib/tmdb'

const ROTATE_MS = 9000
const TRAILER_DELAY_MS = 3000
// Con el tráiler en loop la portada quedaría fija para siempre: pasado este tiempo sigue rotando.
const TRAILER_MAX_MS = 150_000
// Si YouTube no manda su estado (la API de mensajes no responde), mostramos el video igual pasado esto.
const STATE_FALLBACK_MS = 6000
const CAST_SHOWN = 3

/** Pantalla ancha, sin ahorro de datos y sin "reducir movimiento". */
function trailerAllowed(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return (
    window.matchMedia('(min-width: 760px)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    !conn?.saveData
  )
}

function trailerUrl(key: string) {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    controls: '0',
    playsinline: '1',
    loop: '1',
    playlist: key,
    modestbranding: '1',
    rel: '0',
    iv_load_policy: '3',
    disablekb: '1',
    fs: '0',
    // Para pausarlo y saber cuándo arranca de verdad (ver `ytPlayerState`).
    enablejsapi: '1',
    origin: location.origin,
  })
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(key)}?${params.toString()}`
}

/** La portada solo tiene sentido con el video a la vista y la pestaña abierta. */
function useOnScreen(ref: React.RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(true)
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden')
  useEffect(() => {
    const onVis = () => setPageVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', onVis)
    const el = ref.current
    const io = el ? new IntersectionObserver(([e]) => setInView(e.intersectionRatio >= 0.5), { threshold: [0, 0.5, 1] }) : undefined
    if (el) io?.observe(el)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      io?.disconnect()
    }
  }, [ref])
  return inView && pageVisible
}

interface Props {
  items: TmdbListItem[]
  /** `compact`: Inicio (no ocupa toda la parte de arriba). `full`: Películas, de borde a borde y con reparto. */
  variant?: 'compact' | 'full'
  /** Para listas que no traen `media_type` (los estrenos). */
  fallbackType?: TmdbType
  /** Texto chico arriba del título, por ejemplo "Estrenos en cines". */
  eyebrow?: string
  /** Lo que va encima del borde de abajo de la portada (la fila de tendencias en Películas). */
  children?: ReactNode
}

/**
 * Portada con logo, puntaje de IMDb, duración, sinopsis en español y tráiler. El tráiler no muestra
 * controles: aparece solo cuando ya está reproduciendo y se pausa tocando la portada (en la TV,
 * flecha arriba desde "Ver ahora" y OK).
 */
export function TmdbHero({ items, variant = 'compact', fallbackType = 'movie', eyebrow, children }: Props) {
  const settings = useStore(settingsStore)
  const watchlist = useStore(watchlistStore)
  const ref = useRef<HTMLElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const pauseBtn = useRef<HTMLButtonElement>(null)
  const onScreen = useOnScreen(ref)
  const [index, setIndex] = useState(0)
  const [details, setDetails] = useState<{ key: string; data: TmdbDetails }>()
  const [playing, setPlaying] = useState<string>()
  const [trailerReady, setTrailerReady] = useState(false)
  const [paused, setPaused] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState<{ key: string; imdb?: string }>()
  const [brokenLogo, setBrokenLogo] = useState<string>()
  const [rating, setRating] = useState<{ key: string; value?: string }>()
  const gotState = useRef(false)

  const item = items[index % items.length]
  const type: TmdbType = item.media_type === 'tv' || item.media_type === 'movie' ? item.media_type : fallbackType
  const itemKey = `${type}:${item.id}`
  // Solo usamos los detalles del slide actual (nunca los del anterior mientras carga el nuevo).
  const d = details?.key === itemKey ? details.data : undefined
  const trailer = settings.heroTrailer ? pickTrailer(d?.videos?.results) : undefined
  const trailerOn = !!trailer && playing === trailer.key

  // Detalles (logo, tráiler, géneros, duración, reparto, id de IMDb) solo del slide visible; quedan en caché.
  useEffect(() => {
    let alive = true
    getDetails(type, item.id)
      .then((data) => alive && setDetails({ key: itemKey, data }))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [itemKey])

  // Rotación automática; se frena mientras se ve (o está pausado) el tráiler.
  useEffect(() => {
    if (items.length < 2 || trailerOn) return
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS)
    return () => clearInterval(t)
  }, [items.length, trailerOn])

  // Tráiler silenciado a los ~3 s de llegar al slide. Al cambiar de slide o salir de la vista se saca.
  useEffect(() => {
    setPlaying(undefined)
    setTrailerReady(false)
    setPaused(false)
    gotState.current = false
    if (!trailer || !onScreen) return
    const t = setTimeout(() => {
      if (trailerAllowed()) setPlaying(trailer.key)
    }, TRAILER_DELAY_MS)
    return () => clearTimeout(t)
  }, [itemKey, trailer?.key, onScreen])

  useEffect(() => {
    if (!trailerOn || paused || items.length < 2) return
    const t = setTimeout(() => setIndex((i) => (i + 1) % items.length), TRAILER_MAX_MS)
    return () => clearTimeout(t)
  }, [trailerOn, paused, items.length])

  // El video se muestra recién cuando YouTube dice que está reproduciendo: antes (o si el navegador
  // frenó la reproducción automática) pone su botón grande de play encima, y eso no queremos que se vea.
  useEffect(() => {
    if (!trailerOn) return
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return
      const state = ytPlayerState(e.data)
      if (state === undefined) return
      gotState.current = true
      if (state === 1) setTrailerReady(true)
      else if (state === 2 || state === 5) setTrailerReady(false)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [trailerOn])

  const onFrameLoad = () => {
    frame.current?.contentWindow?.postMessage(YT_LISTEN, YT_ORIGIN)
    setTimeout(() => {
      if (!gotState.current) setTrailerReady(true)
    }, STATE_FALLBACK_MS)
  }

  // Pausado, el video se esconde (queda la imagen de fondo) para que no se vea el botón de YouTube.
  const togglePause = () => {
    if (!trailerOn) return
    const next = !paused
    frame.current?.contentWindow?.postMessage(ytCommand(next ? 'pauseVideo' : 'playVideo'), YT_ORIGIN)
    setPaused(next)
  }

  // Un clic en cualquier parte de la portada que no sea un botón o un enlace pausa o sigue el tráiler.
  const onHeroClick = (e: MouseEvent) => {
    if ((e.target as Element).closest('a, button')) return
    togglePause()
  }

  // Con el control remoto, ↑ desde "Ver ahora" o "Mi lista" va a la pausa (si no, el menú lateral queda más cerca).
  const onActionsKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' || !pauseBtn.current) return
    e.preventDefault()
    pauseBtn.current.focus({ preventScroll: true })
  }

  const title = itemTitle(item)
  const logoUrl = tmdbImg(pickLogo(d), 'w500')
  // Si el logo no carga, volvemos al título en texto.
  const logo = logoUrl !== brokenLogo ? logoUrl : undefined
  const overview = item.overview || d?.overview
  const genres = (d?.genres ?? []).slice(0, 3).map((g) => g.name).join(' · ')
  const year = itemYear(item)
  const runtime = formatRuntime(d?.runtime || d?.episode_run_time?.[0])
  const cast = variant === 'full' ? (d?.credits?.cast ?? d?.aggregate_credits?.cast ?? []).filter((c) => c.profile_path).slice(0, CAST_SHOWN) : []
  const imdbId = d?.external_ids?.imdb_id || d?.imdb_id || (resolved?.key === itemKey ? resolved.imdb : undefined)
  const inList = !!(imdbId && watchlist[imdbId])
  const imdbRating = rating?.key === itemKey ? rating.value : undefined
  const backdrop = tmdbImg(item.backdrop_path, variant === 'full' ? 'original' : 'w1280')

  // Puntaje de IMDb desde la ficha de Cinemeta (queda en caché y de paso precarga la ficha).
  useEffect(() => {
    if (!imdbId) return
    let alive = true
    getMeta(addonsStore.get(), toAppType(type), imdbId)
      .then((m) => alive && setRating({ key: itemKey, value: m.imdbRating }))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [itemKey, imdbId])
  const notFound = resolved?.key === itemKey && !resolved.imdb

  // "Mi lista" guarda por id de IMDb: si los detalles todavía no lo trajeron, lo pedimos al tocar.
  const onList = async () => {
    if (resolving) return
    let tt = imdbId
    if (!tt) {
      setResolving(true)
      tt = await imdbFromTmdb(item.id, type).catch(() => undefined)
      setResolving(false)
      setResolved({ key: itemKey, imdb: tt })
      if (!tt) return
    }
    toggleWatchlist({ id: tt, type: toAppType(type), name: title, poster: tmdbImg(item.poster_path, 'w342'), releaseInfo: year })
  }

  return (
    <section
      ref={ref}
      className={`hero hero-tmdb hero-${variant}${children ? ' hero-with-row' : ''}`}
      style={{ backgroundImage: backdrop ? `url(${backdrop})` : undefined }}
      onClick={onHeroClick}
    >
      {trailerOn && (
        <div className={`hero-trailer${trailerReady && !paused ? ' ready' : ''}`} aria-hidden>
          <iframe
            ref={frame}
            key={trailer.key}
            src={trailerUrl(trailer.key)}
            title="Tráiler"
            tabIndex={-1}
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={onFrameLoad}
          />
        </div>
      )}
      <div className="hero-shade" />
      {/* Sin ícono a la vista: es la franja de arriba de la portada, para pausar con el control remoto. */}
      {trailerOn && (
        <button
          ref={pauseBtn}
          type="button"
          className="hero-pause"
          aria-label={paused ? 'Seguir con el tráiler' : 'Pausar el tráiler'}
          aria-pressed={paused}
          onClick={togglePause}
        >
          <span className="hero-pause-hint">{paused ? 'OK: seguir el tráiler' : 'OK: pausar el tráiler'}</span>
        </button>
      )}
      <div className="hero-content">
        {eyebrow && <span className="hero-eyebrow">{eyebrow}</span>}
        <h1 className={logo ? 'hero-logo-title' : undefined}>{logo ? <img className="hero-logo" src={logo} alt={title} onError={() => setBrokenLogo(logo)} /> : title}</h1>
        <div className="hero-meta">
          <ImdbRating value={imdbRating} />
          {year && <span>{year}</span>}
          {runtime && <span>{runtime}</span>}
          {variant === 'compact' && <span>{type === 'movie' ? 'Película' : 'Serie'}</span>}
          {genres && <span>{genres}</span>}
        </div>
        {overview && <p className="hero-desc">{overview}</p>}
        {cast.length > 0 && (
          <ul className="hero-cast" aria-label="Reparto">
            {cast.map((c) => (
              <li key={c.id}>
                <img src={tmdbImg(c.profile_path, 'w185')} alt="" loading="lazy" />
                <span>{c.name}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="hero-actions" onKeyDown={onActionsKey}>
          <Link className="btn btn-primary" data-autofocus to={tmdbDetailPath(item, fallbackType)}>
            ▶ Ver ahora
          </Link>
          {/* aria-disabled en vez de disabled: así el control remoto no pierde el foco mientras resuelve. */}
          <button className="btn" onClick={onList} aria-disabled={resolving || undefined} aria-busy={resolving || undefined}>
            {resolving ? 'Agregando…' : notFound ? 'No disponible' : inList ? '✓ En mi lista' : '+ Mi lista'}
          </button>
        </div>
      </div>
      {items.length > 1 && (
        <div className="hero-dots" aria-hidden>
          {items.map((m, i) => (
            <span key={m.id} className={i === index % items.length ? 'active' : ''} />
          ))}
        </div>
      )}
      {children && <div className="hero-row">{children}</div>}
    </section>
  )
}
