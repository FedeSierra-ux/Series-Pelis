import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { smallPoster } from '../../lib/format'
import type { GoalLine } from '../../lib/goals'
import { formatDuration, type TitleStat, type YearStats } from '../../lib/stats'
import { buildStory, MONTH_NAMES, type StorySlide } from '../../lib/yearStory'
import { GoalBars } from '../goals/GoalBars'
import { bigNumber, renderShareCard, shareFacts, shareOrDownload, topTitles } from './shareCard'

// "Tu año" en modo historia (tipo Wrapped): pantallas que avanzan solas o con ←/→/toque.
// Con "reducir movimiento" no hay animaciones y no avanza solo (se puede activar con ▶).

const SLIDE_MS = 6500
const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/** Número que sube de 0 al valor (salvo con "reducir movimiento"). */
function CountUp({ value, reduced, format = (n) => Math.round(n).toLocaleString('es-AR') }: { value: number; reduced: boolean; format?: (n: number) => string }) {
  const [shown, setShown] = useState(reduced ? value : 0)
  useEffect(() => {
    if (reduced) {
      setShown(value)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1100)
      setShown(value * (1 - Math.pow(1 - t, 3)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, reduced])
  return <>{format(shown)}</>
}

/** Elemento que entra con un pequeño retraso (`d` = orden). */
const In = ({ d = 0, className = '', children }: { d?: number; className?: string; children: ReactNode }) => (
  <div className={`story-in ${className}`} style={{ '--d': d } as CSSProperties}>
    {children}
  </div>
)

const shortDate = (ts: number) => new Date(ts).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function TitleList({ items }: { items: TitleStat[] }) {
  return (
    <ol className="story-titles">
      {items.map((t, i) => (
        <li key={t.metaId} className={`story-in${i === 0 ? ' first' : ''}`} style={{ '--d': i + 1 } as CSSProperties}>
          <span className="story-rank">{i + 1}</span>
          <img src={smallPoster(t.metaId, t.poster)} alt="" decoding="async" />
          <span className="story-title-text">
            <strong>{t.name}</strong>
            <span>
              {formatDuration(t.seconds)}
              {t.type === 'series' && t.episodes > 0 && ` · ${t.episodes} episodio${t.episodes === 1 ? '' : 's'}`}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function SlideBody({ slide, stats, reduced, actions }: { slide: StorySlide; stats: YearStats; reduced: boolean; actions: ReactNode }) {
  switch (slide.kind) {
    case 'intro':
      return (
        <>
          <In className="story-kicker">Series-Pelis</In>
          <In d={1} className="story-huge">
            Tu {slide.year}
          </In>
          <In d={2} className="story-sub">
            en pelis y series
          </In>
          <In d={4} className="story-hint">
            Tocá a los costados o usá ← → para moverte
          </In>
        </>
      )
    case 'hours': {
      const hours = slide.seconds >= 3600
      return (
        <>
          <In className="story-kicker">Este año viste</In>
          <In d={1} className="story-huge story-num">
            <CountUp value={hours ? slide.seconds / 3600 : slide.seconds / 60} reduced={reduced} />
          </In>
          <In d={2} className="story-sub">
            {hours ? 'horas' : 'minutos'} de pelis y series{slide.approx && <small> (aprox.)</small>}
          </In>
          <In d={3} className="story-note">
            repartidas en {slide.activeDays} {slide.activeDays === 1 ? 'día' : 'días'} distintos
          </In>
        </>
      )
    }
    case 'counts':
      return (
        <>
          <In className="story-kicker">En números</In>
          <div className="story-tiles">
            {(
              [
                [slide.movies, slide.movies === 1 ? 'película' : 'películas'],
                [slide.episodes, slide.episodes === 1 ? 'episodio' : 'episodios'],
                [slide.series, slide.series === 1 ? 'serie' : 'series distintas'],
              ] as [number, string][]
            ).map(([n, label], i) => (
              <In key={label} d={i + 1} className="story-tile">
                <span className="story-num">
                  <CountUp value={n} reduced={reduced} />
                </span>
                <span>{label}</span>
              </In>
            ))}
          </div>
        </>
      )
    case 'topSeries':
      return (
        <>
          <In className="story-kicker">Tus series del año</In>
          <TitleList items={slide.items} />
        </>
      )
    case 'topMovies':
      return (
        <>
          <In className="story-kicker">Tus pelis del año</In>
          <TitleList items={slide.items} />
        </>
      )
    case 'genre':
      return (
        <>
          <In className="story-kicker">Tu género favorito</In>
          <In d={1} className="story-big">
            {slide.label}
          </In>
          <In d={2} className="story-sub">
            {formatDuration(slide.seconds)} de {slide.label.toLowerCase()}
          </In>
          {slide.others.length > 0 && (
            <In d={3} className="story-note">
              Le siguen: {slide.others.join(', ')}
            </In>
          )}
        </>
      )
    case 'month':
      return (
        <>
          <In className="story-kicker">Tu mes más activo</In>
          <In d={1} className="story-big">
            {cap(MONTH_NAMES[slide.month])}
          </In>
          <In d={2} className="story-sub">
            {formatDuration(slide.seconds)} de pantalla
          </In>
        </>
      )
    case 'streak':
      return (
        <>
          <In className="story-kicker">Tu racha más larga</In>
          <In d={1} className="story-huge story-num">
            <CountUp value={slide.days} reduced={reduced} />
          </In>
          <In d={2} className="story-sub">
            días seguidos mirando algo
          </In>
          {slide.from !== undefined && slide.to !== undefined && (
            <In d={3} className="story-note">
              del {shortDate(slide.from)} al {shortDate(slide.to)}
            </In>
          )}
        </>
      )
    case 'weekday':
      return (
        <>
          <In className="story-kicker">Tu día favorito</In>
          <In d={1} className="story-big">
            {cap(slide.label)}
          </In>
          <In d={2} className="story-sub">
            es cuando más mirás: {formatDuration(slide.seconds)} en el año
          </In>
        </>
      )
    case 'goal':
      return (
        <>
          <In className="story-kicker">Tu meta</In>
          <In d={1} className="story-goal">
            <GoalBars lines={slide.lines} year={stats.year} />
          </In>
        </>
      )
    case 'summary': {
      const big = bigNumber(stats)
      const tops = topTitles(stats, 3)
      return (
        <>
          <In className="story-kicker">Tu {slide.year} en resumen</In>
          <In d={1} className="story-summary">
            <span className="story-num story-summary-big">{big.value}</span>
            <span className="story-summary-unit">{big.unit}</span>
            <span className="story-summary-kpis">
              {stats.movies} pelis · {stats.episodes} episodios · {stats.activeDays} días
            </span>
            {tops.length > 0 && <span className="story-summary-top">{tops.map((t) => t.name).join(' · ')}</span>}
            <dl className="story-facts">
              {shareFacts(stats).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </In>
          <In d={2} className="story-actions">
            {actions}
          </In>
        </>
      )
    }
  }
}

export function YearStory({ stats, goal, onClose }: { stats: YearStats; goal?: GoalLine[]; onClose: () => void }) {
  const slides = useMemo(() => buildStory(stats, goal), [stats, goal])
  const reduced = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(() => !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches))
  const [msg, setMsg] = useState<string>()
  const [sharing, setSharing] = useState(false)
  const i = Math.min(index, slides.length - 1)
  const slide = slides[i]
  const last = i === slides.length - 1
  const root = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)

  const go = useCallback((n: number) => setIndex(Math.max(0, Math.min(slides.length - 1, n))), [slides.length])
  const next = useCallback(() => (last ? setPlaying(false) : go(i + 1)), [go, i, last])
  const prev = useCallback(() => go(i - 1), [go, i])

  // Avance automático (con pausa que retoma donde quedó).
  const left = useRef({ i: -1, ms: SLIDE_MS })
  useEffect(() => {
    if (!playing || last) return
    const ms = left.current.i === i ? left.current.ms : SLIDE_MS
    const start = performance.now()
    const t = setTimeout(next, ms)
    return () => {
      clearTimeout(t)
      left.current = { i, ms: Math.max(0, ms - (performance.now() - start)) }
    }
  }, [playing, i, last, next])

  // La imagen se prepara de antemano: así "Compartir" abre el menú del sistema en el mismo toque.
  const card = useRef<Promise<Blob>>(undefined)
  useEffect(() => {
    const p = renderShareCard(stats)
    p.catch(() => {})
    card.current = p
  }, [stats])

  const share = async () => {
    setSharing(true)
    setPlaying(false)
    try {
      const blob = await (card.current ?? renderShareCard(stats))
      const hours = Math.round(stats.seconds / 3600)
      const r = await shareOrDownload(blob, stats.year, `Mi ${stats.year}: ${hours} horas, ${stats.movies} pelis y ${stats.episodes} episodios.`)
      setMsg(r === 'downloaded' ? '✓ Imagen descargada' : r === 'shared' ? '✓ Compartido' : undefined)
    } catch (err) {
      setMsg(`No se pudo generar la imagen: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSharing(false)
    }
  }

  // Foco adentro mientras está abierta y de vuelta al botón que la abrió al cerrar; sin scroll de fondo.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    stage.current?.focus({ preventScroll: true })
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
      opener?.focus?.({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(undefined), 3500)
    return () => clearTimeout(t)
  }, [msg])

  // Teclado / control remoto. La navegación espacial está desactivada (data-nav-disabled).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return
      const el = document.activeElement as HTMLElement | null
      const inGroup = el?.closest<HTMLElement>('[data-story-group]')
      const onStage = !inGroup
      if (BACK_KEYS.has(e.key)) {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === ' ' || e.key === 'MediaPlayPause') {
        if (onStage || e.key === 'MediaPlayPause') {
          e.preventDefault()
          setPlaying((p) => !p)
        }
        return
      }
      const buttons = (g: string) => [...(root.current?.querySelectorAll<HTMLElement>(`[data-story-group="${g}"] button:not([disabled])`) ?? [])]
      if (onStage) {
        if (e.key === 'ArrowRight' || e.key === 'Enter') next()
        else if (e.key === 'ArrowLeft') prev()
        else if (e.key === 'ArrowUp') buttons('top')[0]?.focus()
        else if (e.key === 'ArrowDown') buttons('bottom')[0]?.focus()
        else return
        e.preventDefault()
        return
      }
      // En una fila de botones: ←/→ entre botones, ↑/↓ vuelve a la historia.
      const group = buttons(inGroup!.dataset.storyGroup!)
      const k = group.indexOf(el!)
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        group[k + (e.key === 'ArrowRight' ? 1 : -1)]?.focus()
        e.preventDefault()
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const toStage = inGroup!.dataset.storyGroup === 'top' ? e.key === 'ArrowDown' : e.key === 'ArrowUp'
        if (toStage) stage.current?.focus({ preventScroll: true })
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, onClose])

  const actions = (
    <div className="story-action-row" data-story-group="bottom">
      <button className="btn btn-primary" onClick={share} disabled={sharing}>
        {sharing ? 'Preparando…' : '↗ Compartir imagen'}
      </button>
      <button
        className="btn"
        onClick={() => {
          go(0)
          setPlaying(!reduced)
          stage.current?.focus({ preventScroll: true })
        }}
      >
        ↺ Ver de nuevo
      </button>
    </div>
  )

  return (
    <div
      ref={root}
      className={`story${reduced ? ' story-reduced' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Tu ${stats.year} en historia`}
      data-nav-disabled=""
    >
      <div className={`story-bg story-bg-${i % 5}`} aria-hidden />
      <div className="story-progress" aria-hidden>
        {slides.map((s, n) => (
          <span key={`${s.kind}-${n}`} className={n < i || (last && n === i) ? 'done' : n === i ? 'now' : ''}>
            {n === i && !last && <i key={i} style={{ animationDuration: `${SLIDE_MS}ms`, animationPlayState: playing && !last ? 'running' : 'paused' }} />}
          </span>
        ))}
      </div>
      <div className="story-top" data-story-group="top">
        <button className="btn btn-ghost" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pausar' : 'Reproducir'} disabled={last}>
          {playing && !last ? '❚❚' : '▶'}
        </button>
        <button className="btn btn-ghost" onClick={share} disabled={sharing} aria-label="Compartir imagen del resumen">
          ↗
        </button>
        <button className="btn btn-ghost" onClick={onClose} aria-label="Cerrar historia">
          ✕
        </button>
      </div>

      <div
        ref={stage}
        className="story-stage"
        tabIndex={-1}
        aria-roledescription="historia"
        aria-label={`Pantalla ${i + 1} de ${slides.length}`}
      >
        <button className="story-tap story-tap-prev" tabIndex={-1} aria-label="Anterior" onClick={prev} onMouseDown={(e) => e.preventDefault()} />
        <button className="story-tap story-tap-next" tabIndex={-1} aria-label="Siguiente" onClick={next} onMouseDown={(e) => e.preventDefault()} />
        <div key={i} className={`story-slide story-k-${slide.kind}`} aria-live="polite">
          <SlideBody slide={slide} stats={stats} reduced={reduced} actions={actions} />
        </div>
      </div>
      {msg && (
        <div className="story-msg" role="status">
          {msg}
        </div>
      )}
    </div>
  )
}
