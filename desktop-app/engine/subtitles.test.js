// @ts-check
// Subtítulos del video por tramos, sobre un MKV de 5 minutos en disco (sin torrent): cada tramo trae solo lo que
// empieza en él, con los tiempos del archivo.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { promisify } from 'node:util'
import ffmpegPath from 'ffmpeg-static'
import { ffprobePath } from '../ffprobe.js'
import { Prober } from './probe.js'
import { SUB_WINDOW_S, Subtitles, dropBefore, isTextSubtitle, subtitleArgs } from './subtitles.js'

const run = promisify(execFile)
const FFMPEG = /** @type {string} */ (/** @type {unknown} */ (ffmpegPath))

describe('subtitleArgs', () => {
  it('el primer tramo sin salto; los demás con -ss; -to siempre en tiempos del archivo', () => {
    const a0 = subtitleArgs({ input: 'http://127.0.0.1:1/t/abc/0', index: 3, n: 0 })
    assert.ok(!a0.includes('-ss'))
    assert.ok(a0.includes('-rw_timeout'))
    assert.deepEqual(a0.slice(a0.indexOf('-copyts'), a0.indexOf('-copyts') + 5), ['-copyts', '-i', 'http://127.0.0.1:1/t/abc/0', '-to', String(SUB_WINDOW_S)])
    assert.equal(a0[a0.indexOf('-map') + 1], '0:3')
    const a2 = subtitleArgs({ input: '/tmp/x.mkv', index: 4, n: 2, window: 60 })
    assert.equal(a2[a2.indexOf('-ss') + 1], '120')
    assert.equal(a2[a2.indexOf('-to') + 1], '180')
    assert.ok(!a2.includes('-rw_timeout'))
    assert.ok(a2.indexOf('-ss') < a2.indexOf('-i'), '-ss tiene que ir antes de -i (salto rápido)')
  })

  it('dropBefore saca lo que empieza antes del tramo (con o sin horas, con id de cue)', () => {
    const vtt = 'WEBVTT\n\n01:58.000 --> 02:01.000\nViejo\n\nid7\n02:00.000 --> 02:02.000\nJusto\n\n01:02:03.500 --> 01:02:05.000\nTarde\n'
    assert.equal(dropBefore(vtt, 120), 'WEBVTT\n\nid7\n02:00.000 --> 02:02.000\nJusto\n\n01:02:03.500 --> 01:02:05.000\nTarde\n')
    assert.equal(dropBefore(vtt, 0), vtt)
    assert.equal(dropBefore('WEBVTT\n\n', 240), 'WEBVTT\n\n')
  })

  it('isTextSubtitle: solo pistas de texto que existen', () => {
    const probe = /** @type {any} */ ({
      format: {},
      streams: [
        { index: 0, track: 'video', codec: 'h264' },
        { index: 2, track: 'subtitle', codec: 'subrip' },
        { index: 3, track: 'subtitle', codec: 'hdmv_pgs_subtitle' },
        { index: 4, track: 'subtitle', codec: 'ass' },
      ],
    })
    assert.equal(isTextSubtitle(probe, 2), true)
    assert.equal(isTextSubtitle(probe, 4), true)
    assert.equal(isTextSubtitle(probe, 3), false)
    assert.equal(isTextSubtitle(probe, 0), false)
    assert.equal(isTextSubtitle(probe, 7), false)
  })
})

describe('Subtitles por tramos', { timeout: 120_000 }, () => {
  /** @type {string} */ let tmp
  /** @type {string} */ let file
  /** @type {Prober} */ let prober
  /** @type {Subtitles} */ let subs

  before(async () => {
    tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'flix-subs-'))
    const srt = path.join(tmp, 'a.srt')
    const two = (/** @type {number} */ x) => String(x).padStart(2, '0')
    const ts = (/** @type {number} */ t) => `00:${two(Math.floor(t / 60))}:${two(t % 60)},000`
    // Uno cada 10 s, del 5 al 295, y uno que cruza el borde del primer tramo (119 → 122).
    const cues = Array.from({ length: 30 }, (_, i) => i * 10 + 5).map((t) => [t, t + 2, `Línea ${t}`])
    cues.push([119, 122, 'Borde'])
    cues.sort((a, b) => Number(a[0]) - Number(b[0]))
    await fs.promises.writeFile(srt, cues.map(([a, b, t], i) => `${i + 1}\n${ts(Number(a))} --> ${ts(Number(b))}\n${t}\n`).join('\n'))
    file = path.join(tmp, 'peli.mkv')
    await run(FFMPEG, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440', '-i', srt, '-t', '300',
      '-map', '0:v', '-map', '1:a', '-map', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '48', '-c:a', 'aac', '-c:s', 'srt',
      file,
    ])
    prober = new Prober(ffprobePath())
    subs = new Subtitles({ ffmpegPath: FFMPEG, prober })
  })

  after(async () => {
    subs?.close()
    prober?.close()
    await fs.promises.rm(tmp, { recursive: true, force: true })
  })

  /** @param {string} vtt */
  const starts = (vtt) => [...vtt.matchAll(/^(\d\d):(\d\d)\.(\d{3}) -->/gm)].map((m) => Number(m[1]) * 60 + Number(m[2]))

  it('cada subtítulo sale en el tramo donde empieza, una sola vez', async () => {
    const input = { key: 'f:peli', url: file }
    const all = []
    for (let n = 0; n < 3; n++) {
      const vtt = await subs.window(input, 2, n)
      assert.match(vtt, /^WEBVTT/)
      const s = starts(vtt)
      for (const t of s) assert.ok(t >= n * SUB_WINDOW_S && t < (n + 1) * SUB_WINDOW_S, `tramo ${n}: ${t}`)
      all.push(...s)
    }
    assert.deepEqual(all, [...Array.from({ length: 30 }, (_, i) => i * 10 + 5), 119].sort((a, b) => a - b))
    assert.match(await subs.window(input, 2, 0), /01:59\.000 --> 02:02\.000\nBorde/)
    // Pasado el final: vacío y sin ffmpeg.
    assert.equal(await subs.window(input, 2, 3), 'WEBVTT\n\n')
    await assert.rejects(subs.window(input, 1, 0), (/** @type {any} */ err) => err.status === 404)
  })
})
