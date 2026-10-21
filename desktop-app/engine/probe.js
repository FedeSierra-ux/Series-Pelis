// @ts-check
// `/hlsv2/probe`: qué trae el archivo, con ffprobe. Se guarda por URL (lo usan después la lista maestra y el plan).
import { execFile } from 'node:child_process'
import { Inflight, Lru } from './util.js'

const PROBE_TIMEOUT_MS = 40_000

/**
 * @typedef {{
 *   index: number, track: 'video' | 'audio' | 'subtitle', codec: string | null, channels?: number,
 *   language: string | null, title: string | null, default: boolean, forced?: boolean, sdh?: boolean,
 *   width?: number, height?: number, pixFmt?: string, bitRate?: number, startTime?: number, colorTransfer?: string,
 * }} ProbeStream
 * @typedef {{
 *   format: { name: string, duration: number | null, startTime: number, bitRate: number | null },
 *   streams: ProbeStream[],
 * }} ProbeResult
 */

/**
 * De la salida JSON de ffprobe a lo que espera la web (y algo más para el motor). Sin carátulas ni adjuntos.
 * @param {any} raw
 * @returns {ProbeResult}
 */
export function normalizeProbe(raw) {
  const f = raw?.format ?? {}
  const num = (/** @type {any} */ x) => (x === undefined || x === null || x === 'N/A' || !Number.isFinite(Number(x)) ? null : Number(x))
  /** @type {ProbeStream[]} */
  const streams = []
  for (const s of Array.isArray(raw?.streams) ? raw.streams : []) {
    const type = s.codec_type
    if (type !== 'video' && type !== 'audio' && type !== 'subtitle') continue
    if (type === 'video' && (s.disposition?.attached_pic || ['mjpeg', 'png', 'bmp', 'gif'].includes(s.codec_name))) continue
    const lang = typeof s.tags?.language === 'string' ? s.tags.language.toLowerCase() : null
    /** @type {ProbeStream} */
    const out = {
      index: Number(s.index),
      track: type,
      codec: s.codec_name ?? null,
      language: lang && lang !== 'und' ? lang : null,
      title: typeof s.tags?.title === 'string' ? s.tags.title : null,
      default: !!s.disposition?.default,
    }
    if (type === 'audio') out.channels = Number(s.channels) || undefined
    if (type === 'subtitle') {
      if (s.disposition?.forced) out.forced = true
      if (s.disposition?.hearing_impaired) out.sdh = true
    }
    if (type === 'video') {
      out.width = Number(s.width) || undefined
      out.height = Number(s.height) || undefined
      out.pixFmt = s.pix_fmt
      if (s.color_transfer) out.colorTransfer = s.color_transfer
    }
    const st = num(s.start_time)
    if (st !== null) out.startTime = st
    const br = num(s.bit_rate)
    if (br) out.bitRate = br
    streams.push(out)
  }
  return {
    format: {
      name: String(f.format_name ?? ''),
      duration: num(f.duration),
      startTime: num(f.start_time) ?? 0,
      bitRate: num(f.bit_rate),
    },
    streams,
  }
}

/**
 * Lo que devuelve la ruta: lo de Stremio (`format.name/duration`, `streams[].track/codec/channels/language`) y más.
 * `index` es el de ffprobe: con él la web pide los subtítulos del video (`/subtitles/<index>/<n>.vtt`).
 */
export function probeResponse(/** @type {ProbeResult} */ p) {
  return {
    format: { name: p.format.name, duration: p.format.duration },
    streams: p.streams.map((s) => ({
      index: s.index,
      track: s.track,
      codec: s.codec,
      channels: s.channels,
      language: s.language,
      title: s.title,
      default: s.default,
      forced: s.forced,
      sdh: s.sdh,
      width: s.width,
      height: s.height,
    })),
  }
}

export class Prober {
  /** @param {string} ffprobePath */
  constructor(ffprobePath) {
    this.ffprobePath = ffprobePath
    this.inflight = new Inflight()
    /** @type {Lru<ProbeResult>} */
    this.cache = new Lru(32)
    /** @type {Set<import('node:child_process').ChildProcess>} */
    this.procs = new Set()
  }

  /**
   * @param {string} key  identidad del archivo (para la caché)
   * @param {string} url  URL local que lee ffprobe
   * @returns {Promise<ProbeResult>}
   */
  probe(key, url) {
    const hit = this.cache.get(key)
    if (hit) return Promise.resolve(hit)
    return this.inflight.run(key, async () => {
      const raw = await this.run(url)
      const res = normalizeProbe(raw)
      if (!res.format.name || !res.streams.length) throw new Error('ffprobe no reconoce el archivo')
      this.cache.set(key, res)
      return res
    })
  }

  /** @param {string} url */
  run(url) {
    return new Promise((resolve, reject) => {
      const args = ['-v', 'error', '-rw_timeout', '30000000', '-print_format', 'json', '-show_format', '-show_streams', url]
      const child = execFile(this.ffprobePath, args, { timeout: PROBE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
        this.procs.delete(child)
        if (err) return reject(new Error(`ffprobe: ${String(stderr || err.message).trim().slice(0, 300)}`))
        try {
          resolve(JSON.parse(stdout))
        } catch {
          reject(new Error('ffprobe: salida inválida'))
        }
      })
      this.procs.add(child)
    })
  }

  close() {
    for (const p of this.procs) p.kill('SIGKILL')
    this.procs.clear()
  }
}
