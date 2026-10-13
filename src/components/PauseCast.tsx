import { useEffect, useState } from 'react'
import { getMeta } from '../lib/addons'
import { addonsStore } from '../lib/store'
import { findByImdb, getDetails, getEpisodeCast, getEpisodeInfo, hasTmdb, tmdbImg, type TmdbCast } from '../lib/tmdb'

interface Props {
  imdbId: string
  type: string
  season?: number
  episode?: number
  /** id del episodio (`tt123:1:2`), para buscar la sinopsis en Cinemeta si no hay TMDB. */
  videoId?: string
  /** Se muestra solo mientras está en pausa (con una pequeña demora para no aparecer al saltar). */
  visible: boolean
}

const DELAY_MS = 1200
const MAX = 10

interface Person extends TmdbCast {
  guest?: boolean
}

interface Info {
  title?: string
  overview?: string
}

/** Título y sinopsis: TMDB en español si hay key; si no (o viene vacía), Cinemeta en inglés. */
async function loadInfo(imdbId: string, type: string, season?: number, episode?: number, videoId?: string): Promise<Info> {
  const isEpisode = type !== 'movie' && season !== undefined && episode !== undefined
  let info: Info = {}
  if (hasTmdb() && imdbId.startsWith('tt')) {
    try {
      const id = await findByImdb(imdbId, type)
      if (id && isEpisode) {
        const ep = await getEpisodeInfo(id, season, episode)
        info = { title: ep.name, overview: ep.overview }
      } else if (id && type === 'movie') {
        const d = await getDetails('movie', id)
        info = { title: d.title, overview: d.overview }
      }
    } catch {
      // seguimos con Cinemeta
    }
  }
  if (info.overview?.trim()) return info
  try {
    const meta = await getMeta(addonsStore.get(), type, imdbId)
    if (!isEpisode) return { title: info.title || meta.name, overview: meta.description }
    const v = meta.videos?.find((x) => x.id === videoId) ?? meta.videos?.find((x) => x.season === season && (x.episode ?? x.number) === episode)
    return { title: info.title || v?.title || v?.name, overview: v?.overview ?? v?.description }
  } catch {
    return info
  }
}

/**
 * Al pausar: título y sinopsis del episodio (o de la peli) y quién actúa. El reparto no es por
 * escena; TMDB no tiene esos datos. Nunca recibe foco ni clics.
 */
export function PauseCast({ imdbId, type, season, episode, videoId, visible }: Props) {
  const [people, setPeople] = useState<Person[]>()
  const [info, setInfo] = useState<Info>()
  const [show, setShow] = useState(false)

  useEffect(() => {
    setPeople(undefined)
    if (!hasTmdb() || !imdbId.startsWith('tt')) return
    let alive = true
    ;(async () => {
      const id = await findByImdb(imdbId, type)
      if (!id) return
      let list: Person[]
      if (type === 'movie') {
        list = (await getDetails('movie', id)).credits?.cast ?? []
      } else if (season !== undefined && episode !== undefined) {
        const { cast, guests } = await getEpisodeCast(id, season, episode)
        list = [...cast, ...guests.map((g) => ({ ...g, guest: true }))]
      } else {
        list = ((await getDetails('tv', id)).aggregate_credits?.cast ?? []).map((c) => ({ ...c, character: c.roles?.[0]?.character }))
      }
      if (alive) setPeople(list.filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i).slice(0, MAX))
    })().catch(() => {})
    return () => {
      alive = false
    }
  }, [imdbId, type, season, episode])

  useEffect(() => {
    setInfo(undefined)
    let alive = true
    loadInfo(imdbId, type, season, episode, videoId).then((i) => {
      if (alive) setInfo(i)
    })
    return () => {
      alive = false
    }
  }, [imdbId, type, season, episode, videoId])

  useEffect(() => {
    if (!visible) {
      setShow(false)
      return
    }
    const t = setTimeout(() => setShow(true), DELAY_MS)
    return () => clearTimeout(t)
  }, [visible])

  const isEpisode = season !== undefined && episode !== undefined
  const label = isEpisode ? `T${season} E${episode}${info?.title ? ` · ${info.title}` : ''}` : info?.title
  const overview = info?.overview?.trim()
  if (!people?.length && !overview && !label) return null
  return (
    <aside className={`pause-cast ${show ? 'visible' : ''}`} aria-label="En pausa" aria-hidden={!show}>
      {(label || overview) && (
        <div className="pause-info">
          {label && <strong className="pause-info-title">{label}</strong>}
          {overview && <p className="pause-info-overview">{overview}</p>}
        </div>
      )}
      {!!people?.length && (
        <>
          <h2>{type === 'movie' ? 'Reparto' : 'En este episodio'}</h2>
          <ul>
            {people.map((p) => {
              const img = tmdbImg(p.profile_path, 'w185')
              return (
                <li key={p.id}>
                  {img ? <img src={img} alt="" loading="lazy" /> : <span className="pause-cast-ph">{p.name[0]}</span>}
                  <span className="pause-cast-text">
                    <strong>{p.name}</strong>
                    {p.character && <span>{p.character}</span>}
                    {p.guest && <em>Invitado</em>}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </aside>
  )
}
