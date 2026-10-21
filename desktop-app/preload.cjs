// @ts-check
// `window.flixDesktop` para la web (contrato en CONTRACT.md). Con sandbox el preload tiene que ser CommonJS y solo
// puede usar `electron`. Corre solo en el marco principal; main.js contesta `flix:info` únicamente si la página es
// del sitio (o sus previews), así que en cualquier otra (offline.html, un link raro) no se expone nada.
const { contextBridge, ipcRenderer } = require('electron')

/** @type {{ version: string, torrent?: string } | null} */
const info = ipcRenderer.sendSync('flix:info')

if (info) {
  contextBridge.exposeInMainWorld('flixDesktop', {
    version: info.version,
    // Sin motor (no arrancó) no va la clave: la web lo toma como "sin torrents".
    ...(info.torrent ? { torrent: info.torrent } : {}),
    update: {
      /** @param {boolean} [force] */
      check: (force) => ipcRenderer.invoke('flix:update-check', force === true),
      install: () => ipcRenderer.invoke('flix:update-install'),
      /** @param {(e: unknown) => void} fn */
      onEvent: (fn) => {
        if (typeof fn !== 'function') return () => {}
        // No se pasa el evento de IPC a la página: solo los datos.
        /** @param {unknown} _e @param {unknown} data */
        const listener = (_e, data) => fn(data)
        ipcRenderer.on('flix:update-event', listener)
        return () => {
          ipcRenderer.removeListener('flix:update-event', listener)
        }
      },
    },
  })
}
