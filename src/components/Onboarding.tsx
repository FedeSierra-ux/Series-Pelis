import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { CINEMETA_URL } from '../lib/addons'
import { useAuth } from '../lib/auth'
import { useSyncStatus } from '../lib/cloudSync'
import { addonsStore, progressStore, settingsStore, useStore, watchlistStore, type Settings } from '../lib/store'
import { LangChips } from '../pages/settings/PlayerSettings'

const OPEN_EVENT = 'sp-open-onboarding'
const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])
/** Si la primera sincronización no termina en este tiempo, el asistente se abre igual. */
const SYNC_WAIT_MS = 10_000

/** Vuelve a abrir el asistente (desde Ajustes). */
export function openOnboarding() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/** Primera vez: no lo vio, no agregó addons y no tiene historial ni lista (no molesta a quien ya usa la app). */
function isFirstRun() {
  const s = settingsStore.get()
  if (s.onboardingDone) return false
  const onlyCinemeta = addonsStore.get().every((a) => a.transportUrl === CINEMETA_URL)
  return onlyCinemeta && Object.keys(progressStore.get()).length === 0 && Object.keys(watchlistStore.get()).length === 0
}

/**
 * Con login, los idiomas son de la casa: el asistente espera la primera sincronización para mostrar lo que ya
 * eligió la casa (y para que lo que se cambie acá no lo pise el servidor). Una vez listo, queda listo.
 */
function useHouseReady(): boolean {
  const auth = useAuth()
  const sync = useSyncStatus()
  const needsSync = auth.status === 'in' && !auth.offline
  const synced = !needsSync || sync.lastSync !== undefined || sync.phase === 'error'
  const [ready, setReady] = useState(synced)
  useEffect(() => {
    if (ready) return
    if (synced) {
      setReady(true)
      return
    }
    const t = setTimeout(() => setReady(true), SYNC_WAIT_MS)
    return () => clearTimeout(t)
  }, [ready, synced])
  return ready || synced
}

/** Asistente de la primera vez: idioma del audio y subtítulos, en una sola pantalla. */
export function Onboarding() {
  const [open, setOpen] = useState(isFirstRun)
  const settings = useStore(settingsStore)
  const inHouse = useAuth().status === 'in'
  const ready = useHouseReady()
  const location = useLocation()
  const boxRef = useRef<HTMLDivElement>(null)
  const onWatch = location.pathname.startsWith('/watch')
  const visible = open && ready && !onWatch

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  // Con el control remoto: el foco arranca en el primer idioma. En pantallas táctiles (v0.26) va a la caja
  // del diálogo: si no, el primer chip arrancaba con el anillo de foco, como si estuviera elegido de otra forma.
  useEffect(() => {
    if (!visible) return
    const touch = !document.documentElement.hasAttribute('data-tv') && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
    const first = touch ? boxRef.current : boxRef.current?.querySelector<HTMLElement>('.ob-body button, .ob-body input, .ob-actions .btn-primary')
    first?.focus({ preventScroll: true })
  }, [visible])

  // Mientras espera la sincronización deja una marca, así la guía de la TV no se abre antes que el asistente.
  if (!visible) return open && !ready && !onWatch ? <span className="ob-pending" hidden /> : null

  const update = (patch: Partial<Settings>) => settingsStore.set((s) => ({ ...s, ...patch }))
  const finish = () => {
    update({ onboardingDone: true })
    setOpen(false)
  }

  // "Atrás" del control (Escape, Backspace, GoBack) cierra el asistente.
  // Nunca llega a la navegación general (que cambiaría la página que está debajo).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!BACK_KEYS.has(e.key) || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    e.preventDefault()
    e.stopPropagation()
    finish()
  }

  return (
    <div className="onboarding" data-nav-scope data-no-screensaver onKeyDown={onKeyDown}>
      <div ref={boxRef} className="ob-box" role="dialog" aria-modal="true" aria-labelledby="ob-title" tabIndex={-1}>
        <div className="ob-body">
          <h2 id="ob-title">¡Hola! ¿En qué idioma preferís ver?</h2>
          <p className="muted">
            {inHouse ? 'Vale para toda la casa. ' : ''}
            Se puede cambiar después en Ajustes.
          </p>
          <h3>Idioma del audio</h3>
          <p className="muted small">Si un stream trae varias pistas, se elige la primera de estas. Tocá para sumar o sacar; el número es el orden.</p>
          <LangChips label="Idiomas de audio preferidos" value={settings.audioLangs} onChange={(audioLangs) => update({ audioLangs })} />
          <h3>Subtítulos</h3>
          <LangChips label="Idiomas de subtítulos preferidos" value={settings.subtitleLangs} onChange={(subtitleLangs) => update({ subtitleLangs })} />
          <label className="check">
            <input type="checkbox" checked={settings.autoSubtitles} onChange={(e) => update({ autoSubtitles: e.target.checked })} />
            Activarlos solos
          </label>
        </div>
        <div className="ob-actions">
          <span className="spacer" />
          {/* `ob-skip`: los tests de Playwright cierran el asistente con esta clase. */}
          <button type="button" className="btn btn-primary ob-skip" onClick={finish}>
            Empezar
          </button>
        </div>
      </div>
    </div>
  )
}
