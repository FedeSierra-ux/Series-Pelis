import { useState } from 'react'
import { Link } from 'react-router-dom'
import { backdropFor } from '../../components/ContinueCard'
import { ImdbRating } from '../../components/Rating'
import { seriesYear } from '../../lib/format'
import { typeLabel } from '../../lib/i18n'
import { toggleWatchlist, useStore, watchlistStore } from '../../lib/store'
import type { MetaPreview } from '../../lib/types'
import { HeroIcon } from '../home/HeroInfo'

// v0.14 (U14): el mejor resultado de "Todo", destacado como en Prime o Max: fondo, logo (o el nombre),
// año y tipo, IMDb, "Ver ahora" (la ficha, como en la portada) y Mi lista.

const logoFor = (m: MetaPreview) => m.logo ?? (m.id.startsWith('tt') ? `https://images.metahub.space/logo/medium/${m.id}/img` : undefined)

export function BestResult({ meta }: { meta: MetaPreview }) {
  const inList = !!useStore(watchlistStore)[meta.id]
  const [brokenLogo, setBrokenLogo] = useState<string>()
  const [brokenBg, setBrokenBg] = useState<string>()
  const bg = backdropFor(meta.id, meta.background) ?? meta.poster
  const logo = logoFor(meta)
  const showLogo = logo && logo !== brokenLogo ? logo : undefined
  const to = `/detail/${meta.type}/${encodeURIComponent(meta.id)}`
  const year = seriesYear(meta.releaseInfo ?? meta.year)
  return (
    <section className="search-best" aria-labelledby="search-best-title">
      <div className="search-best-art" aria-hidden>
        {bg && bg !== brokenBg && <img src={bg} alt="" decoding="async" onError={() => setBrokenBg(bg)} />}
      </div>
      <div className="search-best-body">
        <span className="search-best-eyebrow">Mejor resultado</span>
        <h2 id="search-best-title" className={`search-best-title${showLogo ? ' has-logo' : ''}`}>
          {showLogo ? <img src={showLogo} alt={meta.name} onError={() => setBrokenLogo(showLogo)} /> : meta.name}
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
            onClick={() => toggleWatchlist(meta)}
          >
            <HeroIcon name={inList ? 'check' : 'plus'} />
            <span>{inList ? 'En mi lista' : 'Mi lista'}</span>
          </button>
        </div>
      </div>
    </section>
  )
}
