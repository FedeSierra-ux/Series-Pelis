import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { CINEMETA_URL } from '../lib/addons'
import { genreLabel } from '../lib/i18n'
import type { TmdbDetails } from '../lib/tmdb'

// Etiquetas clickeables de la ficha (v0.5): género → Descubrir filtrado, persona → su página.
// (Las palabras clave se fueron con la pestaña Detalles en la v0.24.)

/** Géneros de TMDB ({id, name} en español) o, sin TMDB, los de Cinemeta (en inglés). */
export function GenreChips({ type, tmdbGenres, names }: { type: string; tmdbGenres?: { id: number; name: string }[]; names?: string[] }) {
  const links = tmdbGenres?.length
    ? tmdbGenres.map((g) => ({ key: `t${g.id}`, label: g.name, to: `/discover/${type}?src=tmdb&genre=${g.id}` }))
    : (names ?? []).map((g) => ({
        key: g,
        label: genreLabel(g),
        to: `/discover/${type}?addon=${encodeURIComponent(CINEMETA_URL)}&catalog=top&genre=${encodeURIComponent(g)}`,
      }))
  if (links.length === 0) return null
  return (
    <div className="chips">
      {links.map((l) => (
        <Link key={l.key} to={l.to} className="chip chip-link" title={`Ver más de ${l.label}`}>
          {l.label}
        </Link>
      ))}
    </div>
  )
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/** Ids de TMDB de directores/creadores y elenco, por nombre, para que los nombres sean links. */
export function tmdbPeopleIndex(details: TmdbDetails | undefined): Map<string, number> {
  const map = new Map<string, number>()
  const add = (p: { id: number; name: string }) => !map.has(norm(p.name)) && map.set(norm(p.name), p.id)
  const extra = details as (TmdbDetails & { created_by?: { id: number; name: string }[] }) | undefined
  extra?.created_by?.forEach(add)
  details?.credits?.crew.forEach(add)
  details?.credits?.cast.forEach(add)
  details?.aggregate_credits?.cast.forEach(add)
  return map
}

/** Nombres separados por coma: a la página de la persona si TMDB la conoce, si no a Buscar. */
export function PeopleLinks({ names, index }: { names: string[]; index?: Map<string, number> }) {
  return (
    <>
      {names.map((name, i) => {
        const id = index?.get(norm(name))
        return (
          <Fragment key={name}>
            {i > 0 && ', '}
            <Link className="person-link" to={id ? `/person/${id}` : `/search?q=${encodeURIComponent(name)}`}>
              {name}
            </Link>
          </Fragment>
        )
      })}
    </>
  )
}
