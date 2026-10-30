import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { Picker } from '../../components/Picker'
import { UndoToast, useUndoToast } from '../../components/UndoToast'
import { ImdbRating } from '../../components/Rating'
import { remainingLabel } from '../../lib/remaining'
import { RESUME_MIN_S, restoreWatchSnapshot, setWatched, setWatchedMany, snapshotWatch, type WatchEntry } from '../../lib/store'
import { useTvMode } from '../../lib/tv'
import type { Video } from '../../lib/types'
import {
  episodeBadge,
  episodeHeading,
  episodeNumber,
  formatReleaseDate,
  isReleased,
  seasonLabel,
  seasonsAsDropdown,
  seasonStatus,
  suggestedForPanel,
} from './episodes'
import { TOUCH_QUERY, useMediaQuery } from './useMediaQuery'
import { useSeasonOverviews } from './useSeasonOverviews'

// Pestaña "Episodios" de la ficha: selector de temporada, lista de episodios y fuentes del elegido.
// v0.14 (U20): con más de 6 temporadas, desplegable "Temporada 3 ▾" (el Picker, que anda con el
// control remoto); "Quedan 23 min" en los empezados y la marca "Siguiente" en el sugerido.

/** tv-02: → desde el ✓ de un episodio va a la fuente recomendada del panel (no al "Ocultos" que quede más cerca). */
const NAV_TO_SOURCE = '.episode-streams .stream-item.recommended'
/** tv-11: ↑ desde el primer episodio vuelve a la temporada elegida (el chip activo o el desplegable), no a la más cercana. */
const NAV_TO_SEASON = '.season-tabs .tab.active, .season-picker-btn'

/** Lo que se guarda al marcar un episodio como visto. */
export type WatchBase = (v?: Video) => Pick<WatchEntry, 'videoId' | 'metaId' | 'type' | 'name' | 'poster' | 'season' | 'episode' | 'episodeTitle'>

interface Props {
  videos: Video[]
  seasons: number[]
  season: number
  onSeason: (season: number) => void
  progress: Record<string, WatchEntry>
  selectedVideoId?: string
  onSelect: (v: Video) => void
  /** Episodio que recibe la primera flecha del control remoto. */
  focusVideoId?: string
  /** El sugerido por "Continuar" / "Siguiente". */
  suggested?: Video
  /** Ya vio algo de la serie (sin eso no se marca "Siguiente"). */
  started: boolean
  /** El primer episodio de la serie (el de "Volver a ver"; su imagen no se difumina en el panel). */
  first?: Video
  /** Id de la serie en TMDB: con eso, la sinopsis de los episodios va en español (ficha-11). */
  tmdbId?: number
  /** Idioma original de la serie (TMDB): los títulos de Cinemeta van en inglés salvo en las series en español (a11y-16). */
  originalLang?: string
  hideSpoiler: (v: Video) => boolean
  watchBase: WatchBase
  /** Celular: las fuentes van dentro de la lista, debajo del episodio elegido. */
  inlineStreams: boolean
  streamsPanel: ReactNode
  listRef: RefObject<HTMLOListElement | null>
  panelRef: RefObject<HTMLLIElement | null>
}

export function EpisodesPanel(p: Props) {
  const { videos, seasons, season, progress, selectedVideoId } = p
  const seasonVideos = videos.filter((v) => (v.season ?? 0) === season)
  // "Marcar temporada como vista" solo cuenta los episodios ya estrenados.
  const { released: seasonReleased, complete: seasonComplete } = seasonStatus(seasonVideos, progress)
  const dropdown = seasonsAsDropdown(seasons)
  // v0.26 (ficha-11): sinopsis en español de TMDB (si está); si no, la de Cinemeta.
  const overviews = useSeasonOverviews(p.tmdbId, season, seasonVideos)
  // "Marcar temporada…" cambia muchos episodios de una: avisa y deja "Deshacer" (uso-10, igual que el historial).
  const undo = useUndoToast()
  const markSeason = () => {
    const watched = !seasonComplete
    const snap = snapshotWatch(seasonReleased.map((v) => v.id))
    setWatchedMany(seasonReleased.map((v) => p.watchBase(v)), watched)
    undo.show(`${seasonLabel(season)} marcada como ${watched ? 'vista' : 'no vista'}`, () => restoreWatchSnapshot(snap))
  }
  // v0.26 (ficha-06): en el celular se toca; con mouse o control remoto, se elige.
  const tv = useTvMode()
  const touch = useMediaQuery(TOUCH_QUERY) && !tv
  // v0.26 (ficha-04): con el panel de fuentes vacío, el episodio sugerido con un botón para ver sus fuentes.
  const panelEp = !selectedVideoId && !p.inlineStreams ? suggestedForPanel(p.suggested, p.first, progress, p.started) : undefined
  // Al tocar "Ver fuentes de este episodio" el botón desaparece: el foco pasa al episodio elegido (control remoto).
  const focusAfterSelect = useRef<string>(undefined)
  useEffect(() => {
    const want = focusAfterSelect.current
    if (!want || want !== selectedVideoId) return
    focusAfterSelect.current = undefined
    p.listRef.current?.querySelector<HTMLElement>('.episode-main[aria-current]')?.focus()
  }, [selectedVideoId, season])

  return (
    <section className="episodes-section" aria-label="Episodios">
      <div className="season-bar">
        {dropdown ? (
          <div className="season-picker">
            <Picker
              label="Temporada"
              value={String(season)}
              options={seasons.map((s) => ({
                value: String(s),
                label: `${seasonLabel(s)} · ${videos.filter((v) => (v.season ?? 0) === s).length} ep.`,
              }))}
              onChange={(v) => p.onSeason(Number(v))}
              className="season-picker-btn"
            />
          </div>
        ) : (
          <div className="season-tabs" role="group" aria-label="Temporadas">
            {seasons.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={s === season}
                className={`tab ${s === season ? 'active' : ''}`}
                onClick={() => p.onSeason(s)}
              >
                {seasonLabel(s)}
              </button>
            ))}
          </div>
        )}
        {seasonReleased.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost season-mark"
            onClick={markSeason}
          >
            {seasonComplete ? '✓ Marcar temporada como no vista' : 'Marcar temporada como vista'}
          </button>
        )}
      </div>
      <div className="episodes-layout">
        <ol className="episodes" ref={p.listRef}>
          {seasonVideos.map((v, index) => {
            const w = progress[v.id]
            const released = formatReleaseDate(v)
            const upcoming = !isReleased(v)
            const rating = Number(v.rating)
            const selected = v.id === selectedVideoId
            // Sin spoilers: lo que no viste va difuminado hasta que lo elegís. v0.26 (ficha-04, nota del usuario):
            // el primer episodio de la serie siempre se ve.
            const spoil = !selected && v.id !== p.first?.id && p.hideSpoiler(v)
            const started = !!w && w.duration > 0 && !w.watched && w.position > RESUME_MIN_S
            const left = started ? remainingLabel(w.position, w.duration) : ''
            // tv-12: en la TV el episodio elegido lleva «Elegido» en la miniatura (sin borde: a 3 m el borde fino se
            // confundía con el anillo del foco); «Continuar» / «Siguiente» ya dicen más.
            const badge = episodeBadge(v, p.suggested, progress, p.started) ?? (tv && selected ? 'Elegido' : undefined)
            const title = v.title ?? v.name ?? `Episodio ${episodeNumber(v)}`
            const overview = overviews.get(v.id) ?? v.overview ?? v.description
            // v0.26 (ficha-04, "Vistos atenuados"): el siguiente a ver, resaltado.
            const next = v.id === p.suggested?.id
            return [
              <li key={v.id} className={`episode ${selected ? 'selected' : ''} ${w?.watched ? 'watched' : ''}${next ? ' is-next' : ''}`}>
                <button
                  type="button"
                  className="episode-main"
                  data-focus-id={v.id}
                  data-autofocus={v.id === p.focusVideoId || undefined}
                  aria-current={selected || undefined}
                  data-nav-up={index === 0 ? NAV_TO_SEASON : undefined}
                  onClick={() => p.onSelect(v)}
                >
                  <div className={`episode-thumb${spoil ? ' spoiler-blur' : ''}`}>
                    {v.thumbnail && <img src={v.thumbnail} alt="" loading="lazy" decoding="async" />}
                    {badge && <span className={`ep-badge${badge === 'Siguiente' ? ' next' : ''}`}>{badge}</span>}
                    {started && (
                      <div className="progress-bar">
                        <div style={{ width: `${Math.min(100, (w.position / w.duration) * 100)}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="episode-text">
                    <span className="episode-title" lang={p.originalLang === 'es' ? undefined : 'en'}>
                      {episodeNumber(v)}. {title}
                    </span>
                    <span className="muted small">
                      {released}
                      {upcoming && ' · Próximamente'}
                      {rating > 0 && (
                        <>
                          {' · '}
                          <ImdbRating value={rating.toFixed(1)} size="sm" />
                        </>
                      )}
                    </span>
                    {left && <span className="ep-left">{left.charAt(0).toUpperCase() + left.slice(1)}</span>}
                    {overview &&
                      (spoil ? (
                        <span className="episode-desc spoiler-hidden">
                          <SpoilerIcon />
                          Sin spoilers · {touch ? 'tocalo' : 'elegilo'} para ver la sinopsis
                        </span>
                      ) : (
                        <span className="episode-desc" lang={overviews.has(v.id) ? undefined : 'en'}>
                          {overview}
                        </span>
                      ))}
                  </div>
                </button>
                <button
                  type="button"
                  className={`episode-check ${w?.watched ? 'on' : ''}`}
                  title={w?.watched ? 'Marcar como no vista' : 'Marcar como vista'}
                  aria-label={`${w?.watched ? 'Marcar como no vista' : 'Marcar como vista'}: ${episodeNumber(v)}. ${title}`}
                  aria-pressed={!!w?.watched}
                  data-nav-right={!p.inlineStreams && selectedVideoId ? NAV_TO_SOURCE : undefined}
                  onClick={() => setWatched(p.watchBase(v), !w?.watched)}
                >
                  ✓
                </button>
              </li>,
              // Celular: las fuentes justo debajo del episodio elegido, así no quedan fuera de pantalla.
              p.inlineStreams && selected && p.streamsPanel ? (
                <li key={`${v.id}-streams`} className="episode-streams episode-streams-inline" ref={p.panelRef}>
                  {p.streamsPanel}
                </li>
              ) : null,
            ]
          })}
        </ol>
        {!p.inlineStreams && (
          <aside
            className="episode-streams"
            aria-label="Fuentes del episodio"
            data-nav-left={selectedVideoId ? '.episode-main[aria-current]' : '.episode-main[data-autofocus]'}
          >
            {p.streamsPanel ??
              (panelEp ? (
                <div className="streams-empty sx-empty">
                  <span className="sx-kicker">{panelEp.kicker}</span>
                  <p className="sx-ep">{episodeHeading(panelEp.video)}</p>
                  {panelEp.video.thumbnail && (
                    <div
                      className={`sx-empty-thumb${p.hideSpoiler(panelEp.video) && panelEp.video.id !== p.first?.id ? ' spoiler-blur' : ''}`}
                    >
                      <img src={panelEp.video.thumbnail} alt="" loading="lazy" decoding="async" />
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      focusAfterSelect.current = panelEp.video.id
                      p.onSelect(panelEp.video)
                    }}
                  >
                    Ver fuentes de este episodio
                  </button>
                  <p className="sx-hint">O elegí cualquier episodio de la lista.</p>
                </div>
              ) : (
                <div className="streams-empty muted">Elegí un episodio para ver las fuentes disponibles.</div>
              ))}
          </aside>
        )}
      </div>
      <UndoToast api={undo} />
    </section>
  )
}

/** Ojo tachado, con el trazo de los íconos de la ficha (ficha-06). */
function SpoilerIcon() {
  return (
    <svg className="spoiler-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <path d="M2.5 12S6 5.5 12 5.5c1.6 0 3 .4 4.2 1M21.5 12S18 18.5 12 18.5c-1.6 0-3-.4-4.2-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M4 20 20 4" />
    </svg>
  )
}
