// @ts-check
// ffprobe del mismo build que el ffmpeg de ffmpeg-static (su Release b6.1.1 trae los dos). ffprobe-static quedó en
// la 4.0.2 (2018). Lo baja scripts/ffprobe.mjs en el `postinstall` a bin/, verificado con el sha256 de abajo; el
// instalador lo lleva afuera del asar (electron-builder.yml).
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const FFPROBE_RELEASE = 'b6.1.1'

/** sha256 del .gz de cada plataforma en el Release de ffmpeg-static. */
export const FFPROBE_SHA256 = /** @type {Record<string, string>} */ ({
  'win32-x64': 'f309e6223ad89d2fe54bccd420a7709b66fd27540674e92309578ed491a43c8d',
  'linux-x64': '25d9b6ccb05e3d9de9e04e31e2506d8dd7f9f0418981965ac6df12e8d3afd067',
})

export const BIN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'bin')

/** Dónde queda ffprobe para esta plataforma (exista o no). */
export function ffprobePath(platform = process.platform) {
  return path.join(BIN_DIR, platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
}

/** @param {string} platform @param {string} arch */
export function ffprobeUrl(platform, arch) {
  return `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFPROBE_RELEASE}/ffprobe-${platform}-${arch}.gz`
}
