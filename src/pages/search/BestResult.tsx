import { useState } from 'react'
import { Link } from 'react-router-dom'
import { backdropFor } from '../../components/ContinueCard'
import { ImdbRating } from '../../components/Rating'
import { displayYear } from '../../lib/yearLabel'
import { typeLabel } from '../../lib/i18n'
import { useLocalTitle } from '../../lib/localTitles'
import { rememberTitle, spanishName } from '../../lib/localTitlesStore'
import type { SearchMeta } from '../../lib/searchResults'
import { toggleWatchlist, useStore, watchlistStore } from '../../lib/store'
import { imdbFromTmdb, parseTmdbId } from '../../lib/tmdb'
import type { MetaPreview } from '../../lib/types'
import { HeroIcon } from '../home/HeroInfo'

// v0.14 (U14): el mejor resultado de "Todo", destacado como en Prime o Max: fondo, logo (o el nombre),
// año y tipo, IMDb, "Ver ahora" (la ficha, como en la portada) y Mi lista.

const logoFor = (m: MetaPreview) => m.logo ?? (m.id.startsWith('tt') ? `https://images.metahub.space/logo/medium/${m.id}/img` : undefined)

export function BestResult({ meta }: { meta: SearchMeta }) {
  // v0.28: el nombre en español (los de TMDB ya lo traen; los de los addons, del mapa de nombres).
  const name = useLocalTitle(meta.id, meta.name, { type: meta.type })
  const tmdb = parseTmdbId(meta.id)
  // Un resultado de TMDB va a Mi lista con su id de IMDb (como todo lo guardado): se averigua al tocar.
  const [imdb, setImdb] = useState<string>()
  const [resolving, setResolving] = useState(false)
  const inList = !!useStore(watchlistStore)[imdb ?? meta.id]
  const onList = async () => {
    if (!tmdb) return toggleWatchlist(meta)
    if (resolving) return
    let tt = imdb
    if (!tt) {
      setResolving(true)
      tt = await imdbFromTmdb(tmdb.id, tmdb.type).catch(() => undefined)
      setResolving(false)
      if (!tt) return
      setImdb(tt)
      // Lo de TMDB es seguro (mismo id): el nombre en español queda anotado para Mi lista y las tarjetas.
      rememberTitle(tt, { id: tmdb.id, title: meta.name, original_title: meta.originalName }, tmdb.type)
    }
    toggleWatchlist({ ...meta, id: tt, name: savedName(meta) })
  }
  const [brokenLogo, setBrokenLogo] = useState<string>()
  const [brokenBg, setBrokenBg] = useState<string[]>([])
  // Si el fondo no carga, el póster (antes quedaba una caja vacía).
  const bg = [backdropFor(meta.id, meta.background), meta.poster].find((u) => u && !brokenBg.includes(u))
  const logo = logoFor(meta)
  const showLogo = logo && logo !== brokenLogo ? logo : undefined
  const to = `/detail/${meta.type}/${encodeURIComponent(meta.id)}`
  const year = displayYear(meta)
  return (
    <section className="search-best" aria-labelledby="search-best-title">
      <div className="search-best-art" aria-hidden>
        {bg && <img key={bg} src={bg} alt="" decoding="async" onError={() => setBrokenBg((b) => [...b, bg])} />}
      </div>
      <div className="search-best-body">
        <span className="search-best-eyebrow">Mejor resultado</span>
        <h2 id="search-best-title" className={`search-best-title${showLogo ? ' has-logo' : ''}`}>
          {showLogo ? <img src={showLogo} alt={name} onError={() => setBrokenLogo(showLogo)} /> : name}
        </h2>
        <p className="search-best-facts">
          <ImdbRating value={meta.imdbRating} />
          {year && <span>{year}</span>}
          <span>{typeLabel(meta.type, false)}</span>
        </p>
        <div className="search-best-actions">
          <Link to={to} className="search-best-btn is-play">
            <HeroIcon name="play" />
            <span>Ver ahora</span>
          </Link>
          <button
            type="button"
            className={`search-best-btn is-ghost${inList ? ' is-on' : ''}`}
            aria-pressed={inList}
            // `aria-disabled` y no `disabled`: con `disabled` la TV pierde el foco (v0.27).
            aria-disabled={resolving || undefined}
            onClick={onList}
          >
            <HeroIcon name={inList ? 'check' : 'plus'} />
            <span>{inList ? 'En mi lista' : 'Mi lista'}</span>
          </button>
        </div>
      </div>
    </section>
  )
}

/**
 * Lo guardado va con el nombre original (v0.28: se traduce al mostrar). De TMDB solo se sabe el original de
 * verdad, que puede estar en otro alfabeto (coreano, japonés…): en ese caso, el español.
 */
function savedName(meta: SearchMeta): string {
  // `spanishName` es la misma vara que usa el mapa: un nombre en alfabeto latino sirve tal cual.
  return spanishName({ title: meta.originalName }) ?? meta.name
}
