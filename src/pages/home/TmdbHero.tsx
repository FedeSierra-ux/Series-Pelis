import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { settingsStore, toggleWatchlist, useStore, watchlistStore } from '../../lib/store'
import {
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

/** Pantalla ancha, sin ahorro de datos y sin "reducir movimiento". */
function trailerAllowed(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return (
    window.matchMedia('(min-width: 760px)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
    !conn?.saveData
  )
}

const trailerUrl = (key: string) =>
  `https://www.youtube-nocookie.com/embed/${key}?autoplay=1&mute=1&controls=0&playsinline=1&loop=1&playlist=${key}&modestbranding=1&rel=0`

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

/** Portada de Inicio con las tendencias del día de TMDB: logo, sinopsis en español y tráiler. */
export function TmdbHero({ items }: { items: TmdbListItem[] }) {
  const settings = useStore(settingsStore)
  const watchlist = useStore(watchlistStore)
  const ref = useRef<HTMLElement>(null)
  const onScreen = useOnScreen(ref)
  const [index, setIndex] = useState(0)
  const [details, setDetails] = useState<{ key: string; data: TmdbDetails }>()
  const [playing, setPlaying] = useState<string>()
  const [trailerReady, setTrailerReady] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState<{ key: string; imdb?: string }>()
  const [brokenLogo, setBrokenLogo] = useState<string>()

  const item = items[index % items.length]
  const type = (item.media_type === 'tv' ? 'tv' : 'movie') as TmdbType
  const itemKey = `${type}:${item.id}`
  // Solo usamos los detalles del slide actual (nunca los del anterior mientras carga el nuevo).
  const d = details?.key === itemKey ? details.data : undefined
  const trailer = settings.heroTrailer ? pickTrailer(d?.videos?.results) : undefined
  const trailerOn = !!trailer && playing === trailer.key

  // Detalles (logo, tráiler, géneros, id de IMDb) solo del slide visible; quedan en caché.
  useEffect(() => {
    let alive = true
    getDetails(type, item.id)
      .then((data) => alive && setDetails({ key: itemKey, data }))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [itemKey])

  // Rotación automática; se frena mientras se ve el tráiler.
  useEffect(() => {
    if (items.length < 2 || trailerOn) return
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), ROTATE_MS)
    return () => clearInterval(t)
  }, [items.length, trailerOn])

  // Tráiler silenciado a los ~3 s de llegar al slide. Al cambiar de slide o salir de la vista se saca.
  useEffect(() => {
    setPlaying(undefined)
    setTrailerReady(false)
    if (!trailer || !onScreen) return
    const t = setTimeout(() => trailerAllowed() && setPlaying(trailer.key), TRAILER_DELAY_MS)
    return () => clearTimeout(t)
  }, [itemKey, trailer?.key, onScreen])

  useEffect(() => {
    if (!trailerOn || items.length < 2) return
    const t = setTimeout(() => setIndex((i) => (i + 1) % items.length), TRAILER_MAX_MS)
    return () => clearTimeout(t)
  }, [trailerOn, items.length])

  const title = itemTitle(item)
  const logoUrl = tmdbImg(pickLogo(d), 'w500')
  // Si el logo no carga, volvemos al título en texto.
  const logo = logoUrl !== brokenLogo ? logoUrl : undefined
  const overview = item.overview || d?.overview
  const genres = (d?.genres ?? []).slice(0, 3).map((g) => g.name).join(' · ')
  const year = itemYear(item)
  const imdbId = d?.external_ids?.imdb_id || d?.imdb_id || (resolved?.key === itemKey ? resolved.imdb : undefined)
  const inList = !!(imdbId && watchlist[imdbId])
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
    <section ref={ref} className="hero hero-tmdb" style={{ backgroundImage: item.backdrop_path ? `url(${tmdbImg(item.backdrop_path, 'w1280')})` : undefined }}>
      {trailerOn && (
        <div className={`hero-trailer${trailerReady ? ' ready' : ''}`} aria-hidden>
          <iframe
            key={trailer.key}
            src={trailerUrl(trailer.key)}
            title="Tráiler"
            tabIndex={-1}
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setTrailerReady(true)}
          />
        </div>
      )}
      <div className="hero-shade" />
      <div className="hero-content">
        <h1 className={logo ? 'hero-logo-title' : undefined}>{logo ? <img className="hero-logo" src={logo} alt={title} onError={() => setBrokenLogo(logo)} /> : title}</h1>
        <div className="hero-meta">
          {year && <span>{year}</span>}
          <span>{type === 'movie' ? 'Película' : 'Serie'}</span>
          {genres && <span>{genres}</span>}
        </div>
        {overview && <p className="hero-desc">{overview}</p>}
        <div className="hero-actions">
          <Link className="btn btn-primary" to={tmdbDetailPath(item)}>
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
    </section>
  )
}
