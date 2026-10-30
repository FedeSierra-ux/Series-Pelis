import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import {
  ANNOUNCE_CLEAR_MS,
  ANNOUNCE_SETTLE_MS,
  announcementText,
  settleWait,
  shouldAnnounce,
  shouldMoveFocus,
  type FocusSpot,
} from '../lib/routeAnnounce'
import { isTv } from '../lib/spatialNav'

/** Dónde está el foco: en el vacío, en el riel / la barra de pestañas / la cabecera, o en otro lado. */
function focusSpot(): FocusSpot {
  const el = document.activeElement
  if (!el || el === document.body) return 'body'
  return el.closest('.t2-rail, .t2-tabs, .t2-top') ? 'nav' : 'other'
}

/**
 * Lleva el foco al título de la pantalla (o a <main> si no tiene). Es programático: sin contorno (ver `a11y.css`),
 * y `data-route-focus` hace que la memoria de foco no lo cuente como un lugar al que volver (`trackFocus`).
 */
function focusPageHeading() {
  const main = document.querySelector<HTMLElement>('main')
  const target = main?.querySelector<HTMLElement>('h1') ?? main
  if (!target) return
  const hadTabIndex = target.hasAttribute('tabindex')
  if (!hadTabIndex) target.setAttribute('tabindex', '-1')
  target.setAttribute('data-route-focus', '')
  const clean = () => {
    target.removeAttribute('data-route-focus')
    if (!hadTabIndex) target.removeAttribute('tabindex')
  }
  target.addEventListener('blur', clean, { once: true })
  target.focus({ preventScroll: true })
  // Si el navegador no lo enfocó (capa inerte, elemento oculto), no queda nada puesto.
  if (document.activeElement !== target) {
    target.removeEventListener('blur', clean)
    clean()
  }
}

/**
 * a11y-04: al cambiar de pantalla, un `role="status"` con el título nuevo (sin esto un lector de pantalla no dice
 * nada) y, en PC y celular, el foco al título si había quedado en el riel o en el vacío. En la TV solo el aviso: el
 * cursor lo maneja `focusInitialWhenReady`. Espera a que el título deje de cambiar (la ficha lo pone al cargar).
 */
export function RouteAnnouncer() {
  const { pathname } = useLocation()
  const navType = useNavigationType()
  const [text, setText] = useState('')
  const prev = useRef(pathname)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const before = prev.current
    prev.current = pathname
    if (!shouldAnnounce(before, pathname)) return
    const start = performance.now()
    let last = start
    const title = document.querySelector('title')
    const observer =
      title && typeof MutationObserver === 'function'
        ? new MutationObserver(() => {
            last = performance.now()
          })
        : undefined
    if (title) observer?.observe(title, { childList: true, characterData: true, subtree: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      const wait = settleWait({ now: performance.now(), lastChange: last, start })
      if (wait > 0) {
        timer = setTimeout(tick, wait)
        return
      }
      observer?.disconnect()
      setText(announcementText(document.title, pathname))
      // Un solo borrado pendiente: el de un aviso anterior no tiene que llevarse el nuevo.
      clearTimeout(clearTimer.current)
      clearTimer.current = setTimeout(() => setText(''), ANNOUNCE_CLEAR_MS)
      if (shouldMoveFocus({ tv: isTv(), navType, spot: focusSpot() })) focusPageHeading()
    }
    timer = setTimeout(tick, ANNOUNCE_SETTLE_MS)
    return () => {
      clearTimeout(timer)
      observer?.disconnect()
    }
  }, [pathname])

  return (
    <div className="sp-sr-only" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  )
}
