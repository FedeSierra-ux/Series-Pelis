import { useEffect, useRef, useState } from 'react'
import { stremioAddonCollection, stremioLibrary, stremioLogin, stremioLogout } from '../../lib/stremioApi'
import { mergeWatchlist, parseStremioJson, planImport, type ImportPlan, type StremioData } from '../../lib/stremioLibrary'
import { addInstalledAddons, addonsStore, importProgress, progressStore, watchlistStore } from '../../lib/store'
import { errorText } from '../../lib/errors'
import { addonName } from '../../lib/addons'

type Mode = 'login' | 'authKey' | 'json'

const MODES: { id: Mode; label: string }[] = [
  { id: 'login', label: 'Email y contraseña' },
  { id: 'authKey', label: 'Clave de sesión' },
  { id: 'json', label: 'Pegar JSON' },
]

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function currentData() {
  return { addons: addonsStore.get(), progress: progressStore.get(), watchlist: watchlistStore.get() }
}

/** "Importar desde Stremio": addons, biblioteca (→ Mi lista) e historial con progreso. */
export function StremioImport() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authKey, setAuthKey] = useState('')
  const [json, setJson] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<string>()
  const [data, setData] = useState<StremioData>()
  const [plan, setPlan] = useState<ImportPlan>()
  const [pick, setPick] = useState({ addons: true, watchlist: true, progress: true })
  // La sesión que abrimos para importar: solo en memoria, se cierra al terminar.
  const session = useRef<string>(undefined)

  useEffect(
    () => () => {
      if (session.current) stremioLogout(session.current)
      session.current = undefined
    },
    [],
  )

  const closeSession = () => {
    if (session.current) stremioLogout(session.current)
    session.current = undefined
  }

  const fetchAccount = async (key: string) => {
    const [addons, library] = await Promise.all([stremioAddonCollection(key), stremioLibrary(key)])
    return { addons, library }
  }

  const preview = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(undefined)
    setDone(undefined)
    try {
      let next: StremioData
      if (mode === 'json') {
        let raw: unknown
        try {
          raw = JSON.parse(json)
        } catch {
          throw new Error('Eso no es un JSON válido.')
        }
        next = parseStremioJson(raw)
      } else if (mode === 'authKey') {
        // Clave pegada por el usuario: es su sesión, no la cerramos.
        next = await fetchAccount(authKey.trim())
        setAuthKey('')
      } else {
        const pass = password
        setPassword('')
        closeSession()
        session.current = await stremioLogin(email.trim(), pass)
        next = await fetchAccount(session.current)
        // Ya tenemos todo: la sesión no hace falta más.
        closeSession()
      }
      setData(next)
      setPlan(planImport(next, currentData()))
    } catch (err) {
      closeSession()
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    if (!data || !plan) return
    // Se recalcula contra lo de ahora por si algo cambió mientras mirabas la vista previa.
    const fresh = planImport(data, currentData())
    const parts: string[] = []
    if (pick.addons && fresh.addons.fresh.length) {
      addInstalledAddons(fresh.addons.fresh)
      parts.push(plural(fresh.addons.fresh.length, 'addon', 'addons'))
    }
    if (pick.watchlist) {
      const { result, added } = mergeWatchlist(watchlistStore.get(), fresh.watchlist.items)
      if (added) {
        watchlistStore.set(result)
        parts.push(`${plural(added, 'título', 'títulos')} a Mi lista`)
      }
    }
    if (pick.progress) {
      // Mezcla por fecha y anota en el diario lo terminado (auditoría #8: antes Diario y "Tu año" quedaban vacíos).
      const changed = importProgress(fresh.progress.entries)
      if (changed) parts.push(`${plural(changed, 'entrada', 'entradas')} de historial y progreso`)
    }
    setDone(parts.length ? `✓ Listo: se importaron ${parts.join(', ')}.` : 'No había nada nuevo para importar.')
    setData(undefined)
    setPlan(undefined)
    setEmail('')
    setJson('')
  }

  const cancel = () => {
    setData(undefined)
    setPlan(undefined)
  }

  const canSubmit = mode === 'login' ? !!email.trim() && !!password : mode === 'authKey' ? !!authKey.trim() : !!json.trim()

  return (
    <section className="settings-section stremio-import">
      <h2>Importar desde Stremio</h2>
      <p className="muted">
        Trae tus addons, tu biblioteca (va a Mi lista) y lo que viste con su progreso. No pisa lo que ya tenés acá, salvo
        que lo de Stremio sea más reciente. La contraseña no se guarda: se usa una sola vez para pedir los datos y la sesión
        se cierra enseguida.
      </p>

      {!plan && (
        <>
          <div className="tabs stremio-import-tabs" role="tablist" aria-label="Cómo importar">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                className={`tab${mode === m.id ? ' active' : ''}`}
                onClick={() => {
                  setMode(m.id)
                  setError(undefined)
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <form className="stremio-import-form" onSubmit={preview}>
            {mode === 'login' && (
              <>
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="Email de Stremio"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label="Email de Stremio"
                />
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-label="Contraseña de Stremio"
                />
                <p className="muted small">¿Entrás con Facebook o Google? Usá “Clave de sesión”.</p>
              </>
            )}
            {mode === 'authKey' && (
              <>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="authKey"
                  value={authKey}
                  onChange={(e) => setAuthKey(e.target.value)}
                  aria-label="Clave de sesión de Stremio (authKey)"
                />
                <p className="muted small">
                  Con la sesión iniciada en <a href="https://web.stremio.com" target="_blank" rel="noreferrer">web.stremio.com</a>,
                  abrí la consola del navegador (F12) y escribí <code>JSON.parse(localStorage.profile).auth.key</code>. No se
                  guarda.
                </p>
              </>
            )}
            {mode === 'json' && (
              <>
                <textarea
                  rows={5}
                  placeholder='{"result": [ … ]}'
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  aria-label="JSON exportado de Stremio"
                />
                <p className="muted small">
                  Sirve la respuesta de <code>datastoreGet</code> (biblioteca) o de <code>addonCollectionGet</code> (addons) de
                  la API de Stremio, o una lista de addons o de ítems de la biblioteca.
                </p>
              </>
            )}
            <div>
              <button className="btn btn-primary" disabled={busy || !canSubmit}>
                {busy ? 'Consultando…' : 'Ver qué se importa'}
              </button>
            </div>
          </form>
        </>
      )}

      {error && <p className="error-text" role="alert">{error}</p>}
      {done && <p className="ok" role="status">{done}</p>}

      {plan && (
        <div className="stremio-import-preview" role="region" aria-label="Vista previa de la importación">
          <p className="stremio-import-summary">
            <strong>{plural(plan.addons.total, 'addon', 'addons')}</strong>,{' '}
            <strong>{plural(plan.watchlist.total, 'título', 'títulos')}</strong> en tu biblioteca,{' '}
            <strong>{plan.progress.total}</strong> con progreso.
          </p>
          <label className="check">
            <input type="checkbox" checked={pick.addons} onChange={(e) => setPick((p) => ({ ...p, addons: e.target.checked }))} />
            <span>
              Addons <span className="muted small">· {plan.addons.fresh.length} nuevos{plan.addons.skipped > 0 ? `, ${plan.addons.skipped} no compatibles` : ''}</span>
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={pick.watchlist} onChange={(e) => setPick((p) => ({ ...p, watchlist: e.target.checked }))} />
            <span>
              Biblioteca → Mi lista <span className="muted small">· {plan.watchlist.fresh} nuevos</span>
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={pick.progress} onChange={(e) => setPick((p) => ({ ...p, progress: e.target.checked }))} />
            <span>
              Historial y progreso <span className="muted small">· {plan.progress.fresh} nuevos o más recientes</span>
            </span>
          </label>
          {plan.addons.fresh.length > 0 && pick.addons && (
            <p className="muted small">Addons nuevos: {plan.addons.fresh.map((a) => addonName(a.manifest)).join(', ')}</p>
          )}
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={apply} disabled={!pick.addons && !pick.watchlist && !pick.progress}>
              Importar
            </button>
            <button className="btn" onClick={cancel}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
