import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useEpisodeSpoilers } from '../components/Spoiler'
import { EmptyState } from '../components/EmptyState'
import { clockTime, episodeLabel, smallPoster } from '../lib/format'
import { useTitle } from '../lib/hooks'
import { useLocalTitle } from '../lib/localTitles'
import { useNearOnce } from '../lib/titleArt'
import { episodeLink, useUpNext, type EpisodeItem } from '../lib/upNext'
import { Spinner } from '../components/Spinner'

const DAY = 24 * 60 * 60 * 1000

function dayStart(ts: number) {
  return new Date(ts).setHours(0, 0, 0, 0)
}

function calendarDayLabel(day: number, today: number): string {
  const diff = Math.round((day - today) / DAY)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  if (diff === -1) return 'Ayer'
  return new Date(day).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
}

function groupByDay(items: EpisodeItem[], today: number) {
  const groups: { day: number; label: string; items: EpisodeItem[] }[] = []
  for (const it of items) {
    const day = dayStart(it.released)
    const last = groups[groups.length - 1]
    if (last?.day === day) last.items.push(it)
    else groups.push({ day, label: calendarDayLabel(day, today), items: [it] })
  }
  return groups
}

function CalendarItem({ it, spoil }: { it: EpisodeItem; spoil?: boolean }) {
  const now = Date.now()
  const aired = it.released <= now
  const time = it.hasTime ? clockTime(it.released) : undefined
  const img = it.thumbnail ?? smallPoster(it.metaId, it.poster)
  // Nombre de la serie en español (v0.28), pedido cuando la fila se acerca a la pantalla; los títulos de
  // episodio siguen en idioma original.
  const [ref, near] = useNearOnce<HTMLLIElement>(true)
  const name = useLocalTitle(it.metaId, it.seriesName, { type: 'series', enabled: near })
  return (
    <li ref={ref}>
      <Link to={episodeLink(it.metaId, it.season, it.videoId)} className="cal-item">
        <div className={`cal-thumb${it.thumbnail ? (spoil ? ' spoiler-blur' : '') : ' is-poster'}`}>
          {img && <img src={img} alt="" loading="lazy" decoding="async" />}
        </div>
        <div className="cal-text">
          <strong>{name}</strong>
          <span className="small">
            {episodeLabel(it.season, it.episode)}
            {it.title && <span className="muted"> · {it.title}</span>}
          </span>
          <span className="small muted">
            {it.watched ? (
              <span className="ok">✓ Visto</span>
            ) : aired ? (
              <span className="cal-badge">Disponible</span>
            ) : (
              <span>Se estrena{time ? ` a las ${time}` : ''}</span>
            )}
          </span>
        </div>
      </Link>
    </li>
  )
}

export function Calendar() {
  useTitle('Calendario')
  const { data, loading } = useUpNext()
  const hideEpisodeSpoiler = useEpisodeSpoilers()
  const today = dayStart(Date.now())

  const { upcoming, recent } = useMemo(() => {
    const items = data?.calendar ?? []
    return {
      upcoming: groupByDay(items.filter((i) => dayStart(i.released) >= today), today),
      // Lo que ya salió va del más nuevo al más viejo.
      recent: groupByDay(items.filter((i) => dayStart(i.released) < today).reverse(), today),
    }
  }, [data, today])

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <Link to="/me" className="year-back">
            ← Vos
          </Link>
          <h1>Calendario</h1>
          <p className="muted cal-sub">
            Episodios de las series que viste o tenés en Mi lista: los próximos 60 días y la última semana.
          </p>
        </div>
        {loading && data && <Spinner as="span" label="Actualizando…" />}
      </header>

      {!data && loading && (
        <ul className="cal-list" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="cal-item cal-skeleton">
              <div className="cal-thumb skeleton" />
              <div className="cal-text">
                <span className="skeleton skeleton-line" />
                <span className="skeleton skeleton-line" style={{ width: '40%' }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && data.followed === 0 && (
        <EmptyState
          icon="calendar"
          title="Todavía no seguís ninguna serie"
          text="Mirá alguna o agregala a Mi lista y acá vas a ver sus próximos episodios."
          action={{ label: 'Ir a Mi lista', to: '/me' }}
        />
      )}

      {data && data.followed > 0 && (
        <>
          {/* Sin nada anunciado, la misma tarjeta que Historial, Mi lista y Tu año (visual-06, v0.31). */}
          {upcoming.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="Nada anunciado por ahora"
              text="Acá aparecen los episodios de las series que viste o tenés en Mi lista: los próximos 60 días y la última semana."
              action={{ label: 'Explorar series', to: '/discover/series' }}
            />
          ) : (
            <section className="cal-section">
              <h2>Próximos</h2>
              {upcoming.map((g) => (
                <div key={g.day} className="cal-day">
                  <h3>{g.label}</h3>
                  <ul className="cal-list">
                    {g.items.map((it) => (
                      <CalendarItem key={it.videoId} it={it} spoil={!it.watched && hideEpisodeSpoiler(it)} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {recent.length > 0 && (
            <section className="cal-section">
              <h2>Salieron hace poco</h2>
              {recent.map((g) => (
                <div key={g.day} className="cal-day">
                  <h3>{g.label}</h3>
                  <ul className="cal-list">
                    {g.items.map((it) => (
                      <CalendarItem key={it.videoId} it={it} spoil={!it.watched && hideEpisodeSpoiler(it)} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  )
}
