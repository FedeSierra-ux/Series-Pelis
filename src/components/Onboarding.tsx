import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { CINEMETA_URL } from '../lib/addons'
import { useAuth, type AuthState } from '../lib/auth'
import { useSyncStatus, type SyncStatus } from '../lib/cloudSync'
import { focusInitialTarget, isTv } from '../lib/spatialNav'
import { addonsStore, progressStore, settingsStore, useStore, watchlistStore, type Settings } from '../lib/store'
import { LangChips } from '../pages/settings/PlayerSettings'

const OPEN_EVENT = 'sp-open-onboarding'
const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
 * sincronización, al volver a abrirla mostraba los de fábrica. Un error no cuenta como sincronizada (ver
 * `houseSyncFailed`).
 */
export function houseSynced(auth: AuthState, sync: SyncStatus): boolean {
  return auth.status !== 'in' || sync.lastSync !== undefined
}

/**
 * La primera sincronización falló (sin conexión, la vuelta falla enseguida): no se sabe qué eligió la casa y el
 * asistente no se abre, igual que cuando no llega a tiempo (`onboardingSkip` → `unknown`). Sin login, nunca.
 */
export function houseSyncFailed(auth: AuthState, sync: SyncStatus): boolean {
  return auth.status === 'in' && sync.lastSync === undefined && sync.phase === 'error'
}

/**
 * v0.26.2: con login, si la casa ya eligió idiomas (en el asistente de otro aparato o en Ajustes), el asistente
 * no aparece. Se mira recién con la casa sincronizada. Sin login queda como antes (solo `onboardingDone`).
 */
export function houseChoseLangs(auth: AuthState, langsChosen: boolean): boolean {
  return auth.status === 'in' && langsChosen
}

/**
 * `wait`: esperando la primera sincronización; `synced`: lista; `timeout`: no llegó a tiempo (`SYNC_WAIT_MS`);
 * `error`: falló antes de terminar la primera vuelta.
 */
export type HouseWait = 'wait' | 'synced' | 'timeout' | 'error'

/** Cómo está la primera sincronización ahora (sin el reloj de `SYNC_WAIT_MS`). */
export function houseWaitNow(auth: AuthState, sync: SyncStatus): HouseWait {
  if (houseSynced(auth, sync)) return 'synced'
  return houseSyncFailed(auth, sync) ? 'error' : 'wait'
}

/**
 * Por qué no se muestra el asistente de la primera vez (`undefined` = se muestra).
 * - `chosen`: la casa ya eligió idiomas (v0.26.2).
 * - `unknown` (v0.26.3): la sincronización tardó más de `SYNC_WAIT_MS`, o falló, y no se sabe qué eligió la casa.
 *   No se abre y quedan los idiomas de fábrica (o los de la casa cuando llegue la sincronización). No se marca
 *   nada: si la casa todavía no eligió, el asistente aparece la próxima vez que se abra la app.
 */
export function onboardingSkip(house: HouseWait, auth: AuthState, langsChosen: boolean): 'chosen' | 'unknown' | undefined {
  if (house === 'timeout' || house === 'error') return 'unknown'
  if (house === 'synced' && houseChoseLangs(auth, langsChosen)) return 'chosen'
  return undefined
}

/** Una vez lista (o vencida la espera, o con error), queda así. */
function useHouseWait(): HouseWait {
  const now = houseWaitNow(useAuth(), useSyncStatus())
  const [state, setState] = useState<HouseWait>(now)
  useEffect(() => {
    if (state !== 'wait') return
    if (now !== 'wait') {
      setState(now)
      return
    }
    const t = setTimeout(() => setState('timeout'), SYNC_WAIT_MS)
    return () => clearTimeout(t)
  }, [state, now])
  return state === 'wait' ? now : state
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
  // llegó a tiempo o falló, tampoco se abre (sin marcar nada; ver `onboardingSkip`).
  useEffect(() => {
    if (!skip) return
    if (skip === 'chosen') settingsStore.set((s) => ({ ...s, onboardingDone: true }))
    setOpen(false)
  }, [skip])

  // Con teclado: el foco arranca en el primer idioma. En la TV (tv-08) va a «Empezar» (`data-autofocus`): el primer OK
  // sobre un chip lo sacaba y renumeraba el resto; los chips se alcanzan con ↑. En pantallas táctiles (v0.26) va a la
  // caja del diálogo: si no, el primer chip arrancaba con el anillo de foco, como si estuviera elegido de otra forma.
  // Al cerrar (a11y-03) el foco vuelve a donde estaba (el botón de Ajustes que lo abrió) o, en la TV, a lo primero
  // de la pantalla; antes quedaba en <body>.
  const before = useRef<HTMLElement | null>(null)
  const wasShown = useRef(false)
  useEffect(() => {
    if (visible) {
      wasShown.current = true
      const prev = document.activeElement
      before.current = prev instanceof HTMLElement && prev !== document.body ? prev : null
      const touch = !document.documentElement.hasAttribute('data-tv') && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
      const tv = isTv()
      const first = touch
        ? boxRef.current
        : tv
          ? boxRef.current?.querySelector<HTMLElement>('[data-autofocus]')
          : boxRef.current?.querySelector<HTMLElement>('.ob-body button, .ob-body input, .ob-actions .btn-primary')
      first?.focus({ preventScroll: true })
      return
    }
    if (!wasShown.current) return
    wasShown.current = false
    const prev = before.current
    before.current = null
    const active = document.activeElement
    if (active && active !== document.body) return
    if (prev?.isConnected) prev.focus({ preventScroll: true })
    else if (isTv()) focusInitialTarget()
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
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    if (e.key === 'Tab' && boxRef.current) {
      // Tab y Shift+Tab dan la vuelta dentro del asistente (a11y-03); las flechas ya se quedan por `data-nav-scope`.
      const els = Array.from(boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0)
      if (!els.length) return
      const i = els.indexOf(document.activeElement as HTMLElement)
      const next = e.shiftKey ? (i <= 0 ? els.length - 1 : i - 1) : i >= els.length - 1 ? 0 : i + 1
      e.preventDefault()
      els[next].focus({ preventScroll: true })
      els[next].scrollIntoView({ block: 'nearest' })
      return
    }
    if (!BACK_KEYS.has(e.key)) return
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
          <p className="muted small">Si una fuente trae varias pistas, se elige la primera de estas. Tocá para sumar o sacar; el número es el orden.</p>
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
          <button type="button" className="btn btn-primary ob-skip" data-autofocus onClick={finish}>
            Empezar
          </button>
        </div>
      </div>
    </div>
  )
}
