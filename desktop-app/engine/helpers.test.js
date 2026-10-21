// @ts-check
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { episodeTags, guessFileIdx } from './files.js'
import { capsFromQuery, chooseModes, jobArgs } from './hls.js'
import { checkPublicUrl, isPrivateIp } from './net.js'
import { audioRenditions, gridBoundaries, keyframeBoundaries, masterPlaylist, mediaPlaylist, scaledSize, segmentTimes } from './playlist.js'
import { trackersFrom } from './torrents.js'
import { Lru, newToken, originAllowed, parseRange, parseRoute } from './util.js'

const T = 'a'.repeat(32)
const H = '0123456789abcdef0123456789abcdef01234567'

test('token: 32 hex', () => {
  assert.match(newToken(), /^[0-9a-f]{32}$/)
  assert.notEqual(newToken(), newToken())
})

test('rutas', () => {
  assert.deepEqual(parseRoute(`/${T}/${H}/create`, T), { kind: 'create', hash: H })
  assert.deepEqual(parseRoute(`/${T}/${H.toUpperCase()}/stats.json`, T), { kind: 'stats', hash: H })
  assert.deepEqual(parseRoute(`/${T}/${H}/-1`, T), { kind: 'file', hash: H, idx: -1 })
  assert.deepEqual(parseRoute(`/${T}/${H}/12`, T), { kind: 'file', hash: H, idx: 12 })
  assert.deepEqual(parseRoute(`/${T}/hlsv2/probe`, T), { kind: 'probe' })
  assert.deepEqual(parseRoute(`/${T}/hlsv2/abc123/master.m3u8`, T), { kind: 'master', id: 'abc123' })
  assert.deepEqual(parseRoute(`/${T}/hlsv2/abc/video.m3u8`, T), { kind: 'playlist', id: 'abc', track: 'video' })
  assert.deepEqual(parseRoute(`/${T}/hlsv2/abc/audio1.m3u8`, T), { kind: 'playlist', id: 'abc', track: 'audio1' })
  assert.deepEqual(parseRoute(`/${T}/hlsv2/abc/v/7.ts`, T), { kind: 'segment', id: 'abc', track: 'v', n: 7 })
  assert.deepEqual(parseRoute(`/${T}/hlsv2/abc/a0/0.ts`, T), { kind: 'segment', id: 'abc', track: 'a0', n: 0 })
  // Token mal, rutas raras, índices inválidos.
  assert.equal(parseRoute(`/${'b'.repeat(32)}/${H}/create`, T), null)
  assert.equal(parseRoute(`/${T.slice(1)}/${H}/create`, T), null)
  assert.equal(parseRoute(`/${H}/create`, T), null)
  assert.equal(parseRoute(`/${T}/${H}/-2`, T), null)
  assert.equal(parseRoute(`/${T}/${H}/01`, T), null)
  assert.equal(parseRoute(`/${T}/${H.slice(1)}/0`, T), null)
  assert.equal(parseRoute(`/${T}/hlsv2/abc/../master.m3u8`, T), null)
  assert.equal(parseRoute(`/${T}/hlsv2/abc/v/x.ts`, T), null)
  assert.equal(parseRoute(`/${T}/hlsv2/abc/audiox.m3u8`, T), null)
  assert.equal(parseRoute(`/${T}//${H}/0`, T), null)
})

test('Range', () => {
  assert.equal(parseRange(undefined, 100), null)
  assert.deepEqual(parseRange('bytes=0-', 100), { start: 0, end: 99 })
  assert.deepEqual(parseRange('bytes=0-0', 100), { start: 0, end: 0 })
  assert.deepEqual(parseRange('bytes=10-200', 100), { start: 10, end: 99 })
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 })
  assert.equal(parseRange('bytes=100-', 100), 'invalid')
  assert.equal(parseRange('bytes=5-2', 100), 'invalid')
  assert.equal(parseRange('items=0-1', 100), 'invalid')
  assert.equal(parseRange('bytes=0-1,5-6', 100), null)
})

test('CORS: exactos y comodín de una etiqueta, solo https', () => {
  const allowed = ['https://series-pelis.pages.dev', 'https://*.series-pelis.pages.dev', 'http://localhost:5173']
  assert.ok(originAllowed('https://series-pelis.pages.dev', allowed))
  assert.ok(originAllowed('https://abc123.series-pelis.pages.dev', allowed))
  assert.ok(originAllowed('https://feat-x.series-pelis.pages.dev', allowed))
  assert.ok(originAllowed('http://localhost:5173', allowed))
  assert.ok(!originAllowed('https://a.b.series-pelis.pages.dev', allowed))
  assert.ok(!originAllowed('http://abc.series-pelis.pages.dev', allowed))
  assert.ok(!originAllowed('https://evil-series-pelis.pages.dev', allowed))
  assert.ok(!originAllowed('https://series-pelis.pages.dev.evil.com', allowed))
  assert.ok(!originAllowed('https://-x.series-pelis.pages.dev', allowed))
  assert.ok(!originAllowed('null', allowed))
  assert.ok(!originAllowed(undefined, allowed))
  assert.ok(!originAllowed('http://localhost:5174', allowed))
})

test('IPs privadas', () => {
  for (const ip of [
    '127.0.0.1', '10.1.2.3', '192.168.0.1', '172.16.5.4', '172.31.255.255', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1',
    '::ffff:7f00:1', '::ffff:192.168.1.1', '64:ff9b::a00:1', '64:ff9b::10.0.0.1', '2002:c0a8:101::1', '2001:db8::1',
    '2001:0:4136:e378::1', 'fe80::1%eth0', '::127.0.0.1', 'basura', '1.2.3', '300.1.1.1',
  ]) {
    assert.ok(isPrivateIp(ip), ip)
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700::1111', '2a00:1450:4001::200e', '::ffff:8.8.8.8', '64:ff9b::808:808', '2002:808:808::1']) {
    assert.ok(!isPrivateIp(ip), ip)
  }
})

test('URLs públicas', () => {
  assert.equal(checkPublicUrl('https://cdn.example.com/a.mkv').hostname, 'cdn.example.com')
  for (const bad of [
    'ftp://example.com/a', 'file:///etc/passwd', 'http://127.0.0.1:11470/x', 'http://localhost/x', 'http://foo.localhost/x',
    'http://[::1]/x', 'http://2130706433/x', 'http://0x7f.0.0.1/x', 'http://192.168.0.10/x', 'http://router/x',
    'https://user:pass@example.com/x', 'http://[::ffff:10.0.0.1]/x', 'http://printer.local/x', 'no es url',
  ]) {
    assert.throws(() => checkPublicUrl(bad), bad)
  }
})

test('trackers de peerSearch', () => {
  const t = trackersFrom([
    'dht:abc', 'tracker:udp://tracker.opentrackr.org:1337/announce', 'tracker:http://t.example.com/announce',
    'tracker:wss://tracker.webtorrent.dev', 'tracker:http://127.0.0.1:8000/announce', 'tracker:udp://192.168.1.1:6969', 'nada', 5,
  ])
  assert.deepEqual(t, ['udp://tracker.opentrackr.org:1337/announce', 'http://t.example.com/announce'])
  assert.deepEqual(trackersFrom(['tracker:http://127.0.0.1:8000/announce'], true), ['http://127.0.0.1:8000/announce'])
  assert.deepEqual(trackersFrom(undefined), [])
})

test('episodios en el nombre', () => {
  assert.deepEqual(episodeTags('Show.S01E02.1080p.mkv'), [{ season: 1, episodes: [2] }])
  assert.deepEqual(episodeTags('show s02 e10 x265.mkv'), [{ season: 2, episodes: [10] }])
  assert.deepEqual(episodeTags('Show.S01E01E02.mkv'), [{ season: 1, episodes: [1, 2] }])
  assert.deepEqual(episodeTags('Show.S01E01-E03.mkv'), [{ season: 1, episodes: [1, 3, 2] }])
  assert.deepEqual(episodeTags('Show 3x07 - Title.avi'), [{ season: 3, episodes: [7] }])
  assert.deepEqual(episodeTags('Show/Season 2/Episode 05.mkv'), [{ season: 2, episodes: [5] }])
  assert.deepEqual(episodeTags('Movie.1920x1080.x264.mkv'), [])
})

test('qué archivo se reproduce', () => {
  const files = [
    { path: 'Show/Show.S01E01.mkv', length: 900 },
    { path: 'Show/Show.S01E02.mkv', length: 800 },
    { path: 'Show/Show.S02E02.mkv', length: 950 },
    { path: 'Show/sample/Show.S01E02.sample.mkv', length: 10 },
    { path: 'Show/info.nfo', length: 5 },
    { path: 'Show/Show.S01E03.mp4', length: 700 },
  ]
  assert.equal(guessFileIdx(files, { season: 1, episode: 2 }), 1)
  assert.equal(guessFileIdx(files, { season: 2, episode: 2 }), 2)
  assert.equal(guessFileIdx(files, { season: 1, episode: 3 }), 5)
  assert.equal(guessFileIdx(files, { episode: 1 }), 0)
  // Sin coincidencia o sin datos: el video más grande (no la muestra).
  assert.equal(guessFileIdx(files, { season: 9, episode: 9 }), 2)
  assert.equal(guessFileIdx(files, false), 2)
  assert.equal(guessFileIdx([{ name: 'Movie.mkv', length: 5 }, { name: 'Movie-sample.mkv', length: 9 }], {}), 0)
  assert.equal(guessFileIdx([{ name: 'a.txt', length: 5 }, { name: 'b.nfo', length: 9 }], {}), 1)
  assert.equal(guessFileIdx([], {}), -1)
})

test('cortes en keyframes', () => {
  const kf = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]
  const b = /** @type {NonNullable<ReturnType<typeof keyframeBoundaries>>} */ (keyframeBoundaries(kf, 20))
  assert.deepEqual(b.starts, [0, 4, 8, 12, 16])
  assert.deepEqual(b.cuts, [0, 3.8, 7.8, 11.8, 15.8])
  // GOP largo e irregular, último segmento muy corto se suma al anterior.
  const b2 = /** @type {NonNullable<ReturnType<typeof keyframeBoundaries>>} */ (keyframeBoundaries([0, 10, 10.1, 20, 30], 30.5))
  assert.deepEqual(b2.starts, [0, 10, 20])
  assert.equal(b2.end, 30.5)
  assert.ok(Math.abs(b2.cuts[1] - 9.8) < 1e-9)
  // Keyframes pegados: el margen no pasa el anterior.
  const b3 = /** @type {NonNullable<ReturnType<typeof keyframeBoundaries>>} */ (keyframeBoundaries([0, 3.9, 4.0, 8], 12))
  assert.deepEqual(b3.starts, [0, 4, 8])
  assert.ok(b3.cuts[1] > 3.9 && b3.cuts[1] < 4)
  assert.equal(keyframeBoundaries([], 10), null)
  assert.deepEqual(segmentTimes(b, 1, 4, false), ['3.800000', '7.800000', '11.800000'])
  assert.deepEqual(segmentTimes(b, 1, 3, true), ['4.000000', '8.000000'])
})

test('grilla fija', () => {
  const g = /** @type {NonNullable<ReturnType<typeof gridBoundaries>>} */ (gridBoundaries(0.5, 13))
  assert.deepEqual(g.starts, [0.5, 4.5, 8.5])
  assert.equal(g.end, 13)
  assert.deepEqual(g.cuts, [0.5, 4.3, 8.3])
  const g2 = /** @type {NonNullable<ReturnType<typeof gridBoundaries>>} */ (gridBoundaries(0, 12.5))
  assert.deepEqual(g2.starts, [0, 4, 8])
  assert.equal(gridBoundaries(0, NaN), null)
})

test('listas', () => {
  const b = /** @type {NonNullable<ReturnType<typeof keyframeBoundaries>>} */ (keyframeBoundaries([0, 4, 8.5], 10))
  const pl = mediaPlaylist(b, (n) => `v/${n}.ts`)
  assert.match(pl, /^#EXTM3U\n/)
  assert.match(pl, /#EXT-X-TARGETDURATION:5\n/)
  assert.match(pl, /#EXT-X-PLAYLIST-TYPE:VOD/)
  assert.match(pl, /#EXTINF:4\.000000,\nv\/0\.ts\n#EXTINF:4\.500000,\nv\/1\.ts\n#EXTINF:1\.500000,\nv\/2\.ts\n#EXT-X-ENDLIST/)

  const r = audioRenditions([
    { language: 'eng', title: null, default: false },
    { language: 'spa', title: 'Latino', default: true },
    { language: 'spa', title: 'Castellano', default: false },
    { language: null, title: 'SoundHandler', default: false },
    { language: 'eng', title: null, default: false },
  ])
  assert.deepEqual(r, [
    { name: 'Inglés', language: 'en', isDefault: false },
    { name: 'Latino', language: 'es-419', isDefault: true },
    { name: 'Castellano', language: 'es', isDefault: false },
    { name: 'Audio 4', language: null, isDefault: false },
    { name: 'Inglés (2)', language: 'en', isDefault: false },
  ])
  // Sin pista por defecto: la primera.
  assert.equal(audioRenditions([{ language: 'jpn', title: null, default: false }])[0].isDefault, true)

  const m = masterPlaylist({ video: true, renditions: r.slice(0, 2), bandwidth: 5e6, resolution: '1920x1080', query: 'mediaURL=x' })
  assert.match(m, /#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Inglés",LANGUAGE="en",DEFAULT=NO,AUTOSELECT=YES,URI="audio0.m3u8\?mediaURL=x"/)
  assert.match(m, /NAME="Latino",LANGUAGE="es-419",DEFAULT=YES/)
  assert.match(m, /#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO="aud"\nvideo.m3u8\?mediaURL=x\n/)
  const onlyAudio = masterPlaylist({ video: false, renditions: r.slice(0, 2), bandwidth: 2e5, query: '' })
  assert.match(onlyAudio, /#EXT-X-STREAM-INF:BANDWIDTH=200000\naudio1.m3u8\n/)
  assert.doesNotMatch(onlyAudio, /EXT-X-MEDIA/)
})

test('tamaño convertido', () => {
  assert.deepEqual(scaledSize(3840, 2160), { w: 1920, h: 1080 })
  assert.deepEqual(scaledSize(3840, 1600), { w: 1920, h: 800 })
  assert.deepEqual(scaledSize(1280, 720), { w: 1280, h: 720 })
  assert.deepEqual(scaledSize(1440, 1080), { w: 1440, h: 1080 })
  assert.equal(scaledSize(0, 0), undefined)
})

/** @param {Partial<import('./probe.js').ProbeStream>} s */
const st = (s) => /** @type {import('./probe.js').ProbeStream} */ ({ index: 0, language: null, title: null, default: false, codec: null, ...s })

test('copiar o convertir', () => {
  const caps = capsFromQuery(new URLSearchParams('videoCodecs=h264&audioCodecs=aac&audioCodecs=mp3&audioCodecs=ac3&maxAudioChannels=2'))
  assert.deepEqual(caps, { videoCodecs: ['h264'], audioCodecs: ['aac', 'mp3', 'ac3'], maxAudioChannels: 2 })
  const probe = (/** @type {any[]} */ streams) => ({ format: { name: 'matroska,webm', duration: 10, startTime: 0, bitRate: null }, streams })
  const h264 = st({ index: 0, track: 'video', codec: 'h264', pixFmt: 'yuv420p' })
  const ac3 = st({ index: 1, track: 'audio', codec: 'ac3', channels: 6 })
  const aac2 = st({ index: 2, track: 'audio', codec: 'aac', channels: 2 })
  const aac6 = st({ index: 3, track: 'audio', codec: 'aac', channels: 6 })
  let m = chooseModes(probe([h264, ac3, aac2, aac6]), caps, true)
  assert.equal(m.videoMode, 'copy')
  // AC3 no va en TS para hls.js; AAC 5.1 supera los 2 canales.
  assert.deepEqual(m.audioModes, ['aac', 'copy', 'aac'])
  // Sin índice: se convierte el video y entonces el audio también (el salto no caería en el keyframe).
  m = chooseModes(probe([h264, aac2]), caps, false)
  assert.equal(m.videoMode, 'x264')
  assert.deepEqual(m.audioModes, ['aac'])
  // HEVC solo si el navegador lo dice; H.264 de 10 bits nunca.
  const hevc = st({ index: 0, track: 'video', codec: 'hevc', pixFmt: 'yuv420p10le' })
  assert.equal(chooseModes(probe([hevc]), caps, true).videoMode, 'x264')
  assert.equal(chooseModes(probe([hevc]), capsFromQuery(new URLSearchParams('videoCodecs=h264&videoCodecs=h265')), true).videoMode, 'copy')
  assert.equal(chooseModes(probe([st({ track: 'video', codec: 'h264', pixFmt: 'yuv420p10le' })]), caps, true).videoMode, 'x264')
  assert.equal(chooseModes(probe([st({ track: 'video', codec: 'vp9' })]), capsFromQuery(new URLSearchParams('videoCodecs=vp9')), true).videoMode, 'x264')
  // Solo audio.
  m = chooseModes(probe([aac2]), caps, true)
  assert.equal(m.videoMode, null)
  assert.deepEqual(m.audioModes, ['copy'])
  // Sin audioCodecs: AAC.
  assert.deepEqual(capsFromQuery(new URLSearchParams('')).audioCodecs, ['aac'])
})

test('argumentos de ffmpeg', () => {
  const b = /** @type {NonNullable<ReturnType<typeof keyframeBoundaries>>} */ (keyframeBoundaries([0, 2, 4, 6, 8, 10, 12, 14, 16, 18], 20))
  const plan = { boundaries: b, keyframes: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18], tracks: new Map() }
  const video = { kind: /** @type {const} */ ('video'), stream: st({ index: 0, track: 'video', codec: 'h264', width: 3840, height: 2160 }), mode: /** @type {const} */ ('copy') }
  let a = jobArgs({ input: 'http://127.0.0.1:1/t/x/0', plan, track: video, from: 1, to: 3, fileStart: -0.005, outPattern: 'v/j1-%d.ts', hdrTonemap: false, threads: 3 })
  const at = (/** @type {string} */ k) => a[a.indexOf(k) + 1]
  assert.equal(at('-ss'), '4.055000')
  assert.equal(at('-t'), (12 - 0.001 - 4.05).toFixed(6))
  assert.equal(at('-c:v'), 'copy')
  assert.equal(at('-segment_times'), '3.800000')
  assert.equal(at('-segment_start_number'), '1')
  assert.equal(at('-map'), '0:0')
  assert.ok(a.includes('-copyts') && a.indexOf('-copyts') < a.indexOf('-i'))
  // Último tramo: sin -t. Convertido: IDR forzados en los cortes, 1080p como mucho.
  a = jobArgs({ input: 'x.mkv', plan, track: { ...video, mode: 'x264' }, from: 3, to: 5, fileStart: 0, outPattern: 'o', hdrTonemap: false, threads: 3 })
  assert.equal(a.indexOf('-t'), -1)
  assert.equal(at('-ss'), '12.000000')
  assert.equal(at('-c:v'), 'libx264')
  assert.equal(at('-force_key_frames'), '16.000000')
  assert.equal(at('-vf'), 'scale=1920:1080,format=yuv420p')
  // Desde el principio: sin -ss.
  a = jobArgs({ input: 'x.mkv', plan, track: { kind: 'audio', stream: st({ index: 2, track: 'audio' }), mode: 'aac' }, from: 0, to: 2, fileStart: 0, outPattern: 'o', hdrTonemap: false, threads: 3 })
  assert.equal(a.indexOf('-ss'), -1)
  assert.equal(at('-segment_times'), '4.000000')
  assert.equal(at('-ac'), '2')
})

test('Lru', () => {
  /** @type {string[]} */
  const out = []
  const l = new Lru(2, (k) => out.push(k))
  l.set('a', 1)
  l.set('b', 2)
  l.get('a')
  l.set('c', 3)
  assert.deepEqual(out, ['b'])
  assert.equal(l.get('a'), 1)
})
