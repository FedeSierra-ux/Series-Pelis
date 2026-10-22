// @ts-check
// `/hlsv2/<id>/…`: HLS VOD a pedido. La lista entera está desde el principio (los cortes salen del índice del
// archivo o de una grilla fija) y los segmentos los hace ffmpeg recién cuando hacen falta, un poco por delante de lo
// que pide hls.js. Al saltar a otra parte se arranca otro ffmpeg ahí; el que quedó atrás se corta.
//
// Una pista = una lista y sus segmentos: `video.m3u8` (v/<n>.ts) y `audio<i>.m3u8` (a<i>/<n>.ts), cada una con su
// ffmpeg. Todos los TS llevan los tiempos del archivo (`-copyts`), así encajan entre sí y entre ffmpegs distintos.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { keyframeIndex } from './keyframes.js'
import {
  audioRenditions,
  gridBoundaries,
  keyframeBoundaries,
  masterPlaylist,
  mediaPlaylist,
  scaledSize,
  segmentTimes,
} from './playlist.js'
import { Lru, RM_DIR } from './util.js'

/** Segmentos por ffmpeg (después sigue otro, si se sigue mirando). */
const JOB_SEGMENTS = { copy: 40, x264: 20, aac: 60 }
/** Cuántos segmentos por delante de lo último pedido se preparan. */
const LOOKAHEAD = 12
/** Si el ffmpeg que viene está a más de esto del segmento pedido, se arranca otro justo ahí. */
const WAIT_AHEAD = 4
/** Segmentos que se guardan por pista (los más lejos de lo que se mira se borran). */
const KEEP_SEGMENTS = 150
/** Sin pedidos en este tiempo, los ffmpeg de la sesión se cortan (los segmentos quedan). */
const JOB_IDLE_MS = 60_000
/** Sin pedidos en este tiempo, la sesión se borra entera (se puede rearmar con la misma URL). */
const SESSION_IDLE_MS = 15 * 60_000
const MAX_SESSIONS = 3
/** Video que se copia tal cual (en TS lo entiende hls.js); el resto se pasa a H.264. */
const COPY_VIDEO = new Set(['h264', 'hevc'])
const COPY_PIX = /** @type {Record<string, Set<string>>} */ ({
  h264: new Set(['yuv420p', 'yuvj420p']),
  hevc: new Set(['yuv420p', 'yuvj420p', 'yuv420p10le']),
})
/** Audio que se copia (TS + hls.js); el resto se pasa a AAC estéreo. */
const COPY_AUDIO = new Set(['aac', 'mp3'])
const HDR_TRANSFER = new Set(['smpte2084', 'arib-std-b67'])

/**
 * @typedef {import('./probe.js').ProbeResult} ProbeResult
 * @typedef {import('./probe.js').ProbeStream} ProbeStream
 * @typedef {import('./playlist.js').Boundaries} Boundaries
 * @typedef {{ videoCodecs: string[], audioCodecs: string[], maxAudioChannels: number }} Caps
 * @typedef {{ key: string, url: string }} Input
 * @typedef {{ kind: 'video' | 'audio', stream: ProbeStream, mode: 'copy' | 'x264' | 'aac' }} TrackPlan
 * @typedef {{ boundaries: Boundaries, keyframes: number[] | null, tracks: Map<string, TrackPlan> }} Plan
 */

/**
 * Qué se puede pedir en la URL: los códecs que entiende el navegador.
 * @param {URLSearchParams} q
 * @returns {Caps}
 */
export function capsFromQuery(q) {
  const list = (/** @type {string} */ k) => q.getAll(k).flatMap((v) => v.split(',')).map((v) => v.trim().toLowerCase()).filter(Boolean)
  const max = Number(q.get('maxAudioChannels'))
  const audioCodecs = list('audioCodecs')
  return {
    videoCodecs: list('videoCodecs').map((c) => (c === 'h265' ? 'hevc' : c)),
    audioCodecs: audioCodecs.length ? audioCodecs : ['aac'],
    maxAudioChannels: Number.isFinite(max) && max >= 1 ? Math.min(8, Math.floor(max)) : 2,
  }
}

/**
 * ¿Copiar o convertir cada pista? El video se copia si el navegador lo entiende, va en TS y hay índice de keyframes
 * (sin índice no se sabe dónde cortar). El audio se copia solo con el video copiado (si no, el salto cae en el
 * keyframe de antes y el audio empezaría segundos antes del segmento).
 * @param {ProbeResult} probe
 * @param {Caps} caps
 * @param {boolean} hasIndex
 */
export function chooseModes(probe, caps, hasIndex) {
  const video = probe.streams.find((s) => s.track === 'video')
  const audios = probe.streams.filter((s) => s.track === 'audio')
  const codec = video?.codec ?? ''
  const copyVideo =
    !!video && hasIndex && COPY_VIDEO.has(codec) && caps.videoCodecs.includes(codec) && (!video.pixFmt || !!COPY_PIX[codec]?.has(video.pixFmt))
  const videoMode = video ? (copyVideo ? 'copy' : 'x264') : null
  const audioModes = audios.map((a) =>
    (videoMode !== 'x264') && COPY_AUDIO.has(a.codec ?? '') && caps.audioCodecs.includes(a.codec ?? '') && (a.channels ?? 2) <= caps.maxAudioChannels
      ? 'copy'
      : 'aac',
  )
  return { video, audios, videoMode, audioModes }
}

/**
 * Argumentos de un ffmpeg que hace los segmentos [from, to) de una pista.
 * @param {{
 *   input: string, plan: Plan, track: TrackPlan, from: number, to: number, fileStart: number,
 *   outPattern: string, hdrTonemap: boolean, threads: number,
 * }} o
 */
export function jobArgs(o) {
  const b = o.plan.boundaries
  const total = b.starts.length
  const start = b.starts[o.from]
  const args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y']
  if (/^https?:/.test(o.input)) args.push('-rw_timeout', '30000000')
  // Al copiar, ffmpeg arranca en el keyframe ≤ al punto: se apunta apenas después del inicio (que es un keyframe).
  let eps = 0
  if (o.track.mode === 'copy' && o.track.kind === 'video') {
    const kf = o.plan.keyframes ?? []
    const next = kf.find((t) => t > start + 1e-6)
    eps = Math.min(0.05, next !== undefined ? (next - start) / 2 : 0.05)
  } else if (o.track.mode === 'copy') {
    eps = 0.05
  }
  const ss = Math.max(0, start - o.fileStart + eps)
  if (o.from > 0 || ss > 0.001) args.push('-ss', ss.toFixed(6))
  if (o.to < total) {
    // Hasta justo antes del primer segmento que no le toca.
    const t = b.starts[o.to] - 0.001 - (o.fileStart + ss)
    args.push('-t', Math.max(0.1, t).toFixed(6))
  }
  args.push('-copyts', '-i', o.input, '-map', `0:${o.track.stream.index}`, '-map_metadata', '-1', '-map_chapters', '-1', '-sn', '-dn')
  if (o.track.kind === 'video') {
    args.push('-an')
    if (o.track.mode === 'copy') {
      args.push('-c:v', 'copy')
      // Algunos MKV traen HEVC como `hev1`; en TS da igual (Annex B lo pone el muxer).
    } else {
      const s = o.track.stream
      const size = scaledSize(s.width ?? 0, s.height ?? 0)
      /** @type {string[]} */
      const vf = []
      // Primero se achica (4K → 1080p), después el HDR pasa a SDR (si el ffmpeg tiene zscale).
      if (size && (size.w !== s.width || size.h !== s.height)) vf.push(`scale=${size.w}:${size.h}`)
      if (o.hdrTonemap && s.colorTransfer && HDR_TRANSFER.has(s.colorTransfer)) {
        vf.push('zscale=t=linear:npl=100', 'format=gbrpf32le', 'zscale=p=bt709', 'tonemap=hable:desat=0', 'zscale=t=bt709:m=bt709:r=tv')
      }
      vf.push('format=yuv420p')
      const forced = []
      for (let k = o.from + 1; k < o.to; k++) forced.push(b.starts[k].toFixed(6))
      args.push(
        '-vf', vf.join(','),
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-maxrate', '10M', '-bufsize', '20M',
        '-profile:v', 'high', '-threads', String(o.threads),
        '-x264-params', 'scenecut=0:open-gop=0:keyint=9999:min-keyint=9999',
        '-forced-idr', '1',
      )
      if (forced.length) args.push('-force_key_frames', forced.join(','))
    }
  } else {
    args.push('-vn')
    if (o.track.mode === 'copy') args.push('-c:a', 'copy')
    else args.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000')
  }
  const times = segmentTimes(b, o.from, o.to - 1, o.track.kind === 'audio')
  // Sin correr los tiempos: con B-frames (o el priming del AAC) el primer DTS da negativo y, por defecto, solo el
  // ffmpeg que arranca en 0 lo corre (unos 20–70 ms): sus segmentos no encajarían con los de otro ffmpeg. Va en
  // los dos muxers (el de segmentos y el TS de adentro).
  args.push('-avoid_negative_ts', 'disabled', '-f', 'segment', '-segment_format', 'mpegts', '-segment_format_options', 'avoid_negative_ts=disabled')
  if (times.length) args.push('-segment_times', times.join(','))
  else args.push('-segment_time', '100000')
  args.push('-segment_start_number', String(o.from), '-segment_list', 'pipe:1', '-segment_list_type', 'csv', o.outPattern)
  return args
}

/**
 * @typedef {{
 *   id: number, from: number, to: number, next: number, proc: import('node:child_process').ChildProcess,
 *   dead: boolean, exited: Promise<void>, prefix: string, killed: boolean, stderr: string,
 * }} Job
 * @typedef {{
 *   name: string, dir: string, done: Set<number>, jobs: Job[], lastReq: number,
 *   waiters: Map<number, Set<() => void>>, plan: TrackPlan,
 * }} Track
 */

class Session {
  /**
   * @param {Hls} hls
   * @param {string} id
   * @param {string} mediaURL
   * @param {URLSearchParams} query
   */
  constructor(hls, id, mediaURL, query) {
    this.hls = hls
    this.id = id
    this.mediaURL = mediaURL
    this.query = query
    this.caps = capsFromQuery(query)
    this.input = hls.inputFor(mediaURL)
    this.dir = path.join(hls.dir, id)
    this.lastUse = Date.now()
    /** @type {Map<string, Track>} */
    this.tracks = new Map()
    /** @type {Promise<ProbeResult> | undefined} */
    this._probe = undefined
    /** @type {Promise<Plan> | undefined} */
    this._plan = undefined
    this.destroyed = false
    this.ctrl = new AbortController()
    /** Inicio del archivo según ffprobe (`-ss` cuenta desde ahí). */
    this.fileStart = 0
  }

  probe() {
    this._probe ??= this.hls.prober.probe(this.input.key, this.input.url)
    this._probe.catch(() => {
      this._probe = undefined
    })
    return this._probe
  }

  /** @returns {Promise<Plan>} */
  plan() {
    this._plan ??= this.makePlan()
    this._plan.catch(() => {
      this._plan = undefined
    })
    return this._plan
  }

  async makePlan() {
    const probe = await this.probe()
    const first = chooseModes(probe, this.caps, true)
    const dur = probe.format.duration
    if (!dur || !(dur > 0)) throw new Error('Sin duración: no se puede armar la lista')
    const end = probe.format.startTime + dur
    this.fileStart = probe.format.startTime
    /** @type {Boundaries | null} */
    let boundaries = null
    /** @type {number[] | null} */
    let keyframes = null
    let videoMode = first.videoMode
    if (videoMode === 'copy') {
      const idx = await keyframeIndex(probe.format.name, this.input.url, this.ctrl.signal)
      if (idx && idx.keyframes.length) {
        keyframes = idx.keyframes
        boundaries = keyframeBoundaries(idx.keyframes, Math.max(end, idx.keyframes[idx.keyframes.length - 1] + 0.5))
      }
      if (!boundaries) this.hls.log(`hls ${this.id}: sin índice de keyframes, se convierte el video`)
    }
    const modes = boundaries ? first : chooseModes(probe, this.caps, false)
    videoMode = modes.videoMode
    if (!boundaries) {
      const s0 = modes.video?.startTime ?? modes.audios[0]?.startTime ?? probe.format.startTime
      boundaries = gridBoundaries(Math.max(probe.format.startTime, s0), end)
    }
    if (!boundaries) throw new Error('No se pudo cortar el archivo')
    /** @type {Map<string, TrackPlan>} */
    const tracks = new Map()
    if (modes.video && videoMode) tracks.set('v', { kind: 'video', stream: modes.video, mode: videoMode })
    modes.audios.forEach((a, i) => tracks.set(`a${i}`, { kind: 'audio', stream: a, mode: modes.audioModes[i] }))
    this.hls.log(
      `hls ${this.id}: ${boundaries.starts.length} segmentos, video ${videoMode ?? '-'}, audio ${modes.audioModes.join('/') || '-'}`,
    )
    return { boundaries, keyframes, tracks }
  }

  /** Lista maestra (solo necesita el probe: rápido). */
  async master() {
    const probe = await this.probe()
    const { video, audios, videoMode } = chooseModes(probe, this.caps, true)
    const size = video && (videoMode === 'copy' ? { w: video.width, h: video.height } : scaledSize(video.width ?? 0, video.height ?? 0))
    const bitRate = probe.format.bitRate ?? 0
    return masterPlaylist({
      video: !!video,
      renditions: audioRenditions(audios.map((a) => ({ language: a.language, title: a.title, default: a.default }))),
      bandwidth: Math.max(500_000, videoMode === 'copy' && bitRate ? bitRate : 6_000_000),
      resolution: size && size.w && size.h ? `${size.w}x${size.h}` : undefined,
      query: this.query.toString(),
    })
  }

  /** @param {string} name  'video' | 'audio<i>' */
  async playlist(name) {
    const plan = await this.plan()
    const key = name === 'video' ? 'v' : `a${name.slice(5)}`
    if (!plan.tracks.has(key)) return null
    return mediaPlaylist(plan.boundaries, (n) => `${key}/${n}.ts`)
  }

  /** @param {string} key */
  async track(key) {
    const plan = await this.plan()
    let t = this.tracks.get(key)
    if (!t) {
      const tp = plan.tracks.get(key)
      if (!tp) return null
      t = { name: key, dir: path.join(this.dir, key), done: new Set(), jobs: [], lastReq: 0, waiters: new Map(), plan: tp }
      fs.mkdirSync(t.dir, { recursive: true })
      this.tracks.set(key, t)
    }
    return { t, plan }
  }

  /**
   * Espera el segmento `n` de la pista (arrancando ffmpeg si hace falta). Devuelve la ruta del archivo o null.
   * @param {string} key
   * @param {number} n
   * @param {AbortSignal} signal
   */
  async segment(key, n, signal) {
    const got = await this.track(key)
    if (!got) return null
    const { t, plan } = got
    if (n >= plan.boundaries.starts.length) return null
    t.lastReq = n
    this.lastUse = Date.now()
    this.prune(t)
    for (let attempt = 0; attempt < 3 && !this.destroyed; attempt++) {
      if (t.done.has(n)) break
      let job = t.jobs.find((j) => !j.dead && j.from <= n && n < j.to && j.next <= n && n - j.next <= WAIT_AHEAD)
      job ??= this.startJob(t, plan, n)
      await new Promise((resolve) => {
        const set = t.waiters.get(n) ?? new Set()
        t.waiters.set(n, set)
        const done = () => {
          set.delete(done)
          signal.removeEventListener('abort', done)
          resolve(undefined)
        }
        set.add(done)
        signal.addEventListener('abort', done, { once: true })
        job.exited.then(done)
      })
      if (signal.aborted) return null
    }
    if (!t.done.has(n)) throw new Error(`No se pudo hacer el segmento ${key}/${n}`)
    this.lookahead(t, plan)
    return path.join(t.dir, `${n}.ts`)
  }

  /**
   * Prepara lo que viene: el primer segmento que falta cerca de lo último pedido.
   * @param {Track} t
   * @param {Plan} plan
   */
  lookahead(t, plan) {
    if (this.destroyed) return
    const total = plan.boundaries.starts.length
    let m = t.lastReq + 1
    while (m < total && m <= t.lastReq + LOOKAHEAD && t.done.has(m)) m++
    if (m >= total || m > t.lastReq + LOOKAHEAD) return
    if (t.jobs.some((j) => !j.dead && j.next <= m && m < j.to)) return
    this.startJob(t, plan, m)
  }

  /**
   * Corta los ffmpeg que ya no sirven: todo atrás de lo que se mira, muy lejos adelante (quedó de antes de un salto)
   * o muy atrasado (hay otro más cerca).
   * @param {Track} t
   */
  prune(t) {
    const r = t.lastReq
    for (const j of t.jobs) {
      if (j.dead) continue
      if (j.to <= r || j.from > r + LOOKAHEAD + 1 || j.next + WAIT_AHEAD < r) this.kill(j)
    }
    t.jobs = t.jobs.filter((j) => !j.dead)
    // Segmentos guardados: se borran los más lejos de lo que se mira.
    if (t.done.size > KEEP_SEGMENTS) {
      const far = [...t.done].sort((a, b) => Math.abs(b - r) - Math.abs(a - r))
      for (const k of far.slice(0, t.done.size - KEEP_SEGMENTS)) {
        t.done.delete(k)
        fs.rm(path.join(t.dir, `${k}.ts`), { force: true }, () => {})
      }
    }
  }

  /**
   * @param {Track} t
   * @param {Plan} plan
   * @param {number} from
   * @returns {Job}
   */
  startJob(t, plan, from) {
    const total = plan.boundaries.starts.length
    // No más de 2 por pista: el más viejo se corta.
    const alive = t.jobs.filter((j) => !j.dead)
    while (alive.length >= 2) this.kill(/** @type {Job} */ (alive.shift()))
    let to = Math.min(total, from + JOB_SEGMENTS[t.plan.mode])
    // Si más adelante ya está hecho, no se repite.
    for (let k = from + 1; k < to; k++) {
      if (t.done.has(k)) {
        to = k
        break
      }
    }
    const id = ++this.hls.jobSeq
    const prefix = `j${id}-`
    const args = jobArgs({
      input: this.input.url,
      plan,
      track: t.plan,
      from,
      to,
      fileStart: this.fileStart,
      outPattern: path.join(t.dir, `${prefix}%d.ts`),
      hdrTonemap: this.hls.hdrTonemap,
      threads: Math.max(2, os.cpus().length - 1),
    })
    const proc = spawn(this.hls.ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    try {
      if (proc.pid) os.setPriority(proc.pid, os.constants.priority.PRIORITY_BELOW_NORMAL)
    } catch {
      // Sin permiso para cambiarla: sigue igual.
    }
    /** @type {(v?: any) => void} */
    let onExit = () => {}
    /** @type {Job} */
    const job = {
      id, from, to, next: from, proc, dead: false, killed: false, prefix, stderr: '',
      exited: new Promise((resolve) => {
        onExit = resolve
      }),
    }
    t.jobs.push(job)
    const rl = readline.createInterface({ input: /** @type {import('node:stream').Readable} */ (proc.stdout) })
    rl.on('line', (line) => {
      const file = line.split(',')[0]
      const m = /-(\d+)\.ts$/.exec(file)
      if (!m) return
      const k = Number(m[1])
      const src = path.join(t.dir, `${prefix}${k}.ts`)
      if (k >= to || this.destroyed) {
        fs.rm(src, { force: true }, () => {})
        return
      }
      try {
        fs.renameSync(src, path.join(t.dir, `${k}.ts`))
      } catch {
        return
      }
      t.done.add(k)
      job.next = k + 1
      const w = t.waiters.get(k)
      if (w) {
        t.waiters.delete(k)
        for (const fn of [...w]) fn()
      }
    })
    proc.stderr?.on('data', (/** @type {Buffer} */ d) => {
      job.stderr = (job.stderr + d.toString()).slice(-2000)
    })
    proc.on('error', (err) => {
      job.stderr += err.message
    })
    proc.on('close', (code) => {
      job.dead = true
      rl.close()
      if (code !== 0 && !job.killed) this.hls.log(`ffmpeg ${t.name} [${from},${to}) salió con ${code}: ${job.stderr.trim().slice(-400)}`)
      // Restos de este ffmpeg (el segmento a medio hacer).
      fs.readdir(t.dir, (err, names) => {
        if (err) return
        for (const name of names) if (name.startsWith(prefix)) fs.rm(path.join(t.dir, name), { force: true }, () => {})
      })
      onExit()
      if (!job.killed && !this.destroyed) this.lookahead(t, plan)
    })
    return job
  }

  /** @param {Job} j */
  kill(j) {
    if (j.dead) return
    j.killed = true
    j.dead = true
    j.proc.kill('SIGKILL')
  }

  stopJobs() {
    for (const t of this.tracks.values()) for (const j of t.jobs) this.kill(j)
  }

  destroy() {
    this.destroyed = true
    this.ctrl.abort()
    this.stopJobs()
    for (const t of this.tracks.values()) {
      for (const set of t.waiters.values()) for (const fn of [...set]) fn()
    }
    this.tracks.clear()
    fs.rm(this.dir, RM_DIR, () => {})
  }
}

export class Hls {
  /**
   * @param {{
   *   dir: string, ffmpegPath: string, prober: import('./probe.js').Prober, log: (m: string) => void,
   *   inputFor: (mediaURL: string) => Input,
   * }} o
   */
  constructor(o) {
    this.dir = o.dir
    this.ffmpegPath = o.ffmpegPath
    this.prober = o.prober
    this.log = o.log
    this.inputFor = o.inputFor
    this.jobSeq = 0
    this.hdrTonemap = false
    /** @type {Lru<Session>} */
    this.sessions = new Lru(MAX_SESSIONS, (_, s) => s.destroy())
    /** Parámetros de sesiones pasadas: si se borró por inactividad (una pausa larga), se rearma igual. @type {Lru<string>} */
    this.params = new Lru(64)
    this.sweep = setInterval(() => this.closeIdle(), 15_000)
    this.sweep.unref()
    fs.mkdirSync(this.dir, { recursive: true })
    this.detectFilters()
  }

  /** ¿Este ffmpeg tiene zscale + tonemap (HDR → SDR al convertir)? */
  detectFilters() {
    const p = spawn(this.ffmpegPath, ['-hide_banner', '-filters'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
    let out = ''
    p.stdout.on('data', (d) => {
      out += d
    })
    p.on('error', () => {})
    p.on('close', () => {
      this.hdrTonemap = /\szscale\s/.test(out) && /\stonemap\s/.test(out)
    })
  }

  /**
   * La sesión de este id (la misma mientras no cambie el archivo).
   * @param {string} id
   * @param {URLSearchParams} query
   */
  session(id, query) {
    let q = query
    if (!q.get('mediaURL')) {
      const saved = this.params.get(id)
      if (!saved) return null
      q = new URLSearchParams(saved)
    }
    const mediaURL = /** @type {string} */ (q.get('mediaURL'))
    let s = this.sessions.get(id)
    if (s && s.mediaURL !== mediaURL) {
      this.sessions.delete(id)
      s.destroy()
      s = undefined
    }
    if (!s) {
      s = new Session(this, id, mediaURL, q)
      this.sessions.set(id, s)
      this.params.set(id, q.toString())
    }
    s.lastUse = Date.now()
    return s
  }

  closeIdle() {
    const now = Date.now()
    for (const [id, s] of [...this.sessions.map.entries()]) {
      if (now - s.lastUse > SESSION_IDLE_MS) {
        this.sessions.delete(id)
        s.destroy()
      } else if (now - s.lastUse > JOB_IDLE_MS) {
        s.stopJobs()
      }
    }
  }

  close() {
    clearInterval(this.sweep)
    for (const s of this.sessions.map.values()) s.destroy()
    this.sessions.map.clear()
  }
}
