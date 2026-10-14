import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { backdropFor, ContinueCard, LandscapeCard } from '../components/ContinueCard'
import { PosterCard } from '../components/PosterCard'
import { ImdbRating } from '../components/Rating'
import { Row } from '../components/Row'
import { visibleRows } from '../lib/catalogPrefs'
import { useCatalogRows } from '../lib/catalogRows'
import { episodeLabel } from '../lib/format'
import { useCatalog, useTitle } from '../lib/hooks'
import { catalogLabel, genreLabel } from '../lib/i18n'
import { useHiddenIds } from '../lib/ratings'
import { withoutHidden } from '../lib/recommend'
import { continueWatching, hideFromContinue, progressStore, toggleWatchlist, useStore, watchlistStore, type WatchEntry } from '../lib/store'
import { useTmdbKey } from '../lib/tmdb'
import { episodeLink, useUpNext } from '../lib/upNext'
import type { CatalogDef, InstalledAddon, MetaPreview } from '../lib/types'
import { ForYouRow } from './home/ForYouRow'
import { useNearViewport } from './home/lazy'
import { MergedCatalogRow } from './home/MergedCatalogRow'
import { TmdbHero } from './home/TmdbHero'
import { BecauseRow, Top10Row, TrendingWeekRow, useNowPlaying, useTrending, type Seed } from './home/TmdbRows'
import { CuratedRows } from './lists/CuratedRows'

const ROW_LIMIT = 30

function CatalogRow({ addon, catalog, eager, title }: { addon: InstalledAddon; catalog: CatalogDef; eager: boolean; title?: string }) {
  const [ref, visible] = useNearViewport<HTMLDivElement>(eager)
  const { data, loading, error } = useCatalog(visible ? addon : undefined, visible ? catalog : undefined)
  const hidden = useHiddenIds()
  const items = withoutHidden(data?.slice(0, ROW_LIMIT) ?? [], hidden)
  const moreTo = `/discover/${catalog.type}?addon=${encodeURIComponent(addon.transportUrl)}&catalog=${encodeURIComponent(catalog.id)}`
  return (
    <div ref={ref}>
      <Row
        title={title ?? catalogLabel(catalog.name, catalog.type, addon.manifest.name)}
        moreTo={moreTo}
        loading={loading || !visible}
        error={error}
        errorNotice={`${addon.manifest.name} no responde ahora. Probá de nuevo en un rato.`}
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
  const { data, loading } = useCatalog(addon, catalog)
  const watchlist = useStore(watchlistStore)
  const [index, setIndex] = useState(0)
  const hidden = useHiddenIds()
  const pool = withoutHidden(data ?? [], hidden).filter((m) => m.background || m.id.startsWith('tt')).slice(0, 8)

  useEffect(() => {
    if (pool.length < 2) return
    const t = setInterval(() => setIndex((i) => (i + 1) % pool.length), 9000)
    return () => clearInterval(t)
  }, [pool.length])

  const meta: MetaPreview | undefined = pool[index]
  // Catálogo vacío, sin fondos o sin conexión y sin nada guardado: sin portada (no un esqueleto para siempre).
  if (!meta) return loading ? <div className="hero hero-skeleton skeleton" /> : null
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
          <Link className="btn btn-primary" to={`/detail/${type}/${encodeURIComponent(meta.id)}`} data-autofocus>
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
  // Mismas tarjetas apaisadas que "Seguir viendo".
  const items = data?.next ?? []
  if (items.length === 0) return null
  return (
    <Row title="Tus series: siguiente episodio">
      {items.map((it) => (
        <LandscapeCard
          key={it.videoId}
          metaId={it.metaId}
          type="series"
          name={it.seriesName}
          subtitle={[episodeLabel(it.season, it.episode) || 'Siguiente', it.title].filter(Boolean).join(' · ')}
          backdrop={it.thumbnail ?? backdropFor(it.metaId)}
          poster={it.poster}
          progress={it.progress}
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
  const progress = useStore(progressStore)
  // Filas con lo elegido en el gestor de catálogos (orden, nombres, ocultas, fusionadas).
  const catalogs = visibleRows(useCatalogRows())
  const resume = continueWatching(progress)
  const heroSource = (catalogs.find((c) => c.type === 'movie') ?? catalogs[0])?.sources[0]
  const { undo, hide, restore } = useUndoHide()
  // TMDB es opcional: sin key, Inicio queda igual que siempre.
  const tmdbKey = useTmdbKey()
  const trendingDay = useTrending('day', tmdbKey)
  // Portada de Inicio: los estrenos en cines (más chica, no ocupa toda la parte de arriba).
  const nowPlaying = useNowPlaying(tmdbKey)
  const hidden = useHiddenIds()
  const heroItems = useMemo(
    () => (nowPlaying.data?.results ?? []).filter((i) => i.backdrop_path && !hidden.has(`tmdb:movie:${i.id}`)).slice(0, 8),
    [nowPlaying.data, hidden],
  )
  const seedsKey = JSON.stringify(recentSeeds(progress))
  const seeds = useMemo(() => JSON.parse(seedsKey) as Seed[], [seedsKey])

  return (
    <div className="page home" data-nav-root>
      {tmdbKey && heroItems.length > 0 ? (
        <TmdbHero items={heroItems} variant="compact" fallbackType="movie" eyebrow="Estrenos en cines" />
      ) : tmdbKey && nowPlaying.loading ? (
        <div className="hero hero-compact hero-skeleton skeleton" />
      ) : (
        heroSource && <Hero addon={heroSource.addon} catalog={heroSource.catalog} />
      )}

      {resume.length > 0 && (
        <Row title="Seguir viendo" moreTo="/history">
          {resume.map((e) => {
            const to = `/detail/${e.type}/${encodeURIComponent(e.metaId)}${e.season !== undefined ? `?season=${e.season}&video=${encodeURIComponent(e.videoId)}` : ''}`
            return <ContinueCard key={e.videoId} entry={e} to={to} onRemove={() => hide(e.metaId, e.name)} />
          })}
        </Row>
      )}

      <UpNextRow />

      {tmdbKey && (
        <>
          <ForYouRow tmdbKey={tmdbKey} />
          <Top10Row state={trendingDay} />
          {seeds.map((seed) => (
            <BecauseRow key={seed.metaId} seed={seed} tmdbKey={tmdbKey} />
          ))}
          <TrendingWeekRow tmdbKey={tmdbKey} />
        </>
      )}

      <CuratedRows />

      {catalogs.map((row, i) =>
        row.merged ? (
          <MergedCatalogRow key={row.key} row={row} eager={i < 3} />
        ) : (
          <CatalogRow key={row.key} addon={row.sources[0].addon} catalog={row.sources[0].catalog} title={row.name} eager={i < 3} />
        ),
      )}

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
