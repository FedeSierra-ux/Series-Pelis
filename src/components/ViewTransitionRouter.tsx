import { startTransition, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Router, UNSAFE_createBrowserHistory as createBrowserHistory } from 'react-router-dom'
import {
  clearShared,
  detailIdOf,
  imageReady,
  posterFor,
  prefersReducedMotion,
  SHARED_CLASS,
  sharedKind,
  shouldAnimate,
  startViewTransition,
  takeTappedPoster,
  trackPosterTaps,
  viewTransitionsSupported,
  waitFor,
} from '../lib/viewTransition'
import './view-transitions.css'

type History = ReturnType<typeof createBrowserHistory>
type Update = { action: History['action']; location: History['location'] }

/** Cuánto se espera, como mucho, a que React pinte la pantalla nueva (las páginas diferidas pueden tardar más). */
const COMMIT_MAX_MS = 300
/** Y a que la ficha muestre su póster. */
const POSTER_MAX_MS = 250
/** Al volver, menos: si el póster no está a la vista, la pantalla no queda congelada esperándolo. */
const BACK_MAX_MS = 150

/**
 * Igual que `BrowserRouter`, pero cada cambio de pantalla pasa por `document.startViewTransition` (v0.14, U3):
 * fundido corto y, si tocaste un póster, el póster vuela a la imagen de la ficha (y vuelve con "Atrás").
 * Cubre todo: links, `navigate()`, "Atrás" del navegador y del control remoto.
 */
export function ViewTransitionRouter({ children }: { children: ReactNode }) {
  const historyRef = useRef<History>(undefined)
  if (!historyRef.current) historyRef.current = createBrowserHistory({ v5Compat: true })
  const history = historyRef.current
  const [state, setState] = useState<Update>({ action: history.action, location: history.location })
  const current = useRef(state)
  // Se resuelve cuando React ya pintó la ubicación nueva.
  const committed = useRef<(() => void) | undefined>(undefined)

  useLayoutEffect(() => {
    current.current = state
    committed.current?.()
    committed.current = undefined
  }, [state])

  useLayoutEffect(() => trackPosterTaps(), [])

  useLayoutEffect(() => {
    // La última ubicación pedida: si llegan dos seguidas (una redirección), gana la última.
    let latest: Update | undefined
    let inFlight = false
    const apply = () => {
      const next = latest
      if (next) startTransition(() => setState(next))
    }
    return history.listen((update: Update) => {
      latest = update
      const from = current.current.location
      const tapped = takeTappedPoster()
      if (inFlight || !shouldAnimate(from, update.location, { supported: viewTransitionsSupported(), reducedMotion: prefersReducedMotion() })) {
        apply()
        return
      }
      const kind = sharedKind(from, update.location, !!tapped)
      // Foto "antes": el póster tocado (ida) o el de la ficha (vuelta) lleva el nombre compartido.
      const before = kind === 'enter' ? tapped : kind === 'back' ? document.querySelector<HTMLImageElement>('.detail-poster') : null
      clearShared(before ?? undefined)
      before?.classList.add(SHARED_CLASS)
      inFlight = true
      const vt = startViewTransition(async () => {
        await new Promise<void>((resolve) => {
          committed.current = resolve
          apply()
          setTimeout(resolve, COMMIT_MAX_MS)
        })
        inFlight = false
        // Foto "después": la imagen de la ficha (ida) o el póster de la grilla (vuelta).
        before?.classList.remove(SHARED_CLASS)
        if (!before) return
        const target =
          kind === 'enter'
            ? await waitFor(() => document.querySelector<HTMLImageElement>('.detail-poster'), POSTER_MAX_MS)
            : await (() => {
                // La grilla a la que se vuelve a veces pinta sus pósters un instante después (caché asíncrona).
                const id = detailIdOf(from.pathname)
                return id ? waitFor(() => posterFor(id), BACK_MAX_MS) : undefined
              })()
        if (!target) return
        clearShared(target)
        target.classList.add(SHARED_CLASS)
        await imageReady(target, 150)
      })
      if (!vt) {
        inFlight = false
        apply()
        return
      }
      vt.finished
        .catch(() => {})
        .finally(() => {
          inFlight = false
          clearShared()
        })
    })
  }, [history])

  return (
    <Router location={state.location} navigationType={state.action} navigator={history}>
      {children}
    </Router>
  )
}
