import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { getMeta } from '../../lib/addons'
import { addonsStore, progressStore, toggleWatchlist, useStore, watchlistStore } from '../../lib/store'
import {
  formatRuntime,
  getDetails,
  imdbFromTmdb,
  itemTitle,
  itemYear,
  tmdbDetailPath,
  tmdbImg,
  toAppType,
  type TmdbDetails,
  type TmdbListItem,
  type TmdbType,
} from '../../lib/tmdb'
import { HeroCarousel } from './HeroCarousel'
import { HeroInfo } from './HeroInfo'
import { resumeLabel, useDirectPlay } from './useDirectPlay'

const CAST_SHOWN = 3

/**
 * Logo del título con su nombre original: primero en inglés, después sin idioma y el doblado al
 * final (el usuario no quiere los títulos traducidos, solo la sinopsis y los datos).
 */
function originalLogo(d: TmdbDetails | undefined): string | undefined {
  const rank = (l: { iso_639_1: string | null }) => (l.iso_639_1 === 'en' ? 0 : l.iso_639_1 === null ? 1 : l.iso_639_1 === 'es' ? 3 : 2)
  return [...(d?.images?.logos ?? [])].sort((a, b) => rank(a) - rank(b))[0]?.file_path
}

/** Título original si está en alfabeto latino; si no (japonés, coreano…), el que manda TMDB. */
function originalTitle(item: TmdbListItem): string {
  const orig = item.original_title ?? item.original_name
  return orig && /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u.test(orig) ? orig : itemTitle(item)
}

const typeOf = (item: TmdbListItem, fallback: TmdbType): TmdbType =>
  item.media_type === 'tv' || item.media_type === 'movie' ? item.media_type : fallback

interface Props {
  items: TmdbListItem[]
  /** `compact`: Inicio (carrusel en un banner redondeado). `full`: Películas / Series, de borde a borde y con reparto. */
  variant?: 'compact' | 'full'
  /** Para listas que no traen `media_type` (los estrenos). */
  fallbackType?: TmdbType
  /** Texto chico arriba del título, por ejemplo "Estrenos en cines". */
  eyebrow?: string
  /** Lo que va encima del borde de abajo de la portada (el Top 10 en Películas / Series). */
  children?: ReactNode
}

/**
 * Portada con TMDB: fondo del título, logo, puntaje de IMDb, año, duración, géneros, sinopsis en
 * español y (en la completa) reparto. Sin tráiler: el tráiler queda para cuando se pasa por un póster.
 */
export function TmdbHero({ items, variant = 'compact', fallbackType = 'movie', eyebrow, children }: Props) {
  const watchlist = useStore(watchlistStore)
  const progress = useStore(progressStore)
  const { pending, play, cancel } = useDirectPlay()
  const [index, setIndex] = useState(0)
  const [details, setDetails] = useState<{ key: string; data?: TmdbDetails }>()
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState<{ key: string; imdb?: string }>()
  const [cinemeta, setCinemeta] = useState<{ key: string; rating?: string; name?: string }>()

  const current = index % items.length
  const item = items[current]
  const type = typeOf(item, fallbackType)
  const itemKey = `${type}:${item.id}`
  // Solo usamos los detalles del slide actual (nunca los del anterior mientras carga el nuevo).
  const d = details?.key === itemKey ? details.data : undefined
  const detailsDone = details?.key === itemKey

  const backdropSize = variant === 'full' ? 'original' : 'w1280'
  const slides = useMemo(
    () =>
      items.map((it) => ({
        key: `${typeOf(it, fallbackType)}:${it.id}`,
        title: originalTitle(it),
        backdrop: tmdbImg(it.backdrop_path, backdropSize),
      })),
    [items, fallbackType, backdropSize],
  )

  // Detalles (logo, géneros, duración, reparto, id de IMDb) solo del slide visible; quedan en caché.
  // Si fallan, igual se muestra el título en texto (`data` vacío).
  useEffect(() => {
    let alive = true
    getDetails(type, item.id)
      .then((data) => {
        if (alive) setDetails({ key: itemKey, data })
      })
      .catch(() => {
        if (alive) setDetails({ key: itemKey })
      })
    return () => {
      alive = false
    }
  }, [itemKey])

  // Los detalles y el logo del siguiente se piden antes, así el cambio de slide no muestra huecos.
  const nextItem = items.length > 1 ? items[(current + 1) % items.length] : undefined
  const nextKey = nextItem ? `${typeOf(nextItem, fallbackType)}:${nextItem.id}` : undefined
  useEffect(() => {
    if (!nextItem) return
    let alive = true
    getDetails(typeOf(nextItem, fallbackType), nextItem.id)
      .then((data) => {
        const logo = tmdbImg(originalLogo(data), 'w500')
        if (alive && logo) new Image().src = logo
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [nextKey])

  const imdbId = d?.external_ids?.imdb_id || d?.imdb_id || (resolved?.key === itemKey ? resolved.imdb : undefined)

  // Puntaje de IMDb (y el nombre original) desde la ficha de Cinemeta; queda en caché y de paso precarga la ficha.
  useEffect(() => {
    if (!imdbId) return
    let alive = true
    getMeta(addonsStore.get(), toAppType(type), imdbId)
      .then((m) => {
        if (alive) setCinemeta({ key: itemKey, rating: m.imdbRating, name: m.name })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [itemKey, imdbId])

  const cm = cinemeta?.key === itemKey ? cinemeta : undefined
  const title = cm?.name || originalTitle(item)
  const logo = tmdbImg(originalLogo(d), 'w500')
  const overview = item.overview || d?.overview
  const genres = (d?.genres ?? []).slice(0, variant === 'full' ? 3 : 2).map((g) => g.name)
  const year = itemYear(item)
  // En las series la duración cambia en cada episodio: solo en las pelis.
  const runtime = type === 'movie' ? formatRuntime(d?.runtime || undefined) : ''
  const facts = [year, runtime, variant === 'compact' ? (type === 'movie' ? 'Película' : 'Serie') : ''].filter(Boolean)
  const cast =
    variant === 'full'
      ? (d?.credits?.cast ?? d?.aggregate_credits?.cast ?? [])
          .filter((c) => c.profile_path)
          .slice(0, CAST_SHOWN)
          .map((c) => ({ id: c.id, name: c.name, photo: tmdbImg(c.profile_path, 'w185') }))
      : undefined
  const inList = !!(imdbId && watchlist[imdbId])
  const appType = toAppType(type)

  // Si pasa a otro título mientras busca la fuente, la búsqueda del anterior ya no sirve.
  useEffect(() => {
    cancel()
  }, [itemKey, cancel])

  // "▶ Reproducir" / "Continuar": directo al reproductor; si no hay fuente, a la ficha como antes.
  const onPlay = () =>
    play(
      itemKey,
      async () => {
        let tt = imdbId
        if (!tt) {
          tt = await imdbFromTmdb(item.id, type).catch(() => undefined)
          setResolved({ key: itemKey, imdb: tt })
        }
        return tt ? { type: appType, metaId: tt } : undefined
      },
      tmdbDetailPath(item, fallbackType),
    )
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
    <HeroCarousel
      slides={slides}
      index={current}
      onIndex={setIndex}
      variant={variant}
      label={eyebrow ?? (type === 'tv' ? 'Series destacadas' : 'Películas destacadas')}
      row={children}
    >
      <HeroInfo
        key={itemKey}
        eyebrow={eyebrow}
        title={title}
        logo={logo}
        titleReady={detailsDone}
        rating={cm?.rating}
        facts={facts}
        genres={genres}
        overview={overview}
        cast={cast}
        to={tmdbDetailPath(item, fallbackType)}
        list={{ inList, busy: resolving, unavailable: notFound, onToggle: onList }}
        play={{ label: imdbId ? resumeLabel(imdbId, appType, progress) : 'Reproducir', busy: pending === itemKey, onPlay }}
      />
    </HeroCarousel>
  )
}
