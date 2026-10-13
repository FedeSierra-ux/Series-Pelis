import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PosterCard } from '../components/PosterCard'
import { ImdbRating } from '../components/Rating'
import { Row } from '../components/Row'
import { browsableCatalogs } from '../lib/addons'
import { episodeLabel } from '../lib/format'
import { useAddons, useCatalog, useTitle } from '../lib/hooks'
import { catalogLabel, genreLabel } from '../lib/i18n'
import { continueWatching, hideFromContinue, progressStore, settingsStore, toggleWatchlist, useStore, watchlistStore, type WatchEntry } from '../lib/store'
import { episodeLink, useUpNext } from '../lib/upNext'
import type { CatalogDef, InstalledAddon, MetaPreview } from '../lib/types'
import { useNearViewport } from './home/lazy'
import { TmdbHero } from './home/TmdbHero'
import { BecauseRow, onlyTitles, Top10Row, TrendingWeekRow, useTrending, type Seed } from './home/TmdbRows'

const ROW_LIMIT = 30

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

const UNDO_MS = 5000

/** Aviso "Quitado de Seguir viendo · Deshacer" que se va solo a los 5 s. */
function useUndoHide() {
  const [undo, setUndo] = useState<{ name: string; ids: string[] }>()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const hide = useCallback((metaId: string, name: string) => {
    // Guardamos qué entradas estaban visibles para devolver exactamente esas.
    const ids = Object.values(progressStore.get())
      .filter((e) => e.metaId === metaId && !e.hidden)
      .map((e) => e.videoId)
    hideFromContinue(metaId)
    setUndo({ name, ids })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setUndo(undefined), UNDO_MS)
  }, [])

  const restore = useCallback(() => {
    if (!undo) return
    progressStore.set((all) => {
      const copy = { ...all }
      for (const id of undo.ids) {
        if (!copy[id]) continue
        const { hidden: _hidden, ...rest } = copy[id]
        copy[id] = rest
      }
      return copy
    })
    clearTimeout(timer.current)
    setUndo(undefined)
  }, [undo])

  return { undo, hide, restore }
}

function UpNextRow() {
  const { data } = useUpNext()
  const items = data?.next ?? []
  if (items.length === 0) return null
  return (
    <Row title="Tus series: siguiente episodio">
      {items.map((it) => (
        <PosterCard
          key={it.videoId}
          meta={{ id: it.metaId, type: 'series', name: it.seriesName, poster: it.poster }}
          progress={it.progress}
          subtitle={episodeLabel(it.season, it.episode) || 'Siguiente'}
          to={episodeLink(it.metaId, it.season, it.videoId)}
        />
      ))}
    </Row>
  )
}

/** Los 2 títulos distintos vistos más recientemente (para "Porque viste…"). */
function recentSeeds(progress: Record<string, WatchEntry>): Seed[] {
  const seeds: Seed[] = []
  const sorted = Object.values(progress)
    .filter((e) => !e.hidden && e.metaId.startsWith('tt'))
    .sort((a, b) => b.updatedAt - a.updatedAt)
  for (const e of sorted) {
    if (seeds.some((s) => s.metaId === e.metaId)) continue
    seeds.push({ metaId: e.metaId, type: e.type, name: e.name })
    if (seeds.length === 2) break
  }
  return seeds
}

export function Home() {
  useTitle(undefined)
  const addons = useAddons()
  const progress = useStore(progressStore)
  const catalogs = browsableCatalogs(addons)
  const resume = continueWatching(progress)
  const heroSource = catalogs.find((c) => c.catalog.type === 'movie') ?? catalogs[0]
  const { undo, hide, restore } = useUndoHide()
  // TMDB es opcional: sin key, Inicio queda igual que siempre.
  const tmdbKey = useStore(settingsStore).tmdbKey.trim()
  const trendingDay = useTrending('day', tmdbKey)
  const heroItems = useMemo(() => onlyTitles(trendingDay.data?.results).filter((i) => i.backdrop_path).slice(0, 8), [trendingDay.data])
  const seedsKey = JSON.stringify(recentSeeds(progress))
  const seeds = useMemo(() => JSON.parse(seedsKey) as Seed[], [seedsKey])

  return (
    <div className="page home" data-nav-root>
      {tmdbKey && heroItems.length > 0 ? (
        <TmdbHero items={heroItems} />
      ) : tmdbKey && trendingDay.loading ? (
        <div className="hero hero-skeleton skeleton" />
      ) : (
        heroSource && <Hero addon={heroSource.addon} catalog={heroSource.catalog} />
      )}

      {resume.length > 0 && (
        <Row title="Seguir viendo" moreTo="/history">
          {resume.map((e) => (
            <PosterCard
              key={e.videoId}
              meta={{ id: e.metaId, type: e.type, name: e.name, poster: e.poster }}
              progress={e.duration ? e.position / e.duration : 0}
              subtitle={e.season !== undefined ? episodeLabel(e.season, e.episode) : 'Continuar'}
              to={`/detail/${e.type}/${encodeURIComponent(e.metaId)}${e.season !== undefined ? `?season=${e.season}&video=${encodeURIComponent(e.videoId)}` : ''}`}
              onRemove={() => hide(e.metaId, e.name)}
              removeLabel="Quitar de Seguir viendo"
            />
          ))}
        </Row>
      )}

      <UpNextRow />

      {tmdbKey && (
        <>
          <Top10Row state={trendingDay} />
          {seeds.map((seed) => (
            <BecauseRow key={seed.metaId} seed={seed} tmdbKey={tmdbKey} />
          ))}
          <TrendingWeekRow tmdbKey={tmdbKey} />
        </>
      )}

      {catalogs.map(({ addon, catalog }, i) => (
        <CatalogRow key={`${addon.transportUrl}|${catalog.type}|${catalog.id}`} addon={addon} catalog={catalog} eager={i < 3} />
      ))}

      {catalogs.length === 0 && (
        <div className="empty">
          No hay catálogos. <Link to="/settings">Agregá un addon</Link> para empezar.
        </div>
      )}

      {undo && (
        <div className="undo-toast" role="status">
          <span>
            Quitado de Seguir viendo<span className="muted"> · {undo.name}</span>
          </span>
          <button type="button" className="btn btn-small" onClick={restore}>
            Deshacer
          </button>
        </div>
      )}
    </div>
  )
}
