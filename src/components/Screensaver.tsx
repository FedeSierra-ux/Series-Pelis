import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { browsableCatalogs, getCatalog } from '../lib/addons'
import { IdleTimer } from '../lib/idle'
import { isOnline } from '../lib/online'
import { buildSlides, type Slide, type SlideSource } from '../lib/screensaver'
import { addonsStore, progressStore, settingsStore, useStore, watchlistStore } from '../lib/store'
import { itemTitle, itemYear, LANG, peekTmdb, tmdbImg, type TmdbPage } from '../lib/tmdb'

const SLIDE_MS = 12_000
/** Después de cerrarlo, se ignoran los clics/teclas que siguen al que lo cerró (no ejecutan nada). */
const SWALLOW_MS = 700
/** Movimientos chicos del mouse (la mesa que vibra) no lo cierran. */
const MOVE_PX = 24

const CLOSE_EVENTS = ['keydown', 'pointerdown', 'mousedown', 'touchstart', 'wheel'] as const
const AFTER_EVENTS = ['keyup', 'keypress', 'pointerup', 'mouseup', 'touchend', 'click', 'dblclick', 'contextmenu'] as const

/** ¿Hay un video reproduciéndose? (en el reproductor el protector solo sale con el video en pausa) */
function videoPlaying() {
  return Array.from(document.querySelectorAll('video')).some((v) => !v.paused && !v.ended)
}

async function collectSlides(): Promise<Slide[]> {
  const large = isOnline()
  const progress = Object.values(progressStore.get())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map<SlideSource>((e) => ({ id: e.metaId, name: e.name, background: e.background }))
  const list = Object.values(watchlistStore.get()).map<SlideSource>((i) => ({ id: i.id, name: i.name, year: i.year }))
  const groups: SlideSource[][] = [progress, list]
  if (settingsStore.get().tmdbKey.trim()) {
    const trending = peekTmdb<TmdbPage>('/trending/all/day', { language: LANG })
    groups.push(
      (trending?.results ?? [])
        .filter((i) => i.backdrop_path && (i.media_type === 'movie' || i.media_type === 'tv'))
        .map((i) => ({ id: `tmdb:${i.media_type}:${i.id}`, name: itemTitle(i), background: tmdbImg(i.backdrop_path, 'w1280'), year: itemYear(i) })),
    )
  }
  // Catálogos (de la caché si ya se vieron: no gasta datos ni falla sin conexión).
  const catalogs = browsableCatalogs(addonsStore.get()).slice(0, 3)
  const results = await Promise.allSettled(catalogs.map(({ addon, catalog }) => getCatalog(addon, catalog)))
  for (const r of results) {
    if (r.status === 'fulfilled') groups.push(r.value.map((m) => ({ id: m.id, name: m.name, background: m.background, year: m.releaseInfo })))
  }
  return buildSlides(groups, 40, Math.random, large)
}

function loadImage(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('imagen'))
    img.src = src
  })
}

const clockFmt = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const dateFmt = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="ss-clock">
      <span className="ss-time">{clockFmt.format(now)}</span>
      <span className="ss-date">{dateFmt.format(now)}</span>
    </div>
  )
}

function Slideshow() {
  const [slides, setSlides] = useState<Slide[]>([])
  const [shown, setShown] = useState<{ cur?: Slide; prev?: Slide }>({})

  useEffect(() => {
    let alive = true
    collectSlides()
      .then((list) => alive && setSlides(list))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (slides.length === 0) return
    let alive = true
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    // Se pasa a la siguiente recién cuando cargó la imagen; si falla (sin conexión y sin caché), se saltea.
    const advance = async (tries = 0) => {
      if (!alive || tries >= slides.length) return
      const slide = slides[i % slides.length]
      i++
      try {
        await loadImage(slide.image)
      } catch {
        return advance(tries + 1)
      }
      if (!alive) return
      setShown((s) => ({ prev: s.cur, cur: slide }))
      timer = setTimeout(() => advance(), SLIDE_MS)
    }
    advance()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [slides])

  return (
    <>
      {shown.prev && <img key={`p-${shown.prev.id}`} className="ss-bg ss-prev" src={shown.prev.image} alt="" />}
      {shown.cur && <img key={`c-${shown.cur.id}`} className="ss-bg ss-cur" src={shown.cur.image} alt="" />}
      <div className="ss-shade" />
      {shown.cur && (
        <div key={`t-${shown.cur.id}`} className="ss-title">
          <strong>{shown.cur.name}</strong>
          {shown.cur.year && <span>{shown.cur.year}</span>}
        </div>
      )}
    </>
  )
}

/**
 * Protector de pantalla: después de N minutos sin tocar nada (fuera del reproductor, o con el video
 * en pausa) muestra fondos de pelis y series con el reloj. Cualquier tecla, clic o toque lo cierra
 * sin hacer nada más.
 */
export function Screensaver() {
  const { screensaverMinutes } = useStore(settingsStore)
  const [active, setActive] = useState(false)
  const timerRef = useRef<IdleTimer>(undefined)

  // Un solo temporizador y unos únicos listeners para toda la app.
  useEffect(() => {
    let swallowUntil = 0
    let moveFrom: { x: number; y: number } | undefined
    let lastMove = 0
    const timer = new IdleTimer({
      timeoutMs: 0,
      onIdle: () => {
        moveFrom = undefined
        setActive(true)
      },
      canIdle: () => !videoPlaying() && !document.querySelector('[data-no-screensaver]'),
    })
    timerRef.current = timer

    const close = (e: Event) => {
      if (!timer.isIdle) {
        timer.activity()
        return
      }
      e.preventDefault()
      e.stopImmediatePropagation()
      timer.activity()
      swallowUntil = Date.now() + SWALLOW_MS
      setActive(false)
    }
    const after = (e: Event) => {
      if (Date.now() < swallowUntil) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    const move = (e: PointerEvent) => {
      if (!timer.isIdle) {
        // Sin recalcular en cada píxel.
        if (e.timeStamp - lastMove > 500) {
          lastMove = e.timeStamp
          timer.activity()
        }
        return
      }
      if (!moveFrom) moveFrom = { x: e.clientX, y: e.clientY }
      else if (Math.hypot(e.clientX - moveFrom.x, e.clientY - moveFrom.y) > MOVE_PX) {
        timer.activity()
        swallowUntil = Date.now() + SWALLOW_MS
        setActive(false)
      }
    }
    const opts = { capture: true, passive: false } as const
    CLOSE_EVENTS.forEach((t) => window.addEventListener(t, close, opts))
    AFTER_EVENTS.forEach((t) => window.addEventListener(t, after, opts))
    window.addEventListener('pointermove', move, { capture: true, passive: true })
    return () => {
      timer.stop()
      CLOSE_EVENTS.forEach((t) => window.removeEventListener(t, close, opts))
      AFTER_EVENTS.forEach((t) => window.removeEventListener(t, after, opts))
      window.removeEventListener('pointermove', move, { capture: true })
    }
  }, [])

  useEffect(() => {
    timerRef.current?.setTimeoutMs(screensaverMinutes * 60_000)
    if (screensaverMinutes === 0) setActive(false)
  }, [screensaverMinutes])

  if (!active) return null
  // En pantalla completa solo se ve lo que está adentro del elemento a pantalla completa.
  return createPortal(
    <div className="screensaver" role="dialog" aria-modal="true" aria-label="Protector de pantalla. Tocá cualquier tecla para volver.">
      <Slideshow />
      <Clock />
      <p className="ss-hint">Tocá cualquier tecla para volver</p>
    </div>,
    document.fullscreenElement ?? document.body,
  )
}
