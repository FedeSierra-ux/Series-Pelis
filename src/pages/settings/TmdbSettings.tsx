import { useState } from 'react'
import { KeyboardToggle } from '../../components/OnScreenKeyboard'
import { clearCache } from '../../lib/cache'
import { settingsStore, useStore } from '../../lib/store'
import { testTmdbKey, useServerTmdb } from '../../lib/tmdb'

export function TmdbSettings() {
  const settings = useStore(settingsStore)
  const [draft, setDraft] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>()
  const [busy, setBusy] = useState(false)
  const configured = settings.tmdbKey.trim().length > 0
  const fromSite = useServerTmdb()

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const key = draft.trim()
    if (!key) return
    setBusy(true)
    setMsg(undefined)
    const ok = await testTmdbKey(key)
    setBusy(false)
    if (!ok) {
      setMsg({ ok: false, text: 'TMDB rechazó la key. Revisá que sea la "API Key" o el "API Read Access Token".' })
      return
    }
    settingsStore.set((s) => ({ ...s, tmdbKey: key }))
    setDraft('')
    setMsg({ ok: true, text: '✓ Key guardada. Las fichas ya se ven en español.' })
  }

  const remove = async () => {
    if (!confirm(fromSite ? '¿Quitar tu key de TMDB? Se vuelve a usar la del sitio.' : '¿Quitar la key de TMDB? La app vuelve a usar solo Cinemeta.')) return
    settingsStore.set((s) => ({ ...s, tmdbKey: '' }))
    await clearCache()
    setMsg({ ok: true, text: 'Key quitada.' })
  }

  return (
    <section className="settings-section">
      <h2>TMDB (español, reparto y más)</h2>
      <p className="muted">
        Con una key gratuita de <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">TMDB</a> las
        fichas se ven en español latino y se suman reparto, sagas, “Más como esto”, tendencias, tráileres y dónde ver cada
        título en Argentina. Sirve la “API Key” o el “API Read Access Token”. Se guarda solo en este navegador (y en la copia
        de seguridad).
      </p>
      {fromSite && !configured && (
        <p className="ok">✓ TMDB activado por el sitio: no hace falta cargar nada. Si querés, podés usar una key tuya.</p>
      )}
      {configured ? (
        <div className="inline-form">
          <span className="ok">✓ Key configurada (…{settings.tmdbKey.trim().slice(-4)})</span>
          <button className="btn btn-ghost danger" onClick={remove}>
            Quitar
          </button>
        </div>
      ) : (
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
      )}
      {!configured && <KeyboardToggle value={draft} onChange={setDraft} onDone={() => save()} doneLabel="Guardar" label="Teclado para la key de TMDB" />}
      {msg && <p className={msg.ok ? 'ok' : 'error-text'}>{msg.text}</p>}
      <p className="muted small">Datos e imágenes de TMDB. “Dónde ver” usa datos de JustWatch.</p>
    </section>
  )
}
