// @ts-check
// Reproductores externos (VLC, mpv, PotPlayer) desde la app de Windows. La web arma el mismo enlace que en el
// navegador (`vlc://<url>`, src/lib/externalPlayers.ts) y lo pasa por `flixDesktop.openPlayer`. Acá se abre el
// programa instalado directo, con la URL como único argumento: en Windows VLC y mpv no registran `vlc://` ni
// `mpv://`, así que el enlace solo no abriría nada.
import fs from 'node:fs'
import path from 'node:path'

/** @typedef {'vlc' | 'mpv' | 'potplayer'} PlayerId */

/** Lo que va después del esquema tiene que ser un video por http/https (nada de file:, ni opciones). */
const VIDEO_URL = /^https?:\/\/[^\s"]+$/i

/**
 * `vlc://https://…` → `{ player: 'vlc', url: 'https://…' }`. Cualquier otra cosa: `undefined`.
 * @param {unknown} href
 * @returns {{ player: PlayerId, url: string } | undefined}
 */
export function parsePlayerLink(href) {
  if (typeof href !== 'string' || href.length > 8192) return undefined
  const m = /^(vlc|mpv|potplayer):\/\/(.+)$/i.exec(href.trim())
  if (!m) return undefined
  const url = m[2]
  if (!VIDEO_URL.test(url)) return undefined
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined
  } catch {
    return undefined
  }
  return { player: /** @type {PlayerId} */ (m[1].toLowerCase()), url }
}

/** @type {Record<PlayerId, { exe: string[], dirs: (env: NodeJS.ProcessEnv) => (string | undefined)[] }>} */
const KNOWN = {
  vlc: {
    exe: ['vlc.exe'],
    dirs: (env) => [
      env.ProgramFiles && path.win32.join(env.ProgramFiles, 'VideoLAN', 'VLC'),
      env['ProgramFiles(x86)'] && path.win32.join(env['ProgramFiles(x86)'], 'VideoLAN', 'VLC'),
    ],
  },
  mpv: {
    exe: ['mpv.exe'],
    dirs: (env) => [
      env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, 'Programs', 'mpv'),
      env.USERPROFILE && path.win32.join(env.USERPROFILE, 'scoop', 'apps', 'mpv', 'current'),
      env.ProgramFiles && path.win32.join(env.ProgramFiles, 'mpv'),
      env.ChocolateyInstall && path.win32.join(env.ChocolateyInstall, 'bin'),
    ],
  },
  potplayer: {
    exe: ['PotPlayerMini64.exe', 'PotPlayerMini.exe'],
    dirs: (env) => [
      env.ProgramFiles && path.win32.join(env.ProgramFiles, 'DAUM', 'PotPlayer'),
      env['ProgramFiles(x86)'] && path.win32.join(env['ProgramFiles(x86)'], 'DAUM', 'PotPlayer'),
      env.ProgramFiles && path.win32.join(env.ProgramFiles, 'PotPlayer'),
    ],
  },
}

/**
 * Dónde puede estar instalado, en orden: las carpetas de siempre y después el PATH.
 * @param {PlayerId} player
 * @param {NodeJS.ProcessEnv} env
 */
export function playerCandidates(player, env) {
  const { exe, dirs } = KNOWN[player]
  const pathDirs = (env.PATH ?? env.Path ?? '').split(';').map((d) => d.trim().replace(/^"|"$/g, ''))
  const out = /** @type {string[]} */ ([])
  for (const dir of [...dirs(env), ...pathDirs]) {
    if (!dir || !path.win32.isAbsolute(dir)) continue
    for (const name of exe) {
      const full = path.win32.join(dir, name)
      if (!out.includes(full)) out.push(full)
    }
  }
  return out
}

/** Los argumentos: mpv corta las opciones con `--` (la URL nunca se lee como opción). @param {PlayerId} player @param {string} url */
export function playerArgs(player, url) {
  return player === 'mpv' ? ['--', url] : [url]
}

/**
 * El primero que existe.
 * @param {PlayerId} player
 * @param {NodeJS.ProcessEnv} env
 * @param {(p: string) => boolean} [exists]
 */
export function findPlayer(player, env, exists = (p) => fs.existsSync(p)) {
  return playerCandidates(player, env).find((p) => exists(p))
}
