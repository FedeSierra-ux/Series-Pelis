import { useEffect, useState } from 'react'
import { checkAppUpdate, formatSize, installAppUpdate, useAppUpdate } from '../../lib/appUpdate'
import { desktopApp, DESKTOP_DOWNLOAD_URL } from '../../lib/desktop'
import { isNativeApp, nativeInfo, type NativeInfo } from '../../lib/native'
import { currentPlatform } from '../../lib/platform'

/** ¿Va la sección? En las apps (Android y Windows) y en el navegador de una compu con Windows (para bajarla). */
export function showAppSettings(): boolean {
  return isNativeApp() || !!desktopApp() || currentPlatform().os === 'windows'
}

/**
 * Ajustes → App de TV / App de Windows. En la app de Android (v0.21): versión, actualizaciones y filas del inicio de
 * la TV. En la de Windows (v0.30): versión y actualizaciones. En el navegador de Windows: dónde bajarla.
 */
export function AppSettings() {
  if (desktopApp()) return <DesktopAppSettings />
  if (isNativeApp()) return <TvAppSettings />
  return <DesktopDownload />
}

function DesktopDownload() {
  return (
    <section className="settings-section">
      <h2>App de Windows</h2>
      <p className="muted">
        Con Flix para Windows los torrents se reproducen directo, sin debrid y sin instalar nada más (trae su propio
        motor y convierte lo que el navegador no puede). Usa tu misma casa, perfiles e historial.
      </p>
      <div className="hero-actions">
        <a className="btn btn-primary" href={DESKTOP_DOWNLOAD_URL}>
          Bajar Flix para Windows
        </a>
      </div>
      <p className="muted small">
        Windows puede avisar que la app no es conocida (no está firmada): tocá “Más información” → “Ejecutar de todas
        formas”. Se actualiza sola.
      </p>
    </section>
  )
}

function DesktopAppSettings() {
  const app = desktopApp()
  const state = useAppUpdate()
  const latest = 'info' in state ? state.info?.latest : undefined
  const working = state.step === 'checking' || state.step === 'downloading' || state.step === 'installer'
  return (
    <section className="settings-section">
      <h2>App de Windows</h2>
      <p className="muted small">
        Versión instalada: {app?.version ?? '—'}
        {app && !app.torrent && ' · El motor de torrents no arrancó: cerrá Flix y abrilo de nuevo.'}
      </p>
      {app?.update && (
        <>
          <p className="small" role="status" aria-live="polite">
            {state.step === 'installer' ? 'Flix se cierra para instalar la versión nueva…' : statusText(state)}
          </p>
          {state.step === 'downloading' && <progress className="update-toast-progress" max={1} value={state.progress} aria-label="Descarga" />}
          <div className="hero-actions">
            {state.step === 'available' || (state.step === 'error' && 'info' in state && state.info?.available) ? (
              <button type="button" className="btn btn-primary" onClick={() => void installAppUpdate()}>
                {`Instalar la ${latest ?? 'nueva versión'}`}
              </button>
            ) : (
              <button type="button" className="btn" disabled={working} onClick={() => void checkAppUpdate(true)}>
                Buscar actualizaciones
              </button>
            )}
          </div>
          <p className="muted small">
            La app se fija sola al abrir. La versión nueva se baja de GitHub y se instala al cerrar Flix; no se pierde el
            login.
          </p>
        </>
      )}
    </section>
  )
}

function TvAppSettings() {
  const [info, setInfo] = useState<NativeInfo>()
  const state = useAppUpdate()

  useEffect(() => {
    let alive = true
    void nativeInfo().then((i) => alive && setInfo(i))
    return () => {
      alive = false
    }
  }, [])

  if (!info) return null
  const latest = 'info' in state ? state.info?.latest : undefined
  const working = state.step === 'checking' || state.step === 'downloading' || state.step === 'verifying'

  return (
    <section className="settings-section">
      <h2>App de TV</h2>
      <p className="muted small">Versión instalada: {info.version ?? '—'}</p>
      {info.update ? (
        <>
          <p className="small" role="status" aria-live="polite">
            {statusText(state)}
          </p>
          {state.step === 'downloading' && <progress className="update-toast-progress" max={1} value={state.progress} aria-label="Descarga" />}
          <div className="hero-actions">
            {state.step === 'available' || state.step === 'installer' || (state.step === 'error' && 'info' in state && state.info?.available) ? (
              <button type="button" className="btn btn-primary" onClick={() => void installAppUpdate()}>
                {state.step === 'installer' ? 'Abrir el instalador' : `Instalar la ${latest ?? 'nueva versión'}`}
              </button>
            ) : (
              <button type="button" className="btn" disabled={working} onClick={() => void checkAppUpdate(true)}>
                Buscar actualizaciones
              </button>
            )}
          </div>
          <p className="muted small">
            La app se fija sola al abrir (una vez cada 6 horas). La versión nueva se baja de GitHub, se revisa que sea
            nuestra y se abre el instalador de Android: ahí solo hay que tocar “Instalar”. No se pierde el login.
          </p>
        </>
      ) : (
        <p className="muted small">
          Esta versión de la app no se actualiza sola: bajá la última con Downloader una vez y después ya se actualiza
          desde acá.
        </p>
      )}
      <h3>Inicio de la TV</h3>
      <p className="muted small">
        {info.home
          ? '“Seguir viendo” aparece en la fila “A continuación” del inicio de Android TV. Muestra lo del perfil que se usó último en este aparato.'
          : info.fireTv
            ? 'Fire TV no deja que una app instalada por fuera de la tienda de Amazon aparezca en “Continuar viendo”.'
            : 'Este aparato no tiene filas de apps en el inicio.'}
      </p>
    </section>
  )
}

function statusText(state: ReturnType<typeof useAppUpdate>): string {
  switch (state.step) {
    case 'idle':
      return 'Todavía no se buscó una versión nueva.'
    case 'checking':
      return 'Buscando…'
    case 'none':
      return 'Tenés la última versión.'
    case 'available': {
      const size = formatSize(state.info.size)
      return `Hay una versión nueva: ${state.info.latest ?? ''}${size ? ` (${size})` : ''}.`
    }
    case 'downloading':
      return `Bajando… ${Math.round(state.progress * 100)} %`
    case 'verifying':
      return 'Revisando la descarga…'
    case 'permission':
      return 'Dale permiso a Flix para instalar apps y volvé: la actualización sigue sola.'
    case 'installer':
      return 'Se abrió el instalador: tocá “Instalar”.'
    case 'error':
      return state.message
  }
}
