import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { CINEMETA_URL } from '../lib/addons'
import { useAddons } from '../lib/hooks'
import { addonsStore, progressStore, settingsStore, useStore, watchlistStore, type Settings } from '../lib/store'
import { testTmdbKey, useServerTmdb, useTmdbKey } from '../lib/tmdb'
import { LangChips } from '../pages/settings/PlayerSettings'
import { AddonUrlForm } from './AddonUrlForm'
import { KeyboardToggle } from './OnScreenKeyboard'

const OPEN_EVENT = 'sp-open-onboarding'
const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])

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

const STEPS = ['Idiomas', 'Addons', 'TMDB', 'Listo'] as const

function LanguagesStep() {
  const settings = useStore(settingsStore)
  const update = (patch: Partial<Settings>) => settingsStore.set((s) => ({ ...s, ...patch }))
  return (
    <>
      <h2 id="ob-title">¡Hola! Dejemos Series-Pelis a tu gusto</h2>
      <p className="muted">Son 3 pasos cortos. Todo se puede cambiar después en Ajustes.</p>
      <h3>Idioma del audio</h3>
      <p className="muted small">Si un stream trae varias pistas, se elige la primera de estas. Tocá para sumar o sacar; el número es el orden.</p>
      <LangChips label="Idiomas de audio preferidos" value={settings.audioLangs} onChange={(audioLangs) => update({ audioLangs })} />
      <h3>Subtítulos</h3>
      <LangChips label="Idiomas de subtítulos preferidos" value={settings.subtitleLangs} onChange={(subtitleLangs) => update({ subtitleLangs })} />
      <label className="check">
        <input type="checkbox" checked={settings.autoSubtitles} onChange={(e) => update({ autoSubtitles: e.target.checked })} />
        Activarlos solos
      </label>
    </>
  )
}

function AddonStep() {
  const addons = useAddons().filter((a) => a.transportUrl !== CINEMETA_URL)
  return (
    <>
      <h2 id="ob-title">Agregá tus addons de Stremio</h2>
      <p className="muted">
        Cinemeta ya viene instalado: da el catálogo y los puntajes de IMDb. Para reproducir hace falta al menos un addon de
        streams. Pegá la URL del manifest (termina en <code>/manifest.json</code>; también sirve el enlace <code>stremio://</code>).
        Si el addon usa Real-Debrid o TorBox, esa configuración ya viene en la URL.
      </p>
      <AddonUrlForm disableEmpty />
      {addons.length > 0 && (
        <ul className="ob-addons">
          {addons.map((a) => (
            <li key={a.transportUrl}>✓ {a.manifest.name}</li>
          ))}
        </ul>
      )}
    </>
  )
}

function TmdbStep() {
  const configured = useStore(settingsStore).tmdbKey.trim().length > 0
  const fromSite = useServerTmdb()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const key = draft.trim()
    if (!key || busy) return
    setBusy(true)
    setMsg(undefined)
    const ok = await testTmdbKey(key)
    setBusy(false)
    if (!ok) return setMsg({ ok: false, text: 'TMDB rechazó la key. Revisá que sea la "API Key" o el "API Read Access Token".' })
    settingsStore.set((s) => ({ ...s, tmdbKey: key }))
    setDraft('')
    setMsg({ ok: true, text: '✓ Key guardada.' })
  }

  // Con la key del sitio (secreto en Cloudflare) no hay nada que configurar.
  if (fromSite && !configured) {
    return (
      <>
        <h2 id="ob-title">TMDB</h2>
        <p className="ok">✓ Ya viene activado: las fichas se ven en español, con reparto, sagas, tendencias y tráileres.</p>
        <p className="muted">No hace falta hacer nada. Seguí con “Siguiente”.</p>
      </>
    )
  }

  return (
    <>
      <h2 id="ob-title">TMDB (opcional)</h2>
      <p className="muted">
        Con una key gratuita de TMDB las fichas se ven en español latino y se suman reparto, sagas, tendencias y tráileres. Sin
        key la app funciona igual, con los datos de Cinemeta.
      </p>
      <details className="ob-howto">
        <summary>Cómo sacar la key</summary>
        <ol>
          <li>
            Creá una cuenta gratis en{' '}
            <a href="https://www.themoviedb.org/signup" target="_blank" rel="noreferrer">
              themoviedb.org
            </a>
            .
          </li>
          <li>
            Entrá a{' '}
            <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">
              Ajustes → API
            </a>{' '}
            y pedí una key de uso personal.
          </li>
          <li>Copiá la “API Key” o el “API Read Access Token” y pegala acá.</li>
        </ol>
      </details>
      {configured ? (
        <p className="ok">✓ Key configurada</p>
      ) : (
        <>
          <form className="inline-form" onSubmit={save}>
            <input
              type="password"
              autoComplete="off"
              placeholder="API Key o Read Access Token"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Key de TMDB"
            />
            <button className="btn btn-primary" disabled={busy || !draft.trim()}>
              {busy ? 'Probando…' : 'Guardar'}
            </button>
          </form>
          <KeyboardToggle value={draft} onChange={setDraft} onDone={() => save()} doneLabel="Guardar" label="Teclado para la key de TMDB" />
        </>
      )}
      {msg && <p className={msg.ok ? 'ok' : 'error-text'}>{msg.text}</p>}
    </>
  )
}

function DoneStep() {
  const tmdbOn = useTmdbKey().length > 0
  const addons = useAddons().filter((a) => a.transportUrl !== CINEMETA_URL)
  return (
    <>
      <h2 id="ob-title">¡Listo!</h2>
      <ul className="ob-summary">
        <li>{addons.length > 0 ? `✓ ${addons.length === 1 ? '1 addon' : `${addons.length} addons`} de streams` : '• Sin addons de streams todavía (los agregás en Ajustes)'}</li>
        <li>{tmdbOn ? '✓ TMDB activado: fichas en español' : '• Sin TMDB (opcional)'}</li>
        <li>✓ Navegación con el control remoto: flechas, Enter y Atrás</li>
      </ul>
      <p className="muted">Todo esto se cambia en Ajustes. Ahí también podés ver las opciones avanzadas.</p>
    </>
  )
}

/** Asistente de la primera vez: idiomas, addons, TMDB y listo. Se puede saltar. */
export function Onboarding() {
  const [open, setOpen] = useState(isFirstRun)
  const [step, setStep] = useState(0)
  const location = useLocation()
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onOpen = () => {
      setStep(0)
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  // Con el control remoto: el foco arranca en el primer elemento de cada paso.
  useEffect(() => {
    if (!open) return
    const first = boxRef.current?.querySelector<HTMLElement>('.ob-body button, .ob-body input, .ob-body summary, .ob-actions .btn-primary')
    first?.focus({ preventScroll: true })
  }, [open, step])

  if (!open || location.pathname.startsWith('/watch')) return null

  const finish = () => {
    settingsStore.set((s) => ({ ...s, onboardingDone: true }))
    setOpen(false)
  }
  const last = step === STEPS.length - 1

  // "Atrás" del control (Escape, Backspace, GoBack): vuelve un paso o, en el primero, cierra el asistente.
  // Nunca llega a la navegación general (que cambiaría la página que está debajo).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!BACK_KEYS.has(e.key) || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    const t = e.target
    const typing = t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button', 'submit'].includes(t.type))
    // Backspace dentro de un campo borra; Escape lo suelta.
    if (typing) {
      e.stopPropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        t.blur()
      }
      return
    }
    e.preventDefault()
    e.stopPropagation()
    if (step > 0) setStep(step - 1)
    else finish()
  }

  return (
    <div className="onboarding" data-nav-scope data-no-screensaver onKeyDown={onKeyDown}>
      <div ref={boxRef} className="ob-box" role="dialog" aria-modal="true" aria-labelledby="ob-title">
        <ol className="ob-steps" aria-label={`Paso ${step + 1} de ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'active' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
              <span className="ob-dot" aria-hidden>
                {i < step ? '✓' : i + 1}
              </span>
              <span className="ob-step-label">{s}</span>
            </li>
          ))}
        </ol>
        <div className="ob-body">
          {step === 0 && <LanguagesStep />}
          {step === 1 && <AddonStep />}
          {step === 2 && <TmdbStep />}
          {step === 3 && <DoneStep />}
        </div>
        <div className="ob-actions">
          {!last && (
            <button type="button" className="btn btn-ghost ob-skip" onClick={finish}>
              Saltar asistente
            </button>
          )}
          <span className="spacer" />
          {step > 0 && (
            <button type="button" className="btn" onClick={() => setStep(step - 1)}>
              Atrás
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={last ? finish : () => setStep(step + 1)}>
            {last ? 'Empezar' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  )
}
