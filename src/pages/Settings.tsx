import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Advanced } from '../components/Advanced'
import { AddonUrlForm } from '../components/AddonUrlForm'
import { addonName, CINEMETA_URL } from '../lib/addons'
import { fetchWithTimeout } from '../lib/abort'
import { clearCache } from '../lib/cache'
import { useAddons, useTitle } from '../lib/hooks'
import { resourceLabel } from '../lib/i18n'
import { UndoToast, useUndoToast } from '../components/UndoToast'
import {
  clearHistory,
  exportData,
  importData,
  moveAddon,
  removeAddon,
  resetSettings,
  restoreAddon,
  restoreHistory,
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
import { ShortcutsSettings } from './settings/ShortcutsSettings'
import { AppSettings, showAppSettings } from './settings/AppSettings'
import { DiagnosticsSettings } from './settings/DiagnosticsSettings'
import { useReportsEnabled } from '../lib/diagnostics'
import { useAuth, useCanEditAddons } from '../lib/auth'
import { HouseSettings } from './settings/HouseSettings'
import { HousesSettings } from './settings/HousesSettings'
import { SettingsBlock, SettingsIndex, WIDE_QUERY, goToSection, useActiveSection, useMediaQuery, type SettingsSectionDef } from './settings/SettingsLayout'
import { importErrorText } from '../lib/errors'
import { isNativeApp } from '../lib/native'
import { useTorrentEngine } from '../lib/torrentServer'
import { ensureLocalStremio, useLocalStremio } from '../lib/stremioServer'
import { DESKTOP_DOWNLOAD_URL, desktopTorrentBase } from '../lib/desktop'
import './settings/settings-layout.css'

const DEFAULT_SERVER = 'http://127.0.0.1:11470'

/** Solo el dominio de cada addon: la URL completa puede traer la key del debrid y es larguísima. */
function hostList(urls: string[]): string {
  const hosts = urls.map((u) => {
    try {
      return new URL(u).host
    } catch {
      return u.slice(0, 40)
    }
  })
  return hosts.join(', ')
}

/** Con login, quien no es el administrador ve los addons pero no los cambia (son iguales en todas las casas). */
function AddonsReadOnly() {
  const addons = useAddons()
  return (
    <section className="settings-section">
      <h2>Addons de Stremio</h2>
      <p className="muted">Los addons los maneja el administrador y son los mismos en todas las casas. Si cambia algo, llega solo.</p>
      <ul className="addon-list">
        {addons.map((a) => {
          const name = addonName(a.manifest)
          return (
            <li key={a.transportUrl} className={`addon-item${a.disabled ? ' addon-off' : ''}`}>
              {a.manifest.logo ? <img src={a.manifest.logo} alt="" className="addon-logo" /> : <div className="addon-logo placeholder">{name[0]}</div>}
              <div className="addon-text">
                <strong>
                  {name} <span className="muted small">v{a.manifest.version}</span>
                  {a.disabled && <span className="chip small">Desactivado</span>}
                </strong>
                {a.manifest.description && <span className="muted small addon-desc">{a.manifest.description}</span>}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="hero-actions">
        <Link className="btn addon-catalogs-link" to="/settings/catalogs">
          Gestionar catálogos
        </Link>
        <span className="muted small">Renombrar, ocultar, ordenar o juntar las filas de Inicio.</span>
      </div>
    </section>
  )
}

function AddonsSection() {
  const addons = useAddons()
  // "Quitar" no pregunta: avisa y deja "Deshacer" (uso-07; el historial hace lo mismo).
  const undo = useUndoToast()
  if (!useCanEditAddons()) return <AddonsReadOnly />
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
          const name = addonName(m)
          const resources = (m.resources ?? []).map((r) => (typeof r === 'string' ? r : r.name))
          const configurable = m.behaviorHints?.configurable
          return (
            <li key={a.transportUrl} className={`addon-item${a.disabled ? ' addon-off' : ''}`}>
              {m.logo ? <img src={m.logo} alt="" className="addon-logo" /> : <div className="addon-logo placeholder">{name[0]}</div>}
              <div className="addon-text">
                <strong>
                  {name} <span className="muted small">v{m.version}</span>
                  {a.disabled && <span className="chip small">Desactivado</span>}
                </strong>
                {m.description && <span className="muted small addon-desc">{m.description}</span>}
                <span className="chips">
                  {resources.map((r) => (
                    <span key={r} className="chip small">
                      {resourceLabel(r)}
                    </span>
                  ))}
                </span>
              </div>
              <div className="addon-actions">
                <button
                  className={`btn btn-ghost addon-switch${a.disabled ? '' : ' on'}`}
                  role="switch"
                  aria-checked={!a.disabled}
                  aria-label={`${a.disabled ? 'Activar' : 'Desactivar'} ${name}`}
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
                    const removed = removeAddon(a.transportUrl)
                    if (removed) undo.show(`Se quitó “${name}”`, () => restoreAddon(removed), a.transportUrl === CINEMETA_URL ? 'Cinemeta da el catálogo y los puntajes de IMDb' : undefined)
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
      <UndoToast api={undo} />
    </section>
  )
}

function PlaybackSection() {
  const settings = useStore(settingsStore)
  const [test, setTest] = useState<string>()
  // App de Android con motor de torrents propio (v0.25): el servidor de Stremio pasa a ser opcional.
  const engine = useTorrentEngine()
  // PC (v0.29): Stremio Service se busca solo al abrir torrents (acá solo se muestra; "Probar" lo busca).
  const local = useLocalStremio()
  // App de Windows (v0.30): trae su motor.
  const desktop = !!desktopTorrentBase()

  const testServer = async () => {
    const server = settings.streamingServerUrl || DEFAULT_SERVER
    setTest('Probando…')
    try {
      // Sin `AbortSignal.timeout`: en las TVs viejas no existe y siempre decía "No responde" (auditoría #9).
      const res = await fetchWithTimeout(`${server.replace(/\/+$/, '')}/settings`, { timeoutMs: 4000 })
      setTest(res.ok ? '✓ Conectado al servidor de Stremio' : `Respondió ${res.status}`)
      // Con el motor de la app no se guarda solo: una dirección puesta le ganaría al motor. En la PC tampoco: Stremio
      // Service se encuentra solo (v0.29).
      if (res.ok && !settings.streamingServerUrl && !engine && !desktop && local === 'off') settingsStore.set((s) => ({ ...s, streamingServerUrl: server }))
      if (res.ok && local !== 'off') void ensureLocalStremio(true)
    } catch {
      setTest('No responde. ¿Está Stremio abierto en esta compu?')
    }
  }


  return (
    <section className="settings-section">
      <h2>Siguiente episodio</h2>
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
      {engine ? (
        <p className="muted">
          En la app de Android los torrents se reproducen solos con el motor integrado; este campo es opcional. Si ponés una
          dirección, se usa esa en vez del motor.
          {!settings.nativePlayer && ' El motor necesita el reproductor de Android (Ajustes → Reproductor).'}
        </p>
      ) : desktop ? (
        <p className="muted">
          En la app de Windows los torrents se reproducen solos con el motor integrado, y lo que Chromium no puede (AC3,
          DTS, 5.1) se convierte. Este campo es opcional: si ponés una dirección, se usa esa en vez del motor.
        </p>
      ) : local !== 'off' ? (
        <p className="muted">
          En el navegador los torrents van por TorBox. Con <a href={DESKTOP_DOWNLOAD_URL}>Flix para Windows</a> se
          reproducen directo, sin debrid y sin instalar nada más.
          {local === 'found' && ' ✓ Stremio Service está abierto en esta compu: los torrents también van por ahí.'} Este
          campo es solo para usar otro servidor.
        </p>
      ) : (
        <p className="muted">
          Solo en la PC: si tenés Stremio abierto, la app puede usar su servidor local para reproducir torrents sin debrid.
          En el celular y la TV usá addons con Real-Debrid o TorBox.
        </p>
      )}
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

/** Lo que se confirma en "Tus datos" antes de borrar (la confirmación va en la página, no en un cuadro del navegador). */
type DataAction = 'history' | 'settings'

function DataSection() {
  const inHouse = useAuth().status === 'in'
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string>()
  const [asking, setAsking] = useState<DataAction>()
  const undo = useUndoToast()
  // Al abrir la confirmación el foco va a "Cancelar" (lo seguro); al cerrarla vuelve al botón que la abrió.
  const cancelRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (asking) cancelRef.current?.focus()
  }, [asking])
  const closeAsk = (restoreFocus = true) => {
    setAsking(undefined)
    if (restoreFocus) requestAnimationFrame(() => openerRef.current?.focus())
  }
  const ask = (what: DataAction, button: HTMLButtonElement) => {
    openerRef.current = button
    setAsking(what)
  }
  const confirmAsk = () => {
    if (asking === 'history') {
      const removed = clearHistory()
      undo.show('Historial borrado', () => restoreHistory(removed))
    } else if (asking === 'settings') {
      const before = resetSettings()
      undo.show('Ajustes restablecidos', () => settingsStore.set(before))
    }
    closeAsk()
  }

  const download = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `flix-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const upload = async (file: File) => {
    setMsg('Importando…')
    try {
      const report = await importData(JSON.parse(await file.text()))
      const notes: string[] = []
      // Auditoría #10: antes un addon que no respondía justo en ese momento se perdía sin aviso.
      if (report.offlineAddons.length) {
        notes.push(`${hostList(report.offlineAddons)} no ${report.offlineAddons.length === 1 ? 'respondió' : 'respondieron'}: se ${report.offlineAddons.length === 1 ? 'agregó' : 'agregaron'} con los datos de la copia.`)
      }
      if (report.failedAddons.length) {
        notes.push(`No se pudieron agregar ${hostList(report.failedAddons)} (no ${report.failedAddons.length === 1 ? 'respondió' : 'respondieron'}). Volvé a importar la copia más tarde o pegá su URL en Addons.`)
      }
      setMsg(['✓ Datos importados.', ...notes].join(' '))
    } catch (err) {
      setMsg(`No se pudo importar: ${importErrorText(err)}`)
    }
  }

  return (
    <section className="settings-section">
      <h2>Tus datos</h2>
      <p className="muted">
        {inHouse
          ? 'Tus datos se sincronizan con la casa (ver “Casa”). Igual podés bajar una copia para guardarla aparte.'
          : 'El historial, “Mi lista” y los addons se guardan en este navegador. Con una copia los pasás a otro aparato.'}
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
      {msg && <p className="muted" role="status">{msg}</p>}

      <h3>Empezar de cero</h3>
      <div className="hero-actions">
        <button type="button" className="btn" aria-expanded={asking === 'history'} onClick={(e) => ask('history', e.currentTarget)}>
          Borrar historial
        </button>
        <button type="button" className="btn" aria-expanded={asking === 'settings'} onClick={(e) => ask('settings', e.currentTarget)}>
          Restablecer ajustes
        </button>
      </div>
      {asking && (
        <div
          className="data-confirm"
          role="group"
          aria-labelledby="data-confirm-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              closeAsk()
            }
          }}
        >
          <p id="data-confirm-title">
            <strong>{asking === 'history' ? '¿Borrar el historial de este perfil?' : '¿Volver los ajustes a los valores de fábrica?'}</strong>
          </p>
          <p className="muted small">
            {asking === 'history'
              ? `Se vacían el historial, “Seguir viendo” y “Tu año” de este perfil. “Mi lista”, las estrellas y los addons quedan.${inHouse ? ' También se borra en los otros aparatos de la casa.' : ''}`
              : `No se tocan los addons, la key de TMDB, tu sesión ni el historial.${inHouse ? ' Los idiomas, los subtítulos y las reglas de fuentes son de toda la casa: se restablecen para todos.' : ''}`}
          </p>
          <div className="hero-actions">
            <button type="button" className="btn danger" onClick={confirmAsk}>
              {asking === 'history' ? 'Sí, borrar historial' : 'Sí, restablecer'}
            </button>
            <button type="button" className="btn btn-ghost" ref={cancelRef} onClick={() => closeAsk()}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      <UndoToast api={undo} />
    </section>
  )
}

/**
 * Secciones de Ajustes, en el orden en que se ven. Es la única lista: de acá salen el índice
 * (PC/TV), los plegables (celular) y las anclas `#id`. Para agregar una sección nueva alcanza con
 * una línea acá; el `id` es el ancla y `title` lo que dice el índice.
 */
const ALL_SECTIONS: SettingsSectionDef[] = [
  { id: 'house', title: 'Casa', element: <HouseSettings /> },
  { id: 'houses', title: 'Casas', element: <HousesSettings /> },
  { id: 'addons', title: 'Addons de Stremio', element: <AddonsSection /> },
  { id: 'stremio', title: 'Importar desde Stremio', element: <StremioImport /> },
  { id: 'tmdb', title: 'TMDB', element: <TmdbSettings /> },
  { id: 'posters', title: 'Pósters', element: <PosterSettings /> },
  { id: 'playback', title: 'Siguiente episodio', element: <PlaybackSection /> },
  { id: 'player', title: 'Reproductor', element: <PlayerSettings /> },
  { id: 'sources', title: 'Elección de fuente', element: <SourceSettings /> },
  { id: 'taste', title: 'Gustos y spoilers', element: <TasteSettings /> },
  { id: 'tv', title: 'Pantalla y control remoto', element: <TvSettings /> },
  { id: 'app', title: isNativeApp() ? 'App de TV' : 'App de Windows', element: <AppSettings /> },
  { id: 'shortcuts', title: 'Teclado y ayuda', element: <ShortcutsSettings /> },
  { id: 'data', title: 'Tus datos', element: <DataSection /> },
  { id: 'diagnostics', title: 'Diagnóstico', element: <DiagnosticsSettings /> },
]

export function Settings() {
  useTitle('Ajustes')
  const { showAdvanced } = useStore(settingsStore)
  const { hash } = useLocation()
  const wide = useMediaQuery(WIDE_QUERY)
  // "Diagnóstico" solo existe si el sitio publicado acepta informes (si no, la sección no dibuja nada).
  const reports = useReportsEnabled()
  // "Casa" solo con login; "Casas", solo para el administrador.
  const auth = useAuth()
  const inHouse = auth.status === 'in'
  const isAdmin = inHouse && auth.house.isAdmin
  const SECTIONS = useMemo(
    () =>
      ALL_SECTIONS.filter((s) => {
        if (s.id === 'diagnostics') return reports
        if (s.id === 'house') return inHouse
        if (s.id === 'houses') return isAdmin
        if (s.id === 'app') return showAppSettings()
        return true
      }),
    [reports, inHouse, isAdmin],
  )
  const SECTION_IDS = useMemo(() => SECTIONS.map((s) => s.id), [SECTIONS])
  const [active, setActive] = useActiveSection(SECTION_IDS, wide)

  // `/settings#tmdb` abre y muestra esa sección (sirve para enlazar desde otras pantallas).
  useEffect(() => {
    const id = hash.slice(1)
    if (id && SECTION_IDS.includes(id)) goToSection(id, false)
  }, [hash])

  return (
    <div className={`page settings settings-page${showAdvanced ? ' show-advanced' : ''}`}>
      <header className="page-header">
        <h1>Ajustes</h1>
        <span className="muted small">Versión {__APP_VERSION__}</span>
      </header>
      <div className="settings-layout">
        <SettingsIndex
          sections={SECTIONS}
          active={active}
          onSelect={(id, focusFirst) => {
            setActive(id)
            goToSection(id, focusFirst)
          }}
        />
        <div className="settings-content">
          <label className="check settings-advanced-toggle">
            <input type="checkbox" checked={showAdvanced} onChange={(e) => settingsStore.set((s) => ({ ...s, showAdvanced: e.target.checked }))} />
            Mostrar opciones avanzadas
          </label>
          {SECTIONS.map((s) => (
            <SettingsBlock key={s.id} id={s.id} title={s.title} wide={wide}>
              {s.element}
            </SettingsBlock>
          ))}
        </div>
      </div>
    </div>
  )
}
