// @ts-check
// Registro chiquito en <userData>/logs/flix.log (para cuando algo falla en la PC de alguien). Pasa de 1 MB → empieza
// de cero guardando el anterior como flix.old.log. Nunca escribir keys ni links de debrid completos acá.
import fs from 'node:fs'
import path from 'node:path'

const MAX_BYTES = 1024 * 1024

/** @typedef {{ info(...a: unknown[]): void, warn(...a: unknown[]): void, error(...a: unknown[]): void, debug(...a: unknown[]): void }} Logger */

/**
 * @param {string} dir
 * @returns {Logger}
 */
export function createLogger(dir) {
  const file = path.join(dir, 'flix.log')
  let ready = false
  /** @param {string} level @param {unknown[]} parts */
  const write = (level, parts) => {
    const text = parts.map((p) => (p instanceof Error ? p.stack || p.message : typeof p === 'string' ? p : safeJson(p))).join(' ')
    const line = `${new Date().toISOString()} ${level} ${text}\n`
    if (level === 'ERROR') console.error(line.trimEnd())
    else console.log(line.trimEnd())
    try {
      if (!ready) {
        fs.mkdirSync(dir, { recursive: true })
        ready = true
      }
      if (fs.existsSync(file) && fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, path.join(dir, 'flix.old.log'))
      fs.appendFileSync(file, line)
    } catch {
      // Sin disco no hay registro; la app sigue igual.
    }
  }
  return {
    info: (...a) => write('INFO', a),
    warn: (...a) => write('WARN', a),
    error: (...a) => write('ERROR', a),
    debug: () => {},
  }
}

/** @param {unknown} v */
function safeJson(v) {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
