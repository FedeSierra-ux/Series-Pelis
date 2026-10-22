// @ts-check
// `postinstall`: baja ffprobe a bin/ (ver ffprobe.js). Si ya está el de este sha256, no hace nada. Una plataforma
// sin sha256 conocido no baja nada (avisa): el motor arranca igual y el probe da error.
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { BIN_DIR, FFPROBE_SHA256, ffprobePath, ffprobeUrl } from '../ffprobe.js'

const key = `${process.platform}-${process.arch}`
const sha = FFPROBE_SHA256[key]
const dest = ffprobePath()
const stamp = `${dest}.sha256`

if (!sha) {
  console.warn(`ffprobe: no hay binario conocido para ${key}; no se baja`)
  process.exit(0)
}
if (fs.existsSync(dest) && readOr(stamp) === sha) process.exit(0)

const url = ffprobeUrl(process.platform, process.arch)
const res = await fetch(url)
if (!res.ok) throw new Error(`ffprobe: ${url} respondió ${res.status}`)
const gz = Buffer.from(await res.arrayBuffer())
const got = createHash('sha256').update(gz).digest('hex')
if (got !== sha) throw new Error(`ffprobe: sha256 distinto (${got}, se esperaba ${sha})`)

fs.mkdirSync(BIN_DIR, { recursive: true })
const tmp = `${dest}.tmp`
fs.writeFileSync(tmp, gunzipSync(gz), { mode: 0o755 })
fs.renameSync(tmp, dest)
fs.writeFileSync(stamp, sha)
console.info(`ffprobe: ${dest}`)

/** @param {string} file */
function readOr(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim()
  } catch {
    return ''
  }
}
