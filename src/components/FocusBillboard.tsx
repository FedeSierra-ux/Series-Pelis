import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTvMode } from '../lib/tv'
import { loadBillboard, parseDetailHref, type BillboardInfo, type BillboardTarget } from './focusBillboardData'
import { ImdbRating } from './Rating'
import './focus-billboard.css'

// Fondo que sigue al foco (modo TV, estilo Netflix / Google TV): cuando el foco está en una fila de
// Inicio, Películas o Series, la mitad de arriba muestra el fondo, el logo, IMDb, año, duración y una
// sinopsis corta del póster enfocado. Sin tráiler. La navegación espacial (`spatialNav`) deja la fila
// enfocada justo debajo (lee el alto de `[data-focus-billboard]`).

/** Espera a que el foco se quede quieto antes de pedir los datos (las flechas mantenidas pasan de largo). */
export const DEBOUNCE_MS = 300
/** Lo que dura el fundido (el mismo valor está en el CSS). */
export const FADE_MS = 250

/** El póster o tarjeta enfocada, si está en una fila o grilla de la página. */
export function cardTarget(el: Element | null): BillboardTarget | undefined {
  const card = el?.closest?.('a[href^="/detail/"]')
  if (!card || !card.closest('main') || !card.closest('.row-scroller, .grid')) return undefined
  const t = parseDetailHref(card.getAttribute('href'))
  const poster = card.querySelector<HTMLImageElement>('.poster-img > img')?.src || undefined
  return t && { ...t, name: card.getAttribute('title') ?? undefined, poster }
}

/** La imagen ya está bajada (de la caché): se puede mostrar sin esperar el `load`. */
const isLoaded = (img: HTMLImageElement | null) => !!img && img.complete && img.naturalWidth > 0

const inRows = (el: Element | null) => !!el?.closest?.('main .row-scroller, main .grid')

export function FocusBillboard() {
  const tv = useTvMode()
  return tv ? <Billboard /> : null
}

function Billboard() {
  const [active, setActive] = useState(false)
  const [target, setTarget] = useState<BillboardTarget>()
  const [layers, setLayers] = useState<{ cur?: BillboardInfo; prev?: BillboardInfo }>({})

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const pick = (t: BillboardTarget) => setTarget((prev) => (prev && prev.type === t.type && prev.id === t.id ? prev : t))
    const onFocus = (e: FocusEvent) => {
      const el = e.target as Element | null
      const t = cardTarget(el)
      clearTimeout(timer)
      if (!t) {
        // Un botón dentro de la fila (el ✕ o la ⓘ de "Seguir viendo") no apaga el fondo.
        if (!inRows(el)) setActive(false)
        return
      }
      setActive(true)
      timer = setTimeout(() => pick(t), DEBOUNCE_MS)
    }
    // El foco se va a ningún lado (<body>): sin tarjeta enfocada, la portada no queda con un título viejo.
    const onBlur = (e: FocusEvent) => {
      if (e.relatedTarget) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (!cardTarget(document.activeElement) && !inRows(document.activeElement)) setActive(false)
      }, DEBOUNCE_MS)
    }
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onBlur)
    const first = cardTarget(document.activeElement)
    if (first) {
      setActive(true)
      pick(first)
    }
    return () => {
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onBlur)
      clearTimeout(timer)
    }
  }, [])

  // `html[data-billboard]`: con el fondo a la vista, el CSS puede esconder lo que quedaría debajo.
  useEffect(() => {
    const root = document.documentElement
    if (active) root.dataset.billboard = ''
    else delete root.dataset.billboard
    return () => {
      delete root.dataset.billboard
    }
  }, [active])

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

  const show = active && !!layers.cur
  return (
    <div className={`focus-billboard${show ? ' is-on' : ''}`} data-focus-billboard aria-hidden>
      {layers.prev && <Layer key={layers.prev.key} info={layers.prev} />}
      {layers.cur && <Layer key={layers.cur.key} info={layers.cur} />}
    </div>
  )
}

/**
 * Una capa del fondo: imagen, sombra y datos. `media` va entre la imagen y la sombra (el tráiler de la
 * portada de Películas y Series), así el texto queda siempre encima y legible.
 */
export function Layer({ info, media }: { info: BillboardInfo; media?: ReactNode }) {
  const [brokenLogo, setBrokenLogo] = useState(false)
  const [brokenBg, setBrokenBg] = useState(false)
  // v0.26 (explorar-02): mientras el fondo no llegó, la imagen de la tarjeta (ya en caché) difuminada hace de
  // fondo y el fondo de verdad aparece con un fundido encima; mientras el logo no llegó, se ve el nombre.
  // 'cached' = ya estaba al montar: ni fondo provisorio ni nombre de más por un cuadro.
  const [bgState, setBgState] = useState<'wait' | 'loaded' | 'cached'>('wait')
  const [logoReady, setLogoReady] = useState(false)
  const bgRef = useRef<HTMLImageElement>(null)
  const logoRef = useRef<HTMLImageElement>(null)
  useLayoutEffect(() => {
    if (isLoaded(bgRef.current)) setBgState('cached')
    if (isLoaded(logoRef.current)) setLogoReady(true)
  }, [])
  const logo = info.logo && !brokenLogo ? info.logo : undefined
  const bg = info.background && !brokenBg ? info.background : undefined
  return (
    <div className="fbb-layer">
      {info.poster && bgState !== 'cached' && <img className="fbb-bg-ph" src={info.poster} alt="" decoding="async" />}
      {bg && (
        <img
          ref={bgRef}
          className={`fbb-bg${bgState === 'wait' ? ' is-loading' : ''}`}
          src={bg}
          alt=""
          decoding="async"
          onLoad={() => setBgState((s) => (s === 'wait' ? 'loaded' : s))}
          onError={() => setBrokenBg(true)}
        />
      )}
      {media}
      <div className="fbb-shade" />
      <div className="fbb-info">
        {logo && (
          <img
            ref={logoRef}
            className={`fbb-logo${logoReady ? '' : ' is-loading'}`}
            src={logo}
            alt=""
            onLoad={() => setLogoReady(true)}
            onError={() => setBrokenLogo(true)}
          />
        )}
        {(!logo || !logoReady) && <p className="fbb-title">{info.name}</p>}
        {(info.rating || info.facts.length > 0) && (
          <p className="fbb-facts">
            <ImdbRating value={info.rating} />
            {info.facts.map((f, i) => (
              <span key={`${i}-${f}`}>{f}</span>
            ))}
          </p>
        )}
        {info.description && <p className="fbb-desc">{info.description}</p>}
      </div>
    </div>
  )
}
