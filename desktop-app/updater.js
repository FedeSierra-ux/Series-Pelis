// @ts-check
// Actualizaciones de la app de Windows con electron-updater, desde GitHub Releases (el mismo Release `flix-vX.Y.Z`
// que el APK de la TV). La dirección está en electron-builder.yml (`publish`, proveedor genérico):
//   https://github.com/FedeSierra-ux/Series-Pelis/releases/latest/download/latest.yml
// Mismo trato que el APK (v0.21): la web pregunta con `check`, muestra el aviso y el usuario toca "Instalar".
// Nada se baja solo. Con la versión de fábrica de `check` (sin `force`) se usa lo averiguado en las últimas 6 h.
//
// Sin firma de código: Windows SmartScreen avisa la primera vez ("Windows protegió tu PC" → "Más información" →
// "Ejecutar de todos modos"). La actualización se verifica con el sha512 de latest.yml (bajado por https de GitHub);
// no hay `publisherName`, así que electron-updater no pide firma.
import { app } from 'electron'
import electronUpdater from 'electron-updater'
import { updateErrorText } from './update-errors.js'

const { autoUpdater } = electronUpdater

const CACHE_OK_MS = 6 * 60 * 60 * 1000
const CACHE_FAIL_MS = 15 * 60 * 1000

/** @typedef {{ available: boolean, current: string, latest?: string, notes?: string, size?: number, error?: string }} UpdateInfo */
/** @typedef {{ state: 'downloading', progress: number } | { state: 'installer' } | { state: 'error', message: string }} UpdateEvent */

/**
 * @param {{
 *   log: import('./log.js').Logger,
 *   emit: (e: UpdateEvent) => void,
 *   beforeInstall: () => Promise<void>,
 * }} opts
 */
export function createUpdater({ log, emit, beforeInstall }) {
  const current = app.getVersion()
  /** @type {{ at: number, info: UpdateInfo } | null} */
  let last = null
  /** @type {Promise<UpdateInfo> | null} */
  let checking = null
  /** @type {Promise<void> | null} */
  let installing = null

  autoUpdater.logger = log
  autoUpdater.autoDownload = false
  // Si el instalador no llegara a abrirse después de bajarla, se instala al cerrar la app.
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  // Sin esto, un 'error' sin escuchar tira la app abajo (EventEmitter). Los errores se informan donde se piden.
  autoUpdater.on('error', (err) => log.warn('updater:', err instanceof Error ? err.message : err))

  let lastProgress = -1
  autoUpdater.on('download-progress', (p) => {
    const progress = Math.max(0, Math.min(1, (p.percent || 0) / 100))
    // Un aviso cada 1 % alcanza para la barra.
    if (Math.floor(progress * 100) === lastProgress) return
    lastProgress = Math.floor(progress * 100)
    emit({ state: 'downloading', progress })
  })

  /** @returns {Promise<UpdateInfo>} */
  async function fetchInfo() {
    if (!app.isPackaged) return { available: false, current, error: 'Las actualizaciones andan solo en la app instalada.' }
    try {
      const r = await autoUpdater.checkForUpdates()
      const info = r?.updateInfo
      if (!r || !info) return { available: false, current }
      const notes = notesText(info.releaseNotes)
      const size = info.files?.[0]?.size
      return {
        available: r.isUpdateAvailable === true,
        current,
        latest: info.version,
        ...(notes ? { notes } : {}),
        ...(typeof size === 'number' ? { size } : {}),
      }
    } catch (err) {
      log.warn('updater: no se pudo buscar', err)
      return { available: false, current, error: updateErrorText(err) }
    }
  }

  /**
   * @param {boolean} [force]
   * @returns {Promise<UpdateInfo>}
   */
  function check(force = false) {
    const fresh = last && Date.now() - last.at < (last.info.error ? CACHE_FAIL_MS : CACHE_OK_MS)
    if (last && (installing || (!force && fresh))) return Promise.resolve(last.info)
    checking ??= fetchInfo()
      .then((info) => {
        last = { at: Date.now(), info }
        return info
      })
      .finally(() => {
        checking = null
      })
    return checking
  }

  /** Baja la versión nueva (con avance por `emit`) y abre el instalador, que cierra la app y la vuelve a abrir. */
  function install() {
    installing ??= (async () => {
      try {
        if (!app.isPackaged) throw new UserError('Las actualizaciones andan solo en la app instalada.')
        // downloadUpdate() necesita un chequeo recién hecho.
        const info = await fetchInfo()
        last = { at: Date.now(), info }
        if (info.error) throw new UserError(info.error)
        if (!info.available) throw new UserError('Ya tenés la última versión.')
        lastProgress = -1
        emit({ state: 'downloading', progress: 0 })
        await autoUpdater.downloadUpdate()
        emit({ state: 'downloading', progress: 1 })
        emit({ state: 'installer' })
        await beforeInstall()
        // isSilent: el instalador es de un clic (por usuario), no hay nada que preguntar; isForceRunAfter: vuelve a
        // abrir Flix al terminar.
        autoUpdater.quitAndInstall(true, true)
      } catch (err) {
        if (!(err instanceof UserError)) log.warn('updater: falló la instalación', err)
        emit({ state: 'error', message: err instanceof UserError ? err.message : updateErrorText(err) })
      } finally {
        installing = null
      }
    })()
    return installing
  }

  return { check, install }
}

class UserError extends Error {}

/** @param {unknown} notes  string o lista de { version, note } */
function notesText(notes) {
  if (typeof notes === 'string') return notes.trim() || undefined
  if (Array.isArray(notes)) {
    const text = notes
      .map((n) => (n && typeof n === 'object' && 'note' in n && typeof n.note === 'string' ? n.note : ''))
      .filter(Boolean)
      .join('\n\n')
      .trim()
    return text || undefined
  }
  return undefined
}
