import type { ReactNode, RefObject } from 'react'
import { Picker } from '../../components/Picker'
import { ImdbRating } from '../../components/Rating'
import { remainingLabel } from '../../lib/remaining'
import { RESUME_MIN_S, setWatched, setWatchedMany, type WatchEntry } from '../../lib/store'
import type { Video } from '../../lib/types'
import {
  episodeBadge,
  episodeNumber,
  formatReleaseDate,
  isReleased,
  seasonLabel,
  seasonsAsDropdown,
  seasonStatus,
} from './episodes'

// Pestaña "Episodios" de la ficha: selector de temporada, lista de episodios y fuentes del elegido.
// v0.14 (U20): con más de 6 temporadas, desplegable "Temporada 3 ▾" (el Picker, que anda con el
// control remoto); "Quedan 23 min" en los empezados y la marca "Siguiente" en el sugerido.

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
            onClick={() => setWatchedMany(seasonReleased.map((v) => p.watchBase(v)), !seasonComplete)}
          >
            {seasonComplete ? '✓ Marcar temporada como no vista' : 'Marcar temporada como vista'}
          </button>
        )}
      </div>
      <div className="episodes-layout">
        <ol className="episodes" ref={p.listRef}>
          {seasonVideos.map((v) => {
            const w = progress[v.id]
            const released = formatReleaseDate(v)
            const upcoming = !isReleased(v)
            const rating = Number(v.rating)
            const selected = v.id === selectedVideoId
            // Sin spoilers: lo que no viste va difuminado hasta que lo elegís.
            const spoil = !selected && p.hideSpoiler(v)
            const started = !!w && w.duration > 0 && !w.watched && w.position > RESUME_MIN_S
            const left = started ? remainingLabel(w.position, w.duration) : ''
            const badge = episodeBadge(v, p.suggested, progress, p.started)
            const title = v.title ?? v.name ?? `Episodio ${episodeNumber(v)}`
            return [
              <li key={v.id} className={`episode ${selected ? 'selected' : ''} ${w?.watched ? 'watched' : ''}`}>
                <button
                  type="button"
                  className="episode-main"
                  data-focus-id={v.id}
                  data-autofocus={v.id === p.focusVideoId || undefined}
                  aria-current={selected || undefined}
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
                    <span className="episode-title">
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
                    {(v.overview ?? v.description) &&
                      (spoil ? (
                        <span className="episode-desc spoiler-hidden">Sinopsis oculta · elegilo para verla</span>
                      ) : (
                        <span className="episode-desc">{v.overview ?? v.description}</span>
                      ))}
                  </div>
                </button>
                <button
                  type="button"
                  className={`episode-check ${w?.watched ? 'on' : ''}`}
                  title={w?.watched ? 'Marcar como no vista' : 'Marcar como vista'}
                  aria-label={`${w?.watched ? 'Marcar como no vista' : 'Marcar como vista'}: ${episodeNumber(v)}. ${title}`}
                  aria-pressed={!!w?.watched}
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
          <aside className="episode-streams" aria-label="Fuentes del episodio" data-nav-left=".episode-main[aria-current]">
            {p.streamsPanel ?? <div className="streams-empty muted">Elegí un episodio para ver las fuentes disponibles.</div>}
          </aside>
        )}
      </div>
    </section>
  )
}
