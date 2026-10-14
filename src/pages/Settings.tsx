import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Advanced } from '../components/Advanced'
import { AddonUrlForm } from '../components/AddonUrlForm'
import { CINEMETA_URL } from '../lib/addons'
import { clearCache } from '../lib/cache'
import { useAddons, useTitle } from '../lib/hooks'
import {
  exportData,
  importData,
  moveAddon,
  removeAddon,
  setAddonEnabled,
  settingsStore,
  useStore,
} from '../lib/store'
import { AddonExplorer } from './settings/AddonExplorer'
import { PlayerSettings } from './settings/PlayerSettings'
import { PosterSettings } from './settings/PosterSettings'
import { SourceSettings } from './settings/SourceSettings'
import { TasteSettings } from './settings/TasteSettings'
import { StremioImport } from './settings/StremioImport'
import { TmdbSettings } from './settings/TmdbSettings'
import { TvSettings } from './settings/TvSettings'
import { errorText } from '../lib/errors'

const DEFAULT_SERVER = 'http://127.0.0.1:11470'

function AddonsSection() {
  const addons = useAddons()
  return (
    <section className="settings-section">
      <h2>Addons de Stremio</h2>
      <p className="muted">
        Pegá la URL del manifest de cada addon que usás en Stremio (termina en <code>/manifest.json</code>, también sirve el
        enlace <code>stremio://</code>). Si un addon usa tu cuenta de Real-Debrid o TorBox, la URL ya incluye esa configuración.
      </p>
      <AddonUrlForm />

      <ul className="addon-list">
        {addons.map((a, i) => {
          const m = a.manifest
          const resources = m.resources.map((r) => (typeof r === 'string' ? r : r.name))
          const configurable = m.behaviorHints?.configurable
          return (
            <li key={a.transportUrl} className={`addon-item${a.disabled ? ' addon-off' : ''}`}>
              {m.logo ? <img src={m.logo} alt="" className="addon-logo" /> : <div className="addon-logo placeholder">{m.name[0]}</div>}
              <div className="addon-text">
                <strong>
                  {m.name} <span className="muted small">v{m.version}</span>
                  {a.disabled && <span className="chip small">Desactivado</span>}
                </strong>
                {m.description && <span className="muted small addon-desc">{m.description}</span>}
                <span className="chips">
                  {resources.map((r) => (
                    <span key={r} className="chip small">
                      {r === 'catalog' ? 'catálogos' : r === 'meta' ? 'info' : r === 'stream' ? 'streams' : r === 'subtitles' ? 'subtítulos' : r}
                    </span>
                  ))}
                </span>
              </div>
              <div className="addon-actions">
                <button
                  className={`btn btn-ghost addon-switch${a.disabled ? '' : ' on'}`}
                  role="switch"
                  aria-checked={!a.disabled}
                  aria-label={`${a.disabled ? 'Activar' : 'Desactivar'} ${m.name}`}
                  title={a.disabled ? 'Desactivado: no se consulta' : 'Activo'}
                  onClick={() => setAddonEnabled(a.transportUrl, !!a.disabled)}
                >
                  <span className="addon-switch-track" aria-hidden />
                  {a.disabled ? 'Apagado' : 'Activo'}
                </button>
                <button className="btn btn-ghost" disabled={i === 0} onClick={() => moveAddon(a.transportUrl, -1)} aria-label="Subir">
                  ↑
                </button>
                <button className="btn btn-ghost" disabled={i === addons.length - 1} onClick={() => moveAddon(a.transportUrl, 1)} aria-label="Bajar">
                  ↓
                </button>
                {configurable && (
                  <a className="btn btn-ghost" href={a.transportUrl.replace(/manifest\.json.*$/, 'configure')} target="_blank" rel="noreferrer">
                    Configurar
                  </a>
                )}
                <button
                  className="btn btn-ghost danger"
                  onClick={() => {
                    const warn = a.transportUrl === CINEMETA_URL ? '\nCinemeta da el catálogo y los puntajes de IMDb.' : ''
                    if (confirm(`¿Quitar “${m.name}”?${warn}`)) removeAddon(a.transportUrl)
                  }}
                >
                  Quitar
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="muted small">
        El orden importa: los catálogos y los streams se muestran en este orden. Un addon apagado sigue instalado pero no
        se consulta para catálogos, streams ni subtítulos.
      </p>
      <div className="hero-actions">
        <Link className="btn addon-catalogs-link" to="/settings/catalogs">
          Gestionar catálogos
        </Link>
        <span className="muted small">Renombrar, ocultar, ordenar o juntar las filas de Inicio.</span>
      </div>
      <AddonExplorer />
    </section>
  )
}

function PlaybackSection() {
  const settings = useStore(settingsStore)
  const [test, setTest] = useState<string>()

  const testServer = async () => {
    const server = settings.streamingServerUrl || DEFAULT_SERVER
    setTest('Probando…')
    try {
      const res = await fetch(`${server.replace(/\/+$/, '')}/settings`, { signal: AbortSignal.timeout(4000) })
      setTest(res.ok ? '✓ Conectado al servidor de Stremio' : `Respondió ${res.status}`)
      if (res.ok && !settings.streamingServerUrl) settingsStore.set((s) => ({ ...s, streamingServerUrl: server }))
    } catch {
      setTest('No responde. ¿Está Stremio abierto en esta PC?')
    }
  }


  return (
    <section className="settings-section">
      <h2>Reproducción</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={settings.autoplayNext}
          onChange={(e) => settingsStore.set((s) => ({ ...s, autoplayNext: e.target.checked }))}
        />
        Pasar solo al siguiente episodio (usa la misma fuente si el addon lo permite)
      </label>


      <Advanced>
      <h3>Servidor de streaming de Stremio (opcional, experimental)</h3>
      <p className="muted">
        Solo en la PC: si tenés Stremio abierto, la app puede usar su servidor local para reproducir torrents sin debrid.
        En el celular y la TV usá addons con Real-Debrid o TorBox.
      </p>
      <div className="inline-form">
        <input
          type="url"
          placeholder={DEFAULT_SERVER}
          value={settings.streamingServerUrl}
          onChange={(e) => settingsStore.set((s) => ({ ...s, streamingServerUrl: e.target.value.trim() }))}
          aria-label="URL del servidor de streaming"
        />
        <button className="btn" onClick={testServer}>
          Probar
        </button>
      </div>
      {test && <p className="muted">{test}</p>}
      </Advanced>
    </section>
  )
}

function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string>()

  const download = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `series-pelis-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const upload = async (file: File) => {
    try {
      await importData(JSON.parse(await file.text()))
      setMsg('✓ Datos importados')
    } catch (err) {
      setMsg(`No se pudo importar: ${errorText(err)}`)
    }
  }

  return (
    <section className="settings-section">
      <h2>Tus datos</h2>
      <p className="muted">
        Por ahora el historial, “Mi lista” y los addons se guardan en este navegador. Con una copia los pasás a otro
        dispositivo. La sincronización automática llega en la próxima versión.
      </p>
      <div className="hero-actions">
        <button className="btn" onClick={download}>
          Descargar copia
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Importar copia
        </button>
        <button
          className="btn"
          data-advanced
          onClick={async () => {
            await clearCache()
            setMsg('✓ Caché de catálogos borrada')
          }}
        >
          Borrar caché de catálogos
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            // Se vacía para que elegir el mismo archivo dos veces seguidas vuelva a importar.
            e.target.value = ''
            if (file) upload(file)
          }}
        />
      </div>
      {msg && <p className="muted">{msg}</p>}
    </section>
  )
}

export function Settings() {
  useTitle('Ajustes')
  const { showAdvanced } = useStore(settingsStore)
  return (
    <div className={`page settings${showAdvanced ? ' show-advanced' : ''}`}>
      <header className="page-header">
        <h1>Ajustes</h1>
        <span className="muted small">Versión {__APP_VERSION__}</span>
      </header>
      <label className="check settings-advanced-toggle">
        <input type="checkbox" checked={showAdvanced} onChange={(e) => settingsStore.set((s) => ({ ...s, showAdvanced: e.target.checked }))} />
        Mostrar opciones avanzadas
      </label>
      <AddonsSection />
      <StremioImport />
      <TmdbSettings />
      <PosterSettings />
      <PlaybackSection />
      <PlayerSettings />
      <SourceSettings />
      <TasteSettings />
      <TvSettings />
      <DataSection />
    </div>
  )
}
