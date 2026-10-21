// @ts-check
// App de Flix para Windows (v0.30): una ventana de Electron que abre el sitio (series-pelis.pages.dev) con el motor
// de torrents adentro (engine/, ver CONTRACT.md). La web decide todo; acá solo va lo que el navegador no da:
// `window.flixDesktop` (preload.cjs), el motor en 127.0.0.1 y las actualizaciones (updater.js).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { createLogger } from './log.js'
import { desktopUserAgent, engineOrigins, externalAction, originCheck, startUrl } from './origins.js'
import { createUpdater } from './updater.js'
import { DEFAULT_HEIGHT, DEFAULT_WIDTH, loadWindowState, trackWindowState } from './window-state.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

/** El color de fondo del sitio (`--bg` de theme2.css): sin destello blanco al abrir. */
const BG = '#0b0b10'
/** Cuánto esperamos al motor antes de abrir el sitio igual (sin torrents). */
const ENGINE_WAIT_MS = 10_000
const ENGINE_CLOSE_MS = 3_000

const START_URL = startUrl(process.env.FLIX_URL)
const isAllowed = originCheck(START_URL)

// El nombre fija la carpeta de datos (%APPDATA%\Flix): va antes de cualquier app.getPath().
const PACKAGE_NAME = app.getName()
app.setName('Flix')
if (process.platform === 'win32') app.setAppUserModelId('ar.flix.desktop')

// La página es https y el motor es http://127.0.0.1: sin esto, Local Network Access de Chrome pide permiso o
// bloquea los pedidos (en la web, la v0.29 lo resuelve con el permiso; acá el motor es nuestro).
app.commandLine.appendSwitch(
  'disable-features',
  'LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessRespectPreflightResults',
)

const log = createLogger(path.join(app.getPath('userData'), 'logs'))

if (!app.requestSingleInstanceLock()) {
  // Ya hay una abierta: esa recibe 'second-instance' y se pone adelante.
  app.quit()
} else {
  run()
}

function run() {
  /** @type {BrowserWindow | null} */
  let win = null
  /** @type {{ base: string, close(): Promise<void> } | null} */
  let engine = null
  const engineReady = startTorrentEngine().then((e) => {
    engine = e
    return e
  })

  let engineClosed = false
  const closeEngine = async () => {
    if (engineClosed) return
    engineClosed = true
    const e = await engineReady
    if (!e) return
    await Promise.race([e.close().catch((err) => log.warn('motor: no cerró bien', err)), delay(ENGINE_CLOSE_MS)])
  }

  const updater = createUpdater({
    log,
    emit: (ev) => {
      const wc = win && !win.isDestroyed() ? win.webContents : null
      if (wc && isAllowed(wc.getURL())) wc.send('flix:update-event', ev)
    },
    beforeInstall: closeEngine,
  })

  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })

  // Al salir se cierra el motor (borra la caché de torrents) antes de que se vaya el proceso.
  let quitReady = false
  app.on('before-quit', (e) => {
    if (quitReady) return
    e.preventDefault()
    closeEngine().finally(() => {
      quitReady = true
      app.quit()
    })
  })
  app.on('window-all-closed', () => app.quit())

  // IPC del preload. Solo contesta a la ventana principal con una página del sitio.
  /** @param {import('electron').IpcMainEvent | import('electron').IpcMainInvokeEvent} e */
  const fromSite = (e) => !!win && e.sender === win.webContents && !!e.senderFrame && e.senderFrame.parent === null && isAllowed(e.senderFrame.url)
  ipcMain.on('flix:info', (e) => {
    e.returnValue = fromSite(e) ? { version: app.getVersion(), ...(engine ? { torrent: engine.base } : {}) } : null
  })
  ipcMain.handle('flix:update-check', (e, force) => {
    if (!fromSite(e)) throw new Error('forbidden')
    return updater.check(force === true)
  })
  ipcMain.handle('flix:update-install', (e) => {
    if (!fromSite(e)) throw new Error('forbidden')
    return updater.install()
  })

  app.whenReady().then(async () => {
    setupSession()
    win = createWindow()
    // Esperamos al motor un rato para que `flixDesktop.torrent` ya esté al cargar; si tarda o falla, el sitio abre
    // igual y solo faltan los torrents sin debrid.
    await Promise.race([engineReady, delay(ENGINE_WAIT_MS)])
    if (!engine) log.warn('motor: el sitio abre sin torrents')
    if (win.isDestroyed()) return
    win.loadURL(START_URL)
    // Revisa si hay versión nueva sin avisar nada: la web pregunta después con `update.check()` y usa esto.
    setTimeout(() => updater.check(false), 5_000)
  })
}

/** Arranca el motor de engine/ (otro módulo, ver CONTRACT.md). Si no arranca, `null`: la app sigue sin torrents. */
async function startTorrentEngine() {
  try {
    const { startEngine } = await import('./engine/index.js')
    const engine = await startEngine({
      cacheDir: path.join(app.getPath('temp'), 'flix-torrents'),
      allowedOrigins: engineOrigins(START_URL),
      ffmpegPath: binaryPath(() => require('ffmpeg-static')),
      ffprobePath: binaryPath(() => require('ffprobe-static').path),
      log: (/** @type {unknown} */ msg) => log.info('[motor]', msg),
    })
    log.info('motor: listo')
    return engine
  } catch (err) {
    log.error('motor: no arrancó', err)
    return null
  }
}

/**
 * La ruta de ffmpeg/ffprobe. En la app instalada están en `app.asar.unpacked` (electron-builder.yml, asarUnpack):
 * un .exe adentro del asar no se puede ejecutar.
 * @param {() => unknown} get
 */
function binaryPath(get) {
  try {
    const p = get()
    return typeof p === 'string' ? p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1') : ''
  } catch (err) {
    log.warn('ffmpeg: no está', err)
    return ''
  }
}

function setupSession() {
  const ses = session.defaultSession
  const ua = desktopUserAgent(app.userAgentFallback, [PACKAGE_NAME, app.getName()], app.getVersion())
  app.userAgentFallback = ua
  ses.setUserAgent(ua)

  // Permisos: solo lo que usa la web (src/): pantalla completa, copiar (informe de error, link de invitación),
  // pantalla encendida (useWakeLock), guardado persistente y la red local (el motor en 127.0.0.1). Micrófono,
  // cámara, ubicación, notificaciones, USB y demás: no (la búsqueda por voz no anda en Electron igual).
  /** @type {ReadonlySet<string>} */
  const ALLOWED = new Set([
    'fullscreen',
    'clipboard-sanitized-write',
    'screen-wake-lock',
    'persistent-storage',
    'local-network-access',
    'local-network',
    'loopback-network',
  ])
  /** @param {string} permission @param {string | undefined} origin @param {string | undefined} top */
  const grant = (permission, origin, top) => {
    if (!ALLOWED.has(permission) || !isAllowed(top)) return false
    // El iframe del tráiler de YouTube puede pedir pantalla completa; lo demás, solo el sitio.
    return permission === 'fullscreen' || isAllowed(origin)
  }
  ses.setPermissionRequestHandler((wc, permission, cb, details) => {
    const ok = grant(permission, details.requestingUrl, wc.getURL())
    if (!ok) log.info(`permiso negado: ${permission}`)
    cb(ok)
  })
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin) => grant(permission, requestingOrigin, wc?.getURL()))
  ses.setDevicePermissionHandler(() => false)
}

function createWindow() {
  const userData = app.getPath('userData')
  const st = loadWindowState(userData)
  const win = new BrowserWindow({
    ...(st.x !== undefined && st.y !== undefined ? { x: st.x, y: st.y } : {}),
    width: st.width || DEFAULT_WIDTH,
    height: st.height || DEFAULT_HEIGHT,
    minWidth: 900,
    minHeight: 560,
    title: 'Flix',
    backgroundColor: BG,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      spellcheck: false,
      // Pistas de audio del <video> (elegir idioma en archivos con varios audios).
      enableBlinkFeatures: 'AudioVideoTracks',
    },
  })
  win.setMenu(null)
  if (st.maximized) win.maximize()
  win.show()
  trackWindowState(win, userData)

  const wc = win.webContents
  // El título queda "Flix" (la web cambia el de la pestaña según la página).
  win.on('page-title-updated', (e) => e.preventDefault())

  // Navegación: la ventana se queda en el sitio. Lo de afuera (IMDb, JustWatch…) va al navegador; otros esquemas
  // (intent:, vlc:, file:…) no se abren.
  wc.on('will-navigate', (e) => {
    if (isAllowed(e.url)) return
    e.preventDefault()
    openOutside(e.url)
  })
  wc.setWindowOpenHandler(({ url }) => {
    if (isAllowed(url)) wc.loadURL(url)
    else openOutside(url)
    return { action: 'deny' }
  })
  wc.on('will-attach-webview', (e) => e.preventDefault())

  // Sin internet al abrir (y sin el sitio en la caché del service worker): una página propia que reintenta.
  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    // -3 = ERR_ABORTED (una navegación que pisó a otra): no es una falla.
    if (!isMainFrame || code === -3 || !isAllowed(url)) return
    log.warn(`no cargó ${new URL(url).origin}: ${code} ${desc}`)
    win.loadFile(path.join(here, 'offline.html'), { query: { url } })
  })
  let crashes = 0
  wc.on('render-process-gone', (_e, details) => {
    log.error('la página se cayó', details.reason)
    if (details.reason === 'clean-exit' || ++crashes > 3) return
    setTimeout(() => !win.isDestroyed() && wc.reload(), 1000)
    setTimeout(() => (crashes = Math.max(0, crashes - 1)), 60_000)
  })

  // Teclas: F11 pantalla completa, F5 recargar, Alt+←/→ atrás/adelante, F12 herramientas (solo sin instalar).
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return
    const plain = !input.control && !input.shift && !input.meta
    if (input.key === 'F11' && plain && !input.alt) {
      win.setFullScreen(!win.isFullScreen())
      e.preventDefault()
    } else if (input.key === 'F5' && plain && !input.alt) {
      wc.reload()
      e.preventDefault()
    } else if (input.key === 'F12' && !app.isPackaged) {
      wc.toggleDevTools()
      e.preventDefault()
    } else if (input.alt && plain && (input.key === 'ArrowLeft' || input.key === 'ArrowRight')) {
      if (input.key === 'ArrowLeft') goBack(wc)
      else if (wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
      e.preventDefault()
    }
  })
  // Botones de atrás/adelante del mouse (Windows los manda como app-command).
  win.on('app-command', (_e, cmd) => {
    if (cmd === 'browser-backward') goBack(wc)
    else if (cmd === 'browser-forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
  })

  return win
}

/** @param {import('electron').WebContents} wc */
function goBack(wc) {
  if (wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
}

/** @param {string} url */
function openOutside(url) {
  if (externalAction(url) === 'external') {
    log.info(`al navegador: ${new URL(url).origin}`)
    shell.openExternal(url).catch((err) => log.warn('no se pudo abrir afuera', err))
  } else {
    log.info(`link negado: ${url.split(':')[0]}:`)
  }
}

/** @param {number} ms */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
