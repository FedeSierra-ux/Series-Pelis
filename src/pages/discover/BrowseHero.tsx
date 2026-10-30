import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { cardTarget, DEBOUNCE_MS, FADE_MS, Layer } from '../../components/FocusBillboard'
import { loadBillboard, type BillboardInfo, type BillboardTarget } from '../../components/focusBillboardData'
import { resolveTrailer } from '../../lib/hoverTrailer'
import { isTv } from '../../lib/spatialNav'
import { whenIdle } from '../../lib/whenIdle'
import type { MetaPreview } from '../../lib/types'
import { DetailIcon } from '../detail/DetailIcons'
import { useBackdropTrailerAllowed } from '../detail/HeroTrailer'
import { BACKDROP_DELAY_MS, embedTrailerUrl, TRAILER_IDLE_MS, TRAILER_TV_QUIET_MS } from '../detail/trailers'
import { useYtPlayer } from '../detail/useYtPlayer'
import './browse.css'

// Portada de Películas y Series (v0.15, U11): arriba queda fija y muestra el póster que estás mirando
// (mouse o foco del control remoto). Si te quedás unos segundos, pasa al tráiler con sonido, como en
// la TV de Netflix. Si el navegador no deja arrancar con sonido (sin un clic o una tecla antes), sigue
// sin sonido y el botón lo activa. Lleva `data-focus-billboard`: la navegación con flechas deja la
// fila enfocada justo debajo.

/** A partir de cuándo se busca el tráiler, así está listo cuando se cumplen los segundos. */
const RESOLVE_MS = 800

const MUTED_KEY = 'sp-browse-muted'

/** Si el usuario silenció el tráiler de la portada en este aparato (se recuerda). */
function savedMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1'
  } catch {
    return false
  }
}

function saveMuted(muted: boolean) {
  try {
    if (muted) localStorage.setItem(MUTED_KEY, '1')
    else localStorage.removeItem(MUTED_KEY)
  } catch {
    // Sin almacenamiento: vale para esta vez.
  }
}

function isTyping() {
  const el = document.activeElement
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLTextAreaElement || el.isContentEditable) return true
  return el instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button', 'submit'].includes(el.type)
}

interface Props {
  /** "Películas" o "Series". */
  title: string
  /** Lo que se muestra al abrir (el primero del Top 10). */
  first?: BillboardTarget
  /** "Explorar todo": la grilla con filtros. */
  exploreTo: string
  /** Las filas: el mouse o el foco sobre sus pósters cambian la portada. */
  rowsRef: RefObject<HTMLElement | null>
}

export function BrowseHero({ title, first, exploreTo, rowsRef }: Props) {
  const [target, setTarget] = useState<BillboardTarget>()
  const [layers, setLayers] = useState<{ cur?: BillboardInfo; prev?: BillboardInfo }>({})
  const [trailer, setTrailer] = useState<{ key: string; ytId: string }>()
  const [controls, setControls] = useState<HTMLDivElement | null>(null)
  // a11y-15 (2.2.2): pausa del tráiler en bucle. Vale para toda la pantalla: con otro póster no arranca solo.
  const [paused, setPaused] = useState(false)
  const allowed = useBackdropTrailerAllowed()
  const chosen = useRef(false)
  // sistema-01: el fondo de la primera capa es el LCP de la pantalla y se pide con prioridad alta; las que se
  // arman después al pasar por otros pósters no.
  const firstKey = useRef<string>(undefined)

  // Al abrir, el primero del Top 10 (hasta que el usuario pase por otro póster).
  useEffect(() => {
    if (first && !chosen.current) setTarget((prev) => prev ?? first)
  }, [first])

  // El póster bajo el mouse o con el foco, con una pausa: pasar de largo no cambia la portada.
  useEffect(() => {
    const rows = rowsRef.current
    if (!rows) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const pick = (el: Element | null) => {
      const t = cardTarget(el)
      if (!t || !rows.contains(el)) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        chosen.current = true
        setTarget((prev) => (prev && prev.type === t.type && prev.id === t.id ? prev : t))
      }, DEBOUNCE_MS)
    }
    // El mouseover también salta cuando la página se mueve bajo el puntero quieto (rueda, flechas):
    // solo cuenta después de un movimiento real del mouse, así no le gana al foco (explorar-bug-4).
    let still = true
    let lastX = -1
    let lastY = -1
    const card = (t: EventTarget | null) => (t as Element | null)?.closest?.('a[href^="/detail/"]') ?? null
    const onOver = (e: MouseEvent) => {
      if (!still) pick(card(e.target))
    }
    // Chrome manda un mousemove sin moverse después de scrollear: se compara con la posición anterior
    // (la primera solo se anota).
    const onMove = (e: MouseEvent) => {
      const first = lastX < 0
      if (e.clientX === lastX && e.clientY === lastY) return
      lastX = e.clientX
      lastY = e.clientY
      if (first || !still) return
      still = false
      pick(card(e.target))
    }
    const onStill = () => {
      still = true
    }
    // El foco manda hasta que el mouse se mueva de nuevo.
    const onFocus = (e: FocusEvent) => {
      still = true
      pick(e.target as Element | null)
    }
    // Se fue del póster antes de la pausa: no cambia (con el mouse quieto, la pausa es la del foco).
    const onOut = (e: MouseEvent) => {
      if (!still && !card(e.relatedTarget)) clearTimeout(timer)
    }
    rows.addEventListener('mouseover', onOver)
    rows.addEventListener('mouseout', onOut)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('focusin', onFocus)
    document.addEventListener('keydown', onStill, true)
    window.addEventListener('scroll', onStill, true)
    return () => {
      rows.removeEventListener('mouseover', onOver)
      rows.removeEventListener('mouseout', onOut)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('keydown', onStill, true)
      window.removeEventListener('scroll', onStill, true)
      clearTimeout(timer)
    }
  }, [rowsRef])

  useEffect(() => {
    if (!target) return
    let alive = true
    loadBillboard(target)
      .then((info) => {
        if (!alive) return
        firstKey.current ??= info.key
        setLayers((l) => (l.cur?.key === info.key ? l : { prev: l.cur, cur: info }))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [target])

  // El anterior queda debajo mientras el nuevo aparece; después se saca.
  useEffect(() => {
    if (!layers.prev) return
    const t = setTimeout(() => setLayers((l) => ({ cur: l.cur })), FADE_MS + 60)
    return () => clearTimeout(t)
  }, [layers.prev])

  // Quieto unos segundos sobre el mismo título: el tráiler.
  useEffect(() => {
    setTrailer(undefined)
    if (!allowed || !target) return
    let alive = true
    let mountTimer: ReturnType<typeof setTimeout> | undefined
    let cancelIdle: (() => void) | undefined
    const key = `${target.type}:${target.id}`
    const started = Date.now()
    const t = setTimeout(() => {
      const meta: MetaPreview = { id: target.id, type: target.type, name: target.name ?? '' }
      resolveTrailer(meta)
        .then(({ ytId }) => {
          if (!alive || !ytId) return
          const wait = Math.max(0, BACKDROP_DELAY_MS - (Date.now() - started))
          // v0.36 (sistema-05): el iframe de YouTube (~1 MB y mucho JS) se monta con el navegador ocioso, no justo
          // a los 3 s; en la TV, además, sin teclas durante 1 s. Sigue valiendo "solo se ve con estado real de YouTube".
          mountTimer = setTimeout(() => {
            cancelIdle = whenIdle(
              () => {
                if (alive) setTrailer({ key, ytId })
              },
              { timeoutMs: TRAILER_IDLE_MS, quietKeysMs: isTv() ? TRAILER_TV_QUIET_MS : 0 },
            )
          }, wait)
        })
        .catch(() => {})
    }, RESOLVE_MS)
    return () => {
      alive = false
      clearTimeout(t)
      clearTimeout(mountTimer)
      cancelIdle?.()
    }
  }, [target, allowed])

  const cur = layers.cur
  const media =
    cur && trailer && trailer.key === cur.key ? (
      <BrowseTrailer key={trailer.ytId} ytId={trailer.ytId} name={cur.name} controls={controls} paused={paused} onPaused={setPaused} />
    ) : undefined

  return (
    <section className="browse-hero" data-focus-billboard aria-label={cur ? `${title}: ${cur.name}` : title}>
      <div className="bh-layers">
        {layers.prev && <Layer key={layers.prev.key} info={layers.prev} priority={layers.prev.key === firstKey.current} />}
        {cur ? <Layer key={cur.key} info={cur} media={media} priority={cur.key === firstKey.current} /> : <div className="bh-empty skeleton" />}
      </div>
      <div className="bh-top">
        <h1>{title}</h1>
        <Link to={exploreTo} className="bh-explore">
          Explorar todo
        </Link>
      </div>
      <div ref={setControls} className="bh-controls" />
    </section>
  )
}

function BrowseTrailer({
  ytId,
  name,
  controls,
  paused,
  onPaused,
}: {
  ytId: string
  name: string
  controls: HTMLDivElement | null
  paused: boolean
  onPaused: (paused: boolean) => void
}) {
  // Con sonido, salvo que lo hayan silenciado antes (o que haya quedado en pausa: ni un instante de sonido).
  // Sin "mostrar igual": sin un estado real de YouTube queda la imagen.
  const [startMuted] = useState(() => paused || savedMuted())
  const yt = useYtPlayer(startMuted, false)
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden')
  const toggle = () => {
    const next = !yt.muted
    yt.setMuted(next)
    saveMuted(next)
  }
  const toggleRef = useRef(toggle)
  toggleRef.current = toggle

  useEffect(() => {
    const onVis = () => setPageVisible(document.visibilityState !== 'hidden')
    // M activa o silencia, igual que en el tráiler de los pósters.
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping()) {
        e.preventDefault()
        toggleRef.current()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Con la pestaña oculta o pausado por el usuario, en pausa.
  const { ready, playing } = yt
  useEffect(() => {
    if (!ready) return
    const shouldPlay = pageVisible && !paused
    if (shouldPlay && !playing) yt.play()
    else if (!shouldPlay && playing) yt.pause()
  }, [pageVisible, paused, ready])

  const origin = typeof location !== 'undefined' ? location.origin : undefined
  const muted = yt.muted

  return (
    <>
      <div className={`bh-trailer${ready && playing && !paused ? ' ready' : ''}`} aria-hidden>
        <iframe
          ref={yt.frame}
          src={embedTrailerUrl(ytId, { muted: startMuted, loop: true, origin })}
          title={`Tráiler de ${name}`}
          tabIndex={-1}
          allow="autoplay; encrypted-media"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={yt.onLoad}
        />
      </div>
      {ready &&
        controls &&
        createPortal(
          <>
            <button
              type="button"
              className="bh-ctrl"
              onClick={() => onPaused(!paused)}
              aria-label={paused ? 'Seguir el tráiler' : 'Pausar el tráiler'}
              title={paused ? 'Seguir' : 'Pausar'}
            >
              <DetailIcon name={paused ? 'play' : 'pause'} size={22} />
            </button>
            {/* Rótulo fijo con `aria-pressed` (activado = suena): si el rótulo cambiara además, el lector diría dos estados. */}
            <button
              type="button"
              className="bh-ctrl"
              onClick={toggle}
              aria-label="Sonido del tráiler"
              aria-pressed={!muted}
              title={muted ? 'Activar sonido (M)' : 'Silenciar (M)'}
            >
              <DetailIcon name={muted ? 'soundOff' : 'soundOn'} size={22} />
            </button>
          </>,
          controls,
        )}
    </>
  )
}
