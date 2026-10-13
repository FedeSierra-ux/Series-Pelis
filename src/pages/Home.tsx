import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PosterCard } from '../components/PosterCard'
import { ImdbRating } from '../components/Rating'
import { Row } from '../components/Row'
import { browsableCatalogs } from '../lib/addons'
import { episodeLabel } from '../lib/format'
import { useAddons, useCatalog, useTitle } from '../lib/hooks'
import { catalogLabel, genreLabel } from '../lib/i18n'
import { continueWatching, progressStore, toggleWatchlist, useStore, watchlistStore } from '../lib/store'
import type { CatalogDef, InstalledAddon, MetaPreview } from '../lib/types'

const ROW_LIMIT = 30

/** Carga el catálogo recién cuando la fila se acerca a la pantalla. */
function useNearViewport<T extends Element>(eager: boolean) {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(eager)
  useEffect(() => {
    if (visible || !ref.current) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), {
      rootMargin: '600px 0px',
    })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [visible])
  return [ref, visible] as const
}

function CatalogRow({ addon, catalog, eager }: { addon: InstalledAddon; catalog: CatalogDef; eager: boolean }) {
  const [ref, visible] = useNearViewport<HTMLDivElement>(eager)
  const { data, loading, error } = useCatalog(visible ? addon : undefined, visible ? catalog : undefined)
  const items = data?.slice(0, ROW_LIMIT) ?? []
  const moreTo = `/discover/${catalog.type}?addon=${encodeURIComponent(addon.transportUrl)}&catalog=${encodeURIComponent(catalog.id)}`
  return (
    <div ref={ref}>
      <Row
        title={catalogLabel(catalog.name, catalog.type, addon.manifest.name)}
        moreTo={moreTo}
        loading={loading || !visible}
        error={error}
        empty={items.length === 0}
      >
        {items.map((m, i) => (
          <PosterCard key={m.id} meta={{ ...m, type: m.type ?? catalog.type }} eager={eager && i < 6} />
        ))}
      </Row>
    </div>
  )
}

function Hero({ addon, catalog }: { addon: InstalledAddon; catalog: CatalogDef }) {
  const { data } = useCatalog(addon, catalog)
  const watchlist = useStore(watchlistStore)
  const [index, setIndex] = useState(0)
  const pool = (data ?? []).filter((m) => m.background || m.id.startsWith('tt')).slice(0, 8)

  useEffect(() => {
    if (pool.length < 2) return
    const t = setInterval(() => setIndex((i) => (i + 1) % pool.length), 9000)
    return () => clearInterval(t)
  }, [pool.length])

  const meta: MetaPreview | undefined = pool[index]
  if (!meta) return <div className="hero hero-skeleton skeleton" />
  const bg = meta.id.startsWith('tt') ? `https://images.metahub.space/background/medium/${meta.id}/img` : meta.background
  const genres = (meta.genre ?? meta.genres ?? []).slice(0, 3).map(genreLabel).join(' · ')
  const type = meta.type ?? catalog.type
  return (
    <section className="hero" style={{ backgroundImage: bg ? `url(${bg})` : undefined }}>
      <div className="hero-shade" />
      <div className="hero-content">
        <h1>{meta.name}</h1>
        <div className="hero-meta">
          <ImdbRating value={meta.imdbRating} />
          {meta.releaseInfo && <span>{meta.releaseInfo}</span>}
          {genres && <span>{genres}</span>}
        </div>
        {meta.description && <p className="hero-desc">{meta.description}</p>}
        <div className="hero-actions">
          <Link className="btn btn-primary" to={`/detail/${type}/${encodeURIComponent(meta.id)}`}>
            ▶ Ver ahora
          </Link>
          <button className="btn" onClick={() => toggleWatchlist({ ...meta, type })}>
            {watchlist[meta.id] ? '✓ En mi lista' : '+ Mi lista'}
          </button>
        </div>
      </div>
      {pool.length > 1 && (
        <div className="hero-dots" aria-hidden>
          {pool.map((m, i) => (
            <span key={m.id} className={i === index ? 'active' : ''} />
          ))}
        </div>
      )}
    </section>
  )
}

export function Home() {
  useTitle(undefined)
  const addons = useAddons()
  const progress = useStore(progressStore)
  const catalogs = browsableCatalogs(addons)
  const resume = continueWatching(progress)
  const heroSource = catalogs.find((c) => c.catalog.type === 'movie') ?? catalogs[0]

  return (
    <div className="page home" data-nav-root>
      {heroSource && <Hero addon={heroSource.addon} catalog={heroSource.catalog} />}

      {resume.length > 0 && (
        <Row title="Seguir viendo" moreTo="/history">
          {resume.map((e) => (
            <PosterCard
              key={e.videoId}
              meta={{ id: e.metaId, type: e.type, name: e.name, poster: e.poster }}
              progress={e.duration ? e.position / e.duration : 0}
              subtitle={e.season !== undefined ? episodeLabel(e.season, e.episode) : 'Continuar'}
              to={`/detail/${e.type}/${encodeURIComponent(e.metaId)}${e.season !== undefined ? `?season=${e.season}&video=${encodeURIComponent(e.videoId)}` : ''}`}
            />
          ))}
        </Row>
      )}

      {catalogs.map(({ addon, catalog }, i) => (
        <CatalogRow key={`${addon.transportUrl}|${catalog.type}|${catalog.id}`} addon={addon} catalog={catalog} eager={i < 3} />
      ))}

      {catalogs.length === 0 && (
        <div className="empty">
          No hay catálogos. <Link to="/settings">Agregá un addon</Link> para empezar.
        </div>
      )}
    </div>
  )
}
