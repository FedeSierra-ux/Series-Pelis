import { useEffect, useState } from 'react'
import { findByImdb, getDetails, getEpisodeCast, hasTmdb, tmdbImg, type TmdbCast } from '../lib/tmdb'

interface Props {
  imdbId: string
  type: string
  season?: number
  episode?: number
  /** Se muestra solo mientras está en pausa (con una pequeña demora para no aparecer al saltar). */
  visible: boolean
}

const DELAY_MS = 1200
const MAX = 10

interface Person extends TmdbCast {
  guest?: boolean
}

/** Reparto al pausar: quién actúa en este episodio (o en la peli). No es por escena; TMDB no tiene esos datos. */
export function PauseCast({ imdbId, type, season, episode, visible }: Props) {
  const [people, setPeople] = useState<Person[]>()
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
    if (!visible) {
      setShow(false)
      return
    }
    const t = setTimeout(() => setShow(true), DELAY_MS)
    return () => clearTimeout(t)
  }, [visible])

  if (!people?.length) return null
  return (
    <aside className={`pause-cast ${show ? 'visible' : ''}`} aria-label="Reparto" aria-hidden={!show}>
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
    </aside>
  )
}
