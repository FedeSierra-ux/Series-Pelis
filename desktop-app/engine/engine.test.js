// @ts-check
// Prueba de punta a punta: un torrent armado acá (sembrado por otro webtorrent con un tracker local) pasa por el
// motor como lo usa la web: create → stats → Range → probe → master → listas → segmentos (que se revisan con ffprobe).
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import { Server as TrackerServer } from 'bittorrent-tracker'
import WebTorrent from 'webtorrent'
import { startEngine } from './index.js'

const run = promisify(execFile)
const FFMPEG = /** @type {string} */ (/** @type {unknown} */ (ffmpegPath))
const FFPROBE = ffprobeStatic.path
const ORIGIN = 'https://app.example'
const CHROME_CAPS = 'videoCodecs=h264&audioCodecs=aac&audioCodecs=mp3&audioCodecs=ac3&audioCodecs=eac3&maxAudioChannels=2'

/** @type {string} */ let tmp
/** @type {string} */ let media
/** @type {string} */ let cacheDir
/** @type {any} */ let tracker
/** @type {any} */ let seeder
/** @type {string} */ let infoHash
/** @type {string} */ let announce
/** @type {{ base: string, close: () => Promise<void> }} */ let engine
/** @type {{ name: string, path: string, length: number }[]} */ let files = []

/** @param {string[]} args */
const ffmpeg = (args) => run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 16 << 20 })

/**
 * Pedido HTTP crudo (fetch no deja mandar `Origin` ni `Host` a gusto).
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: string }} [o]
 * @returns {Promise<{ status: number, headers: http.IncomingHttpHeaders, body: Buffer }>}
 */
function request(url, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: o.method ?? 'GET', headers: o.headers, agent: false }, (res) => {
      /** @type {Buffer[]} */
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(120_000, () => req.destroy(new Error(`timeout ${url}`)))
    req.end(o.body)
  })
}

/** @param {string} url */
async function getJson(url) {
  const r = await request(url)
  assert.equal(r.status, 200, `${url}: ${r.body.toString()}`)
  return JSON.parse(r.body.toString())
}

/** @param {string} url */
async function getText(url) {
  const r = await request(url)
  assert.equal(r.status, 200, `${url}: ${r.body.toString()}`)
  return r.body.toString()
}

/**
 * Baja un segmento y lo mira con ffprobe: códec, canales y el primer cuadro (tiempo y si es keyframe).
 * @param {string} url
 * @param {'v' | 'a'} kind
 */
async function inspectSegment(url, kind) {
  const r = await request(url)
  assert.equal(r.status, 200, `${url}: ${r.body.toString().slice(0, 200)}`)
  assert.ok(r.body.length > 0, 'segmento vacío')
  const file = path.join(tmp, `seg-${Math.random().toString(36).slice(2)}.ts`)
  await fs.promises.writeFile(file, r.body)
  const sel = kind === 'v' ? 'v:0' : 'a:0'
  const { stdout } = await run(FFPROBE, [
    '-v', 'error', '-print_format', 'json', '-select_streams', sel,
    '-show_streams', '-show_frames', '-read_intervals', '%+#1', file,
  ])
  const j = JSON.parse(stdout)
  const s = j.streams?.[0]
  const f = j.frames?.[0]
  assert.ok(s && f, `ffprobe no decodifica ${url}`)
  return {
    codec: s.codec_name,
    channels: Number(s.channels) || undefined,
    pts: Number(f.pkt_pts_time ?? f.pts_time ?? f.best_effort_timestamp_time),
    key: f.key_frame === 1,
    end: await lastFrameEnd(file, sel),
    streams: (await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_streams', file]).then((x) => JSON.parse(x.stdout).streams)).length,
  }
}

/**
 * Dónde termina el último cuadro (pts + duración) de la pista.
 * @param {string} file
 * @param {string} sel
 */
async function lastFrameEnd(file, sel) {
  const { stdout } = await run(FFPROBE, ['-v', 'error', '-select_streams', sel, '-show_entries', 'frame=pkt_pts_time,pkt_duration_time', '-of', 'csv=p=0', file], { maxBuffer: 16 << 20 })
  const rows = stdout.trim().split('\n').map((l) => l.split(',').map(Number)).filter((r) => Number.isFinite(r[0]))
  return Math.max(...rows.map((r) => r[0] + (r[1] || 0)))
}

/** @param {string} m3u8 */
function extinfs(m3u8) {
  return [...m3u8.matchAll(/#EXTINF:([\d.]+)/g)].map((m) => Number(m[1]))
}

/** @param {number[]} d @param {number} n */
const sum = (d, n) => d.slice(0, n).reduce((a, b) => a + b, 0)

/** @param {string} name */
const fileIdx = (name) => {
  const i = files.findIndex((f) => f.name === name)
  assert.ok(i >= 0, `falta ${name}`)
  return i
}

/** @param {string} name */
const localUrl = (name) => `${engine.base}/${infoHash}/${fileIdx(name)}`

describe('motor de punta a punta', { timeout: 300_000 }, () => {
  before(async () => {
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'flix-engine-'))
    media = path.join(tmp, 'Serie S01')
    cacheDir = path.join(tmp, 'cache')
    await fs.promises.mkdir(media)
    const lavfi = (/** @type {string} */ size, /** @type {number} */ rate, /** @type {number} */ secs) => [
      '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=${rate}`,
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
      '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000',
      '-t', String(secs),
    ]
    await Promise.all([
      // MP4 directo: h264 + aac estéreo (B-frames, moov al final).
      ffmpeg([...lavfi('640x360', 30, 12), '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '60', '-bf', '2',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', path.join(media, 'Serie.S01E01.mp4')]),
      // MKV: h264 GOP de 2 s + AC3 5.1 latino + AC3 estéreo en inglés.
      ffmpeg([...lavfi('640x360', 24, 40), '-map', '0:v', '-map', '1:a', '-map', '2:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '48',
        '-pix_fmt', 'yuv420p', '-c:a:0', 'ac3', '-ac:a:0', '6', '-c:a:1', 'ac3', '-ac:a:1', '2',
        '-metadata:s:a:0', 'language=spa', '-metadata:s:a:0', 'title=Latino', '-metadata:s:a:1', 'language=eng',
        path.join(media, 'Serie.S01E02.mkv')]),
      // x265 10 bits + E-AC3 5.1.
      ffmpeg([...lavfi('640x360', 24, 16), '-map', '0:v', '-map', '1:a', '-c:v', 'libx265', '-preset', 'ultrafast',
        '-x265-params', 'log-level=error:keyint=48', '-pix_fmt', 'yuv420p10le', '-c:a', 'eac3', '-ac', '6',
        path.join(media, 'Serie.S01E03.x265.mkv')]),
      fs.promises.writeFile(path.join(media, 'info.txt'), 'hola\n'),
    ])

    tracker = new TrackerServer({ udp: false, http: true, ws: false, stats: false })
    await new Promise((resolve, reject) => {
      tracker.once('error', reject)
      tracker.listen(0, '127.0.0.1', () => resolve(undefined))
    })
    announce = `http://127.0.0.1:${tracker.http.address().port}/announce`

    seeder = new WebTorrent({ dht: false, lsd: false, utp: false, natUpnp: false, natPmp: false, tracker: true })
    const torrent = await new Promise((resolve) => seeder.seed(media, { announce: [announce] }, resolve))
    infoHash = torrent.infoHash

    engine = await startEngine({
      cacheDir,
      allowedOrigins: [ORIGIN, 'https://*.example.dev'],
      ffmpegPath: FFMPEG,
      ffprobePath: FFPROBE,
      dht: false,
      allowLocalTrackers: true,
    })
  })

  after(async () => {
    await engine?.close()
    await new Promise((resolve) => (seeder ? seeder.destroy(() => resolve(undefined)) : resolve(undefined)))
    await new Promise((resolve) => (tracker ? tracker.close(() => resolve(undefined)) : resolve(undefined)))
    await fs.promises.rm(tmp, { recursive: true, force: true })
  })

  it('create espera la metadata y adivina el episodio; stats responde mientras tanto', async () => {
    assert.equal((await request(`${engine.base}/${infoHash}/stats.json`)).status, 404)
    const body = JSON.stringify({
      torrent: { infoHash },
      peerSearch: { sources: [`dht:${infoHash}`, `tracker:${announce}`], min: 40, max: 150 },
      guessFileIdx: { season: 1, episode: 2 },
    })
    const created = request(`${engine.base}/${infoHash}/create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body,
    })
    // stats existe desde que arrancó el create (aunque todavía no haya metadata).
    let stats
    for (let i = 0; i < 50 && !stats; i++) {
      const r = await request(`${engine.base}/${infoHash}/stats.json`)
      if (r.status === 200) stats = JSON.parse(r.body.toString())
      else await new Promise((res) => setTimeout(res, 100))
    }
    assert.ok(stats, 'stats nunca respondió')
    assert.equal(typeof stats.peers, 'number')
    assert.equal(typeof stats.downloadSpeed, 'number')

    const r = await created
    assert.equal(r.status, 200, r.body.toString())
    assert.equal(r.headers['access-control-allow-origin'], ORIGIN)
    const j = JSON.parse(r.body.toString())
    files = j.files
    assert.equal(files.length, 4)
    for (const f of files) assert.equal(typeof f.length, 'number')
    assert.equal(files[j.guessedFileIdx].name, 'Serie.S01E02.mkv')

    const again = JSON.parse((await request(`${engine.base}/${infoHash}/create`, {
      method: 'POST', body: JSON.stringify({ torrent: { infoHash }, guessFileIdx: { season: 1, episode: 3 } }),
    })).body.toString())
    assert.equal(files[again.guessedFileIdx].name, 'Serie.S01E03.x265.mkv')
    const none = JSON.parse((await request(`${engine.base}/${infoHash}/create`, { method: 'POST', body: '{}' })).body.toString())
    assert.equal(typeof none.guessedFileIdx, 'number')
  })

  it('sirve el archivo con Range (bytes iguales al original), HEAD, 416 y -1 = el video más grande', async () => {
    const name = 'Serie.S01E02.mkv'
    const src = await fs.promises.readFile(path.join(media, name))
    const url = localUrl(name)

    const head = await request(url, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(Number(head.headers['content-length']), src.length)
    assert.equal(head.headers['accept-ranges'], 'bytes')
    assert.equal(head.headers['content-type'], 'video/x-matroska')

    const mid = Math.floor(src.length / 2)
    const part = await request(url, { headers: { Range: `bytes=${mid}-${mid + 99_999}` } })
    assert.equal(part.status, 206)
    assert.equal(part.headers['content-range'], `bytes ${mid}-${mid + 99_999}/${src.length}`)
    assert.ok(part.body.equals(src.subarray(mid, mid + 100_000)), 'los bytes del medio no coinciden')

    const first = await request(url, { headers: { Range: 'bytes=0-0' } })
    assert.equal(first.status, 206)
    assert.equal(first.body.length, 1)
    assert.equal(first.body[0], src[0])

    const tail = await request(url, { headers: { Range: 'bytes=-500' } })
    assert.equal(tail.status, 206)
    assert.ok(tail.body.equals(src.subarray(src.length - 500)))

    const whole = await request(url)
    assert.equal(whole.status, 200)
    assert.ok(whole.body.equals(src), 'el archivo entero no coincide')

    assert.equal((await request(url, { headers: { Range: `bytes=${src.length + 10}-` } })).status, 416)

    const largest = files.reduce((best, f, i) => (f.length > files[best].length ? i : best), 0)
    const auto = await request(`${engine.base}/${infoHash}/-1`, { method: 'HEAD' })
    assert.equal(auto.status, 200)
    assert.equal(Number(auto.headers['content-length']), files[largest].length)

    assert.equal((await request(`${engine.base}/${infoHash}/99`, { method: 'HEAD' })).status, 404)
  })

  it('probe describe las pistas', async () => {
    const p = await getJson(`${engine.base}/hlsv2/probe?mediaURL=${encodeURIComponent(localUrl('Serie.S01E02.mkv'))}`)
    assert.match(p.format.name, /matroska/)
    assert.ok(Math.abs(p.format.duration - 40) < 0.5, `duración ${p.format.duration}`)
    const audio = p.streams.filter((/** @type {any} */ s) => s.track === 'audio')
    const video = p.streams.filter((/** @type {any} */ s) => s.track === 'video')
    assert.equal(video.length, 1)
    assert.equal(video[0].codec, 'h264')
    assert.deepEqual(audio.map((/** @type {any} */ a) => [a.codec, a.channels, a.language]), [['ac3', 6, 'spa'], ['ac3', 2, 'eng']])
  })

  it('HLS con copia de video: maestra con dos audios, listas y segmentos que decodifican y encajan', async () => {
    const q = `mediaURL=${encodeURIComponent(localUrl('Serie.S01E02.mkv'))}&${CHROME_CAPS}`
    const root = `${engine.base}/hlsv2/e02`
    const master = await getText(`${root}/master.m3u8?${q}`)
    assert.match(master, /^#EXTM3U/)
    const media = master.split('\n').filter((l) => l.startsWith('#EXT-X-MEDIA:'))
    assert.equal(media.length, 2, master)
    assert.match(media[0], /LANGUAGE="es-419"/)
    assert.match(media[0], /DEFAULT=YES/)
    assert.match(media[1], /LANGUAGE="en"/)
    assert.match(media[1], /DEFAULT=NO/)
    assert.match(master, /#EXT-X-STREAM-INF:.*AUDIO="aud"/)

    const uri = (/** @type {string} */ line) => /** @type {string} */ (/URI="([^"]+)"/.exec(line)?.[1])
    const videoList = await getText(`${root}/${master.split('\n').find((l) => l && !l.startsWith('#'))}`)
    const audioList = await getText(`${root}/${uri(media[0])}`)
    const audio2List = await getText(`${root}/${uri(media[1])}`)
    for (const l of [videoList, audioList, audio2List]) {
      assert.match(l, /#EXT-X-PLAYLIST-TYPE:VOD/)
      assert.match(l, /#EXT-X-ENDLIST/)
    }
    const vd = extinfs(videoList)
    const ad = extinfs(audioList)
    assert.ok(Math.abs(sum(vd, vd.length) - 40) < 0.2, `video suma ${sum(vd, vd.length)}`)
    assert.ok(Math.abs(sum(ad, ad.length) - 40) < 0.2, `audio suma ${sum(ad, ad.length)}`)
    assert.ok(vd.length >= 8, `pocos segmentos: ${vd.length}`)

    const segUri = (/** @type {string} */ list, /** @type {number} */ n) =>
      `${root}/${/** @type {string} */ (list.split('\n').filter((l) => l && !l.startsWith('#'))[n])}`

    // Primero un salto (segmento 6 antes que el 0): otro ffmpeg arranca ahí.
    const v6 = await inspectSegment(segUri(videoList, 6), 'v')
    const v0 = await inspectSegment(segUri(videoList, 0), 'v')
    const v3 = await inspectSegment(segUri(videoList, 3), 'v')
    for (const v of [v0, v3, v6]) {
      assert.equal(v.codec, 'h264')
      assert.ok(v.key, 'el segmento no arranca en keyframe')
      assert.equal(v.streams, 1, 'el segmento de video trae otras pistas')
    }
    assert.ok(Math.abs(v3.pts - v0.pts - sum(vd, 3)) < 0.05, `v3 ${v3.pts} vs v0 ${v0.pts} + ${sum(vd, 3)}`)
    assert.ok(Math.abs(v6.pts - v0.pts - sum(vd, 6)) < 0.05, `v6 ${v6.pts} vs v0 ${v0.pts} + ${sum(vd, 6)}`)
    // El 5 es el último del ffmpeg que arrancó en 0 (frena donde ya estaba el 6): termina justo donde empieza el 6.
    const v5 = await inspectSegment(segUri(videoList, 5), 'v')
    assert.ok(Math.abs(v5.end - v6.pts) < 0.05, `v5 termina en ${v5.end}, v6 empieza en ${v6.pts}`)

    // AC3 5.1 no entra en maxAudioChannels=2 (y AC3 no va copiado en TS): AAC estéreo.
    const a0 = await inspectSegment(segUri(audioList, 0), 'a')
    const a2 = await inspectSegment(segUri(audioList, 2), 'a')
    assert.equal(a0.codec, 'aac')
    assert.equal(a0.channels, 2)
    assert.ok(Math.abs(a0.pts - v0.pts) < 0.1, `audio ${a0.pts} vs video ${v0.pts}`)
    assert.ok(Math.abs(a2.pts - a0.pts - sum(ad, 2)) < 0.1, `a2 ${a2.pts} vs a0 ${a0.pts} + ${sum(ad, 2)}`)
    const b1 = await inspectSegment(segUri(audio2List, 1), 'a')
    assert.equal(b1.codec, 'aac')
    assert.ok(Math.abs(b1.pts - a0.pts - sum(extinfs(audio2List), 1)) < 0.1)

    // Misma id = misma sesión: la maestra se repite igual.
    assert.equal(await getText(`${root}/master.m3u8?${q}`), master)
  })

  it('MP4 h264 + aac: video y audio copiados', async () => {
    const q = `mediaURL=${encodeURIComponent(localUrl('Serie.S01E01.mp4'))}&${CHROME_CAPS}`
    const root = `${engine.base}/hlsv2/e01`
    const master = await getText(`${root}/master.m3u8?${q}`)
    const videoList = await getText(`${root}/${master.split('\n').find((l) => l && !l.startsWith('#'))}`)
    const audioUri = /URI="([^"]+)"/.exec(master)?.[1]
    assert.ok(audioUri, master)
    const audioList = await getText(`${root}/${audioUri}`)
    const seg = (/** @type {string} */ list, /** @type {number} */ n) => `${root}/${list.split('\n').filter((l) => l && !l.startsWith('#'))[n]}`
    const vd = extinfs(videoList)
    const v1 = await inspectSegment(seg(videoList, 1), 'v')
    const v0 = await inspectSegment(seg(videoList, 0), 'v')
    assert.ok(v0.key && v1.key)
    assert.ok(Math.abs(v1.pts - v0.pts - vd[0]) < 0.06, `v1 ${v1.pts} vs v0 ${v0.pts} + ${vd[0]}`)
    const a0 = await inspectSegment(seg(audioList, 0), 'a')
    assert.equal(a0.codec, 'aac')
    assert.equal(a0.channels, 2)
  })

  it('x265: se pasa a H.264 si el navegador no lo entiende y se copia si sí', async () => {
    const mediaURL = encodeURIComponent(localUrl('Serie.S01E03.x265.mkv'))
    const firstSeg = async (/** @type {string} */ id, /** @type {string} */ caps) => {
      const root = `${engine.base}/hlsv2/${id}`
      const master = await getText(`${root}/master.m3u8?mediaURL=${mediaURL}&${caps}`)
      const videoList = await getText(`${root}/${master.split('\n').find((l) => l && !l.startsWith('#'))}`)
      const uris = videoList.split('\n').filter((l) => l && !l.startsWith('#'))
      const d = extinfs(videoList)
      const s0 = await inspectSegment(`${root}/${uris[0]}`, 'v')
      const s2 = await inspectSegment(`${root}/${uris[2]}`, 'v')
      return { master, d, s0, s2 }
    }
    const conv = await firstSeg('e03h264', CHROME_CAPS)
    assert.equal(conv.s0.codec, 'h264')
    assert.ok(conv.s0.key && conv.s2.key)
    assert.ok(Math.abs(conv.s2.pts - conv.s0.pts - sum(conv.d, 2)) < 0.05, `x264 ${conv.s2.pts} vs ${conv.s0.pts} + ${sum(conv.d, 2)}`)

    const copy = await firstSeg('e03hevc', `${CHROME_CAPS}&videoCodecs=hevc`)
    assert.equal(copy.s0.codec, 'hevc')
    assert.ok(copy.s0.key)
  })

  it('una sesión con la misma id y otro archivo se reemplaza', async () => {
    const one = await getText(`${engine.base}/hlsv2/swap/master.m3u8?mediaURL=${encodeURIComponent(localUrl('Serie.S01E01.mp4'))}&${CHROME_CAPS}`)
    const two = await getText(`${engine.base}/hlsv2/swap/master.m3u8?mediaURL=${encodeURIComponent(localUrl('Serie.S01E02.mkv'))}&${CHROME_CAPS}`)
    assert.notEqual(one, two)
    assert.equal(two.split('\n').filter((l) => l.startsWith('#EXT-X-MEDIA:')).length, 2)
  })

  it('no lee direcciones locales ni privadas', async () => {
    for (const bad of ['http://192.168.1.10/a.mkv', 'http://127.0.0.1:9/a.mkv', 'http://localhost/a.mkv', 'http://[::1]/a.mkv',
      'http://10.0.0.1/a.mkv', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'http://user:pw@example.com/a.mkv']) {
      const r = await request(`${engine.base}/hlsv2/probe?mediaURL=${encodeURIComponent(bad)}`)
      assert.equal(r.status, 400, `${bad} → ${r.status}`)
      const m = await request(`${engine.base}/hlsv2/x/master.m3u8?mediaURL=${encodeURIComponent(bad)}`)
      assert.equal(m.status, 400, `${bad} (master) → ${m.status}`)
    }
    // Una URL local del motor con otro token no cuenta como propia.
    const other = `${new URL(engine.base).origin}/${'0'.repeat(32)}/${infoHash}/0`
    assert.equal((await request(`${engine.base}/hlsv2/probe?mediaURL=${encodeURIComponent(other)}`)).status, 400)
  })

  it('CORS solo para los orígenes permitidos (con comodín de un nivel)', async () => {
    const settings = `${engine.base}/settings`
    const ok = await request(settings, { headers: { Origin: ORIGIN } })
    assert.equal(ok.status, 200)
    assert.equal(ok.headers['access-control-allow-origin'], ORIGIN)
    assert.match(String(ok.headers['access-control-expose-headers']), /Content-Range/)

    const wild = await request(settings, { headers: { Origin: 'https://pr-12.example.dev' } })
    assert.equal(wild.status, 200)
    assert.equal(wild.headers['access-control-allow-origin'], 'https://pr-12.example.dev')

    for (const bad of ['https://evil.example', 'https://a.b.example.dev', 'http://pr-12.example.dev', 'https://example.dev', 'null']) {
      const r = await request(settings, { headers: { Origin: bad } })
      assert.equal(r.status, 403, `${bad} → ${r.status}`)
      assert.equal(r.headers['access-control-allow-origin'], undefined)
    }

    const pre = await request(`${engine.base}/${infoHash}/0`, {
      method: 'OPTIONS',
      headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'range', 'Access-Control-Request-Private-Network': 'true' },
    })
    assert.equal(pre.status, 204)
    assert.equal(pre.headers['access-control-allow-origin'], ORIGIN)
    assert.match(String(pre.headers['access-control-allow-headers']), /Range/)
    assert.equal(pre.headers['access-control-allow-private-network'], 'true')

    // Sin Origin (el <video> directo): anda, sin cabeceras CORS.
    const plain = await request(settings)
    assert.equal(plain.status, 200)
    assert.equal(plain.headers['access-control-allow-origin'], undefined)
  })

  it('token o Host equivocados = 404', async () => {
    const u = new URL(engine.base)
    assert.equal((await request(`${u.origin}/${'f'.repeat(32)}/settings`)).status, 404)
    assert.equal((await request(`${u.origin}/settings`)).status, 404)
    assert.equal((await request(`${engine.base}/nada`)).status, 404)
    assert.equal((await request(`${engine.base}/settings`, { headers: { Host: `evil.example:${u.port}` } })).status, 404)
  })

  it('close() corta todo y borra la caché', async () => {
    assert.ok(fs.existsSync(cacheDir))
    await engine.close()
    assert.equal(fs.existsSync(cacheDir), false)
    await assert.rejects(request(`${engine.base}/settings`))
  })
})
