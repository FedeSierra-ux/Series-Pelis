// @ts-check
// Los errores de electron-updater vienen en inglés y largos: acá se pasan a una frase corta para el aviso de la web
// (mismo tono que los del APK, tv-app/…/AppUpdater.java). Puro: lo prueba shell.test.js.

/**
 * @param {unknown} err
 * @returns {string}
 */
export function updateErrorText(err) {
  const e = /** @type {{ code?: unknown, statusCode?: unknown, message?: unknown }} */ (err ?? {})
  const code = typeof e.code === 'string' ? e.code : ''
  const msg = typeof e.message === 'string' ? e.message : String(err ?? '')
  const status = typeof e.statusCode === 'number' ? e.statusCode : Number(/HttpError: (\d{3})/.exec(msg)?.[1] ?? 0)

  if (code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' || status === 404) return 'Todavía no hay una versión publicada para la PC.'
  if (code === 'ERR_CHECKSUM_MISMATCH' || /sha512 checksum mismatch/i.test(msg)) return 'La descarga no coincide con la publicada. Probá de nuevo.'
  if (code === 'ERR_UPDATER_INVALID_UPDATE_INFO' || code === 'ERR_UPDATER_INVALID_VERSION') return 'GitHub contestó algo raro. Probá de nuevo más tarde.'
  if (code === 'ENOSPC' || /ENOSPC/.test(msg)) return 'No hay lugar en el disco para bajar la actualización.'
  if (/^(EPERM|EACCES|EBUSY)$/.test(code) || /\b(EPERM|EACCES|EBUSY)\b/.test(msg)) return 'Windows no dejó guardar la actualización.'
  if (status === 403 || status === 429) return 'GitHub está limitando los pedidos. Probá de nuevo más tarde.'
  if (status >= 500) return 'GitHub no responde. Probá de nuevo más tarde.'
  if (
    /net::ERR_|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|socket hang up|timeout/i.test(msg) ||
    /^(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH)$/.test(code)
  )
    return 'Sin conexión con GitHub. Probá de nuevo más tarde.'
  return 'No se pudo actualizar la app.'
}
