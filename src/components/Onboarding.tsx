import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { CINEMETA_URL } from '../lib/addons'
import { useAuth, type AuthState } from '../lib/auth'
import { useSyncStatus, type SyncStatus } from '../lib/cloudSync'
import { addonsStore, progressStore, settingsStore, useStore, watchlistStore, type Settings } from '../lib/store'
import { LangChips } from '../pages/settings/PlayerSettings'

const OPEN_EVENT = 'sp-open-onboarding'
const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])
/** Si la primera sincronización no termina en este tiempo, el asistente no se abre (v0.26.3; ver `onboardingSkip`). */
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
 * También con la sesión guardada (`offline` hasta que `/me` responde): si la app se cerró antes de la primera
 * sincronización, al volver a abrirla mostraba los de fábrica. Sin conexión la vuelta falla enseguida (`error`).
 */
export function houseSynced(auth: AuthState, sync: SyncStatus): boolean {
  return auth.status !== 'in' || sync.lastSync !== undefined || sync.phase === 'error'
}

/**
 * v0.26.2: con login, si la casa ya eligió idiomas (en el asistente de otro aparato o en Ajustes), el asistente
 * no aparece. Se mira recién con la casa sincronizada. Sin login queda como antes (solo `onboardingDone`).
 */
export function houseChoseLangs(auth: AuthState, langsChosen: boolean): boolean {
  return auth.status === 'in' && langsChosen
}

/** `wait`: esperando la primera sincronización; `synced`: lista; `timeout`: no llegó a tiempo (`SYNC_WAIT_MS`). */
export type HouseWait = 'wait' | 'synced' | 'timeout'

/**
 * Por qué no se muestra el asistente de la primera vez (`undefined` = se muestra).
 * - `chosen`: la casa ya eligió idiomas (v0.26.2).
 * - `unknown` (v0.26.3): la sincronización tardó más de `SYNC_WAIT_MS` y no se sabe qué eligió la casa. No se abre
 *   y quedan los idiomas de fábrica (o los de la casa cuando llegue la sincronización). No se marca nada: si la
 *   casa todavía no eligió, el asistente aparece la próxima vez que se abra la app.
 */
export function onboardingSkip(house: HouseWait, auth: AuthState, langsChosen: boolean): 'chosen' | 'unknown' | undefined {
  if (house === 'timeout') return 'unknown'
  if (house === 'synced' && houseChoseLangs(auth, langsChosen)) return 'chosen'
  return undefined
}

/** Una vez lista (o vencida la espera), queda así. */
function useHouseWait(): HouseWait {
  const synced = houseSynced(useAuth(), useSyncStatus())
  const [state, setState] = useState<HouseWait>(synced ? 'synced' : 'wait')
  useEffect(() => {
    if (state !== 'wait') return
    if (synced) {
      setState('synced')
      return
    }
    const t = setTimeout(() => setState('timeout'), SYNC_WAIT_MS)
    return () => clearTimeout(t)
  }, [state, synced])
  return state === 'wait' && synced ? 'synced' : state
}

/** Asistente de la primera vez: idioma del audio y subtítulos, en una sola pantalla. */
export function Onboarding() {
  const [open, setOpen] = useState(isFirstRun)
  /** Abierto desde Ajustes: se muestra aunque la casa ya haya elegido idiomas. */
  const [manual, setManual] = useState(false)
  const settings = useStore(settingsStore)
  const auth = useAuth()
  const inHouse = auth.status === 'in'
  const house = useHouseWait()
  const ready = house !== 'wait'
  const location = useLocation()
  const boxRef = useRef<HTMLDivElement>(null)
  const onWatch = location.pathname.startsWith('/watch')
  const skip = open && !manual ? onboardingSkip(house, auth, settings.langsChosen) : undefined
  const visible = open && ready && !onWatch && !skip

  useEffect(() => {
    const onOpen = () => {
      setManual(true)
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  // La casa ya eligió idiomas: este aparato da el asistente por visto sin mostrarlo. Si la sincronización no
  // llegó a tiempo, tampoco se abre (sin marcar nada; ver `onboardingSkip`).
  useEffect(() => {
    if (!skip) return
    if (skip === 'chosen') settingsStore.set((s) => ({ ...s, onboardingDone: true }))
    setOpen(false)
  }, [skip])

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
  // Cerrarlo (con "Empezar" o Atrás) cuenta como elegir: la casa queda con los idiomas que se ven acá.
  const finish = () => {
    update({ onboardingDone: true, langsChosen: true })
    setOpen(false)
    setManual(false)
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
