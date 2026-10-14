import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { cardTarget, DEBOUNCE_MS, FADE_MS, Layer } from '../../components/FocusBillboard'
import { loadBillboard, type BillboardInfo, type BillboardTarget } from '../../components/focusBillboardData'
import { resolveTrailer } from '../../lib/hoverTrailer'
import type { MetaPreview } from '../../lib/types'
import { DetailIcon } from '../detail/DetailIcons'
import { useBackdropTrailerAllowed } from '../detail/HeroTrailer'
import { BACKDROP_DELAY_MS, embedTrailerUrl } from '../detail/trailers'
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
  const allowed = useBackdropTrailerAllowed()
  const chosen = useRef(false)

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
    const onOver = (e: MouseEvent) => pick((e.target as Element | null)?.closest?.('a[href^="/detail/"]') ?? null)
    const onFocus = (e: FocusEvent) => pick(e.target as Element | null)
    // Se fue del póster antes de la pausa: no cambia.
    const onOut = (e: MouseEvent) => {
      const to = e.relatedTarget as Element | null
      if (!to?.closest?.('a[href^="/detail/"]')) clearTimeout(timer)
    }
    rows.addEventListener('mouseover', onOver)
    rows.addEventListener('mouseout', onOut)
    document.addEventListener('focusin', onFocus)
    return () => {
      rows.removeEventListener('mouseover', onOver)
      rows.removeEventListener('mouseout', onOut)
      document.removeEventListener('focusin', onFocus)
      clearTimeout(timer)
    }
  }, [rowsRef])

  useEffect(() => {
    if (!target) return
    let alive = true
    loadBillboard(target)
      .then((info) => {
        if (alive) setLayers((l) => (l.cur?.key === info.key ? l : { prev: l.cur, cur: info }))
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
    const key = `${target.type}:${target.id}`
    const started = Date.now()
    const t = setTimeout(() => {
      const meta: MetaPreview = { id: target.id, type: target.type, name: target.name ?? '' }
      resolveTrailer(meta)
        .then(({ ytId }) => {
          if (!alive || !ytId) return
          const wait = Math.max(0, BACKDROP_DELAY_MS - (Date.now() - started))
          setTimeout(() => alive && setTrailer({ key, ytId }), wait)
        })
        .catch(() => {})
    }, RESOLVE_MS)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [target, allowed])

  const cur = layers.cur
  const media =
    cur && trailer && trailer.key === cur.key ? (
      <BrowseTrailer key={trailer.ytId} ytId={trailer.ytId} name={cur.name} controls={controls} />
    ) : undefined

  return (
    <section className="browse-hero" data-focus-billboard aria-label={cur ? `${title}: ${cur.name}` : title}>
      <div className="bh-layers">
        {layers.prev && <Layer key={layers.prev.key} info={layers.prev} />}
        {cur ? <Layer key={cur.key} info={cur} media={media} /> : <div className="bh-empty skeleton" />}
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

function BrowseTrailer({ ytId, name, controls }: { ytId: string; name: string; controls: HTMLDivElement | null }) {
  // Con sonido, salvo que lo hayan silenciado antes. Sin "mostrar igual": sin un estado real de YouTube queda la imagen.
  const [startMuted] = useState(savedMuted)
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

  // Con la pestaña oculta, en pausa.
  const { ready, playing } = yt
  useEffect(() => {
    if (!ready) return
    if (pageVisible && !playing) yt.play()
    else if (!pageVisible && playing) yt.pause()
  }, [pageVisible, ready])

  const origin = typeof location !== 'undefined' ? location.origin : undefined
  const muted = yt.muted

  return (
    <>
      <div className={`bh-trailer${ready && playing ? ' ready' : ''}`} aria-hidden>
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
          <button
            type="button"
            className="bh-ctrl"
            onClick={toggle}
            aria-label={muted ? 'Activar el sonido del tráiler' : 'Silenciar el tráiler'}
            aria-pressed={!muted}
            title={muted ? 'Activar sonido (M)' : 'Silenciar (M)'}
          >
            <DetailIcon name={muted ? 'soundOff' : 'soundOn'} size={22} />
          </button>,
          controls,
        )}
    </>
  )
}
