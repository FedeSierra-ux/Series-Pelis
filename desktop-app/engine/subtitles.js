// @ts-check
// `/subtitles/<pista>/<tramo>.vtt?mediaURL=`: subtítulos de texto que vienen dentro del video (SRT/ASS de un MKV,
// mov_text de un MP4), pasados a WebVTT por tramos de `SUB_WINDOW_S`. En un MKV los subtítulos van mezclados con el
// video a lo largo de todo el archivo: sacarlos enteros obligaría a bajar el torrent completo. Por tramos, ffmpeg
// lee solo la parte que el reproductor ya está bajando (la web pide el tramo actual y, cerca del final, el
// siguiente). Los de imagen (PGS, VobSub) no se pueden pasar a texto: no se ofrecen.
import { execFile } from 'node:child_process'
import { Inflight, Lru } from './util.js'

/** Segundos por tramo (los tiempos salen del archivo: `-copyts`). */
export const SUB_WINDOW_S = 120
/** Códecs de subtítulos de texto que ffmpeg pasa a WebVTT. */
export const TEXT_SUB_CODECS = new Set(['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'text'])
/** ffmpeg puede esperar piezas del torrent (un salto lejos lee el índice del final del MKV). */
const SUB_TIMEOUT_MS = 90_000
/** ffmpeg a la vez (para todas las pistas): no le sacan ancho de banda al video. */
const MAX_JOBS = 2
const EMPTY_VTT = 'WEBVTT\n\n'

/**
 * Argumentos de ffmpeg para el tramo `n` de la pista `index`. Con `-copyts` los tiempos son los del archivo (los
 * mismos que el `currentTime` del reproductor); `-to` es hasta dónde, también en tiempos del archivo. Entra cada
 * subtítulo que empieza en [n·W, (n+1)·W).
 * @param {{ input: string, index: number, n: number, window?: number }} o
 */
export function subtitleArgs(o) {
  const w = o.window ?? SUB_WINDOW_S
  const args = ['-hide_banner', '-nostdin', '-loglevel', 'error']
  if (/^https?:/.test(o.input)) args.push('-rw_timeout', '30000000')
  if (o.n > 0) args.push('-ss', String(o.n * w))
  args.push('-copyts', '-i', o.input, '-to', String((o.n + 1) * w))
  args.push('-map', `0:${o.index}`, '-an', '-vn', '-dn', '-c:s', 'webvtt', '-f', 'webvtt', 'pipe:1')
  return args
}

/** `[hh:]mm:ss.mmm` → segundos. @param {string} t */
function vttSeconds(t) {
  const parts = t.split(':').map(Number)
  return parts.reduce((acc, x) => acc * 60 + x, 0)
}

/**
 * Saca los subtítulos que empiezan antes de `from`: al saltar, ffmpeg arranca un poco antes (en el keyframe) y
 * repetiría el último del tramo anterior.
 * @param {string} vtt
 * @param {number} from
 */
export function dropBefore(vtt, from) {
  if (from <= 0) return vtt
  const blocks = vtt.replace(/\r\n?/g, '\n').split(/\n{2,}/)
  const kept = blocks.filter((b, i) => {
    if (i === 0) return true
    const m = /^(?:[^\n]*\n)?((?:\d+:)?\d+:\d+\.\d+)\s+-->/.exec(b)
    return !m || vttSeconds(m[1]) >= from - 0.0005
  })
  return kept.join('\n\n')
}

/**
 * ¿Se puede sacar esa pista? Tiene que existir en el archivo y ser de texto.
 * @param {import('./probe.js').ProbeResult} probe
 * @param {number} index
 */
export function isTextSubtitle(probe, index) {
  const s = probe.streams.find((x) => x.index === index)
  return !!s && s.track === 'subtitle' && TEXT_SUB_CODECS.has(s.codec ?? '')
}

export class Subtitles {
  /**
   * @param {{ ffmpegPath: string, prober: import('./probe.js').Prober, log?: (m: string) => void }} o
   */
  constructor(o) {
    this.ffmpegPath = o.ffmpegPath
    this.prober = o.prober
    this.log = o.log ?? (() => {})
    this.inflight = new Inflight()
    /** Tramos ya sacados (unos KB cada uno). @type {Lru<string>} */
    this.cache = new Lru(400)
    /** @type {Set<import('node:child_process').ChildProcess>} */
    this.procs = new Set()
    this.running = 0
    /** @type {(() => void)[]} */
    this.queue = []
    this.closed = false
  }

  /**
   * WebVTT del tramo `n`. Error con `status` 404 si la pista no existe o no es de texto.
   * @param {import('./hls.js').Input} input
   * @param {number} index
   * @param {number} n
   * @returns {Promise<string>}
   */
  window(input, index, n) {
    const key = `${input.key}:${index}:${n}`
    const hit = this.cache.get(key)
    if (hit !== undefined) return Promise.resolve(hit)
    return this.inflight.run(key, async () => {
      const probe = await this.prober.probe(input.key, input.url).catch((err) => {
        throw Object.assign(err, { status: 502 })
      })
      if (!isTextSubtitle(probe, index)) throw Object.assign(new Error('Esa pista no es un subtítulo de texto'), { status: 404 })
      const duration = probe.format.duration
      // Pasado el final: vacío, sin ffmpeg.
      const vtt = duration !== null && n * SUB_WINDOW_S >= duration ? EMPTY_VTT : dropBefore(await this.slot(() => this.run(subtitleArgs({ input: input.url, index, n }))), n * SUB_WINDOW_S)
      this.cache.set(key, vtt)
      return vtt
    })
  }

  /**
   * De a `MAX_JOBS`.
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async slot(fn) {
    if (this.running >= MAX_JOBS) await new Promise((resolve) => this.queue.push(() => resolve(undefined)))
    if (this.closed) throw new Error('Motor cerrado')
    this.running++
    try {
      return await fn()
    } finally {
      this.running--
      this.queue.shift()?.()
    }
  }

  /** @param {string[]} args @returns {Promise<string>} */
  run(args) {
    return new Promise((resolve, reject) => {
      const child = execFile(this.ffmpegPath, args, { timeout: SUB_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
        this.procs.delete(child)
        if (err) return reject(Object.assign(new Error(`ffmpeg: ${String(stderr || err.message).trim().slice(0, 300)}`), { status: 502 }))
        resolve(stdout.startsWith('WEBVTT') ? stdout : EMPTY_VTT)
      })
      this.procs.add(child)
    })
  }

  close() {
    this.closed = true
    for (const p of this.procs) p.kill('SIGKILL')
    this.procs.clear()
    for (const next of this.queue.splice(0)) next()
  }
}
