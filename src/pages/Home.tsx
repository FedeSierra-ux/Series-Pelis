import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { backdropFor, ContinueCard, LandscapeCard } from '../components/ContinueCard'
import { FocusBillboard } from '../components/FocusBillboard'
import { PosterCard } from '../components/PosterCard'
import { Row } from '../components/Row'
import { visibleRows } from '../lib/catalogPrefs'
import { useCatalogRows, useRowShape } from '../lib/catalogRows'
import { seriesYear } from '../lib/format'
import { useCatalog, useTitle } from '../lib/hooks'
import { catalogLabel, genreLabel } from '../lib/i18n'
import { useHiddenIds } from '../lib/ratings'
import { withoutHidden } from '../lib/recommend'
import { continueWatching, hideFromContinue, progressStore, toggleWatchlist, useStore, watchlistStore, type WatchEntry } from '../lib/store'
import { useTmdbKey } from '../lib/tmdb'
import { continueRowItems, episodeLink, useUpNext, type ContinueItem } from '../lib/upNext'
import type { CatalogDef, InstalledAddon, MetaPreview } from '../lib/types'
import { ForYouRow } from './home/ForYouRow'
import { HeroCarousel } from './home/HeroCarousel'
import { HeroInfo } from './home/HeroInfo'
import { useNearViewport } from './home/lazy'
import { MergedCatalogRow } from './home/MergedCatalogRow'
import { TmdbHero } from './home/TmdbHero'
import { resumeLabel, useDirectPlay } from './home/useDirectPlay'
import './home/home-v14.css'
import { BecauseRow, Top10Row, TrendingWeekRow, useNowPlaying, useTrending, type Seed } from './home/TmdbRows'
import { CuratedRows } from './lists/CuratedRows'

const ROW_LIMIT = 30

function CatalogRow({ rowKey, addon, catalog, eager, title }: { rowKey: string; addon: InstalledAddon; catalog: CatalogDef; eager: boolean; title?: string }) {
  const [ref, visible] = useNearViewport<HTMLDivElement>(eager)
  const landscape = useRowShape(rowKey) === 'landscape'
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
        reportContext={{ addon: addon.transportUrl }}
        empty={items.length === 0}
        landscape={landscape}
      >
        {items.map((m, i) => (
          <PosterCard key={m.id} meta={{ ...m, type: m.type ?? catalog.type }} eager={eager && i < 6} landscape={landscape} />
        ))}
      </Row>
    </div>
  )
}

/** Portada sin TMDB: el catálogo del primer addon, con el mismo carrusel que la de TMDB. */
function Hero({ addon, catalog }: { addon: InstalledAddon; catalog: CatalogDef }) {
  const { data, loading } = useCatalog(addon, catalog)
  const watchlist = useStore(watchlistStore)
  const progress = useStore(progressStore)
  const { pending, play, cancel } = useDirectPlay()
  const [index, setIndex] = useState(0)
  const hidden = useHiddenIds()
  const pool = useMemo(
    () => withoutHidden(data ?? [], hidden).filter((m) => m.background || m.id.startsWith('tt')).slice(0, 8),
    [data, hidden],
  )
  const slides = useMemo(
    () => pool.map((m) => ({ key: m.id, title: m.name, backdrop: m.id.startsWith('tt') ? `https://images.metahub.space/background/medium/${m.id}/img` : m.background })),
    [pool],
  )

  const meta: MetaPreview | undefined = pool[index % (pool.length || 1)]
  // Si la portada pasa a otro título mientras busca la fuente, se cancela.
  const metaId = meta?.id
  useEffect(() => {
    cancel()
  }, [metaId, cancel])
  // Catálogo vacío, sin fondos o sin conexión y sin nada guardado: sin portada (no un esqueleto para siempre).
  if (!meta) return loading ? <div className="portada portada--compact portada-skeleton skeleton" /> : null
  const genres = (meta.genre ?? meta.genres ?? []).slice(0, 2).map(genreLabel)
  const type = meta.type ?? catalog.type
  const logo = meta.logo ?? (meta.id.startsWith('tt') ? `https://images.metahub.space/logo/medium/${meta.id}/img` : undefined)
  return (
    <HeroCarousel slides={slides} index={index % pool.length} onIndex={setIndex} variant="compact" label="Destacados">
      <HeroInfo
        key={meta.id}
        title={meta.name}
        logo={logo}
        rating={meta.imdbRating}
        facts={[seriesYear(meta.releaseInfo) ?? '', type === 'movie' ? 'Película' : type === 'series' ? 'Serie' : ''].filter(Boolean)}
        genres={genres}
        overview={meta.description}
        to={`/detail/${type}/${encodeURIComponent(meta.id)}`}
        list={{ inList: !!watchlist[meta.id], onToggle: () => toggleWatchlist({ ...meta, type }) }}
        play={{
          label: resumeLabel(meta.id, type, progress),
          busy: pending === meta.id,
          onPlay: () => play(meta.id, { type, metaId: meta.id }, `/detail/${type}/${encodeURIComponent(meta.id)}`),
        }}
      />
    </HeroCarousel>
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

/** Ficha de lo que está en "Seguir viendo", en la temporada y el episodio que corresponde. */
const resumeLink = (e: WatchEntry) =>
  `/detail/${e.type}/${encodeURIComponent(e.metaId)}${e.season !== undefined ? `?season=${e.season}&video=${encodeURIComponent(e.videoId)}` : ''}`

/**
 * "Seguir viendo" (U6): lo empezado y, cuando terminaste un episodio, el siguiente con la etiqueta
 * "Siguiente" o "Episodio nuevo", todo en una fila y lo más reciente primero. OK / clic reproduce
 * directo (U5); la ⓘ abre la ficha y el ✕ lo saca de la fila (con "Deshacer").
 */
function ContinueRow({ onHide }: { onHide: (metaId: string, name: string) => void }) {
  const progress = useStore(progressStore)
  const { data } = useUpNext()
  const { pending, play } = useDirectPlay()
  const items: ContinueItem[] = useMemo(() => continueRowItems(continueWatching(progress), data?.next ?? []), [progress, data])
  if (items.length === 0) return null
  return (
    <Row title="Seguir viendo" moreTo="/history">
      {items.map((it) => {
        if (it.kind === 'resume') {
          const e = it.entry
          const to = resumeLink(e)
          return (
            <ContinueCard
              key={it.key}
              entry={e}
              to={to}
              infoTo={to}
              busy={pending === it.key}
              onPlay={() => play(it.key, { type: e.type, metaId: e.metaId, videoId: e.videoId }, to)}
              onRemove={() => onHide(e.metaId, e.name)}
            />
          )
        }
        const ep = it.episode
        const to = episodeLink(ep.metaId, ep.season, ep.videoId)
        return (
          <LandscapeCard
            key={it.key}
            metaId={ep.metaId}
            type="series"
            name={ep.seriesName}
            // Mismo formato que lo empezado ("T1 E3 · …").
            subtitle={[ep.episode !== undefined ? `T${ep.season} E${ep.episode}` : '', ep.title].filter(Boolean).join(' · ')}
            backdrop={ep.thumbnail ?? backdropFor(ep.metaId)}
            poster={ep.poster}
            progress={ep.progress}
            badge={it.label}
            to={to}
            infoTo={to}
            busy={pending === it.key}
            onPlay={() => play(it.key, { type: 'series', metaId: ep.metaId, videoId: ep.videoId }, to)}
            onRemove={() => onHide(ep.metaId, ep.seriesName)}
            removeLabel="Quitar de Seguir viendo"
          />
        )
      })}
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
  const catalogs = visibleRows(useCatalogRows(true)).filter((r) => !r.virtual)
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
      {/* Único h1 de Inicio (el título de la portada es h2 y rota cada 8 s). */}
      <h1 className="sp-sr-only">Inicio</h1>
      <FocusBillboard />
      {tmdbKey && heroItems.length > 0 ? (
        <TmdbHero items={heroItems} variant="compact" fallbackType="movie" eyebrow="Estrenos en cines" />
      ) : tmdbKey && nowPlaying.loading ? (
        <div className="portada portada--compact portada-skeleton skeleton" />
      ) : (
        heroSource && <Hero addon={heroSource.addon} catalog={heroSource.catalog} />
      )}

      {/* v0.22.5: Seguir viendo y enseguida el Top 10 de hoy (pedido del usuario). */}
      <ContinueRow onHide={hide} />

      {tmdbKey && (
        <>
          <Top10Row state={trendingDay} />
          <ForYouRow tmdbKey={tmdbKey} />
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
          <CatalogRow key={row.key} rowKey={row.key} addon={row.sources[0].addon} catalog={row.sources[0].catalog} title={row.name} eager={i < 3} />
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
