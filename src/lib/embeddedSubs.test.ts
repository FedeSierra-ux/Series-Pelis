import { describe, expect, it } from 'vitest'
import { EMBEDDED_AHEAD_S, EMBEDDED_WINDOW_S, parseVttCues, videoSubLang, videoSubOptions, videoSubWindowUrl, windowsAt } from './embeddedSubs'
import { autoSubtitle, subLangName, type AutoSubContext, type SubOption } from './subtitlePrefs'

const name = (c: string) => subLangName(c, (x) => ({ spa: 'Español', eng: 'Inglés', por: 'Portugués' })[x] ?? x)

describe('videoSubLang', () => {
  it('latino y España según el nombre de la pista', () => {
    expect(videoSubLang('spa', 'Latino')).toBe('spl')
    expect(videoSubLang('spa', 'Spanish (Latin America)')).toBe('spl')
    expect(videoSubLang('spa', 'Español LatAm [Forzados]')).toBe('spl')
    expect(videoSubLang('es-419', null)).toBe('spl')
    expect(videoSubLang('spa', 'Castellano')).toBe('spn')
    expect(videoSubLang('spa', 'Spanish (Spain)')).toBe('spn')
    expect(videoSubLang('spa', null)).toBe('spa')
    expect(videoSubLang(null, 'Español Latino')).toBe('spl')
    expect(videoSubLang('eng', 'English SDH')).toBe('eng')
    expect(videoSubLang(null, null)).toBe('')
  })
})

describe('videoSubOptions', () => {
  const probe = {
    format: { name: 'matroska,webm', duration: 3000 },
    streams: [
      { index: 0, track: 'video', codec: 'h264' },
      { index: 1, track: 'audio', codec: 'eac3', language: 'spa' },
      { index: 2, track: 'subtitle', codec: 'subrip', language: 'spa', title: 'Latino' },
      { index: 3, track: 'subtitle', codec: 'hdmv_pgs_subtitle', language: 'eng' },
      { index: 4, track: 'subtitle', codec: 'ass', language: 'eng', title: 'English SDH', forced: false },
      { index: 5, track: 'subtitle', codec: 'subrip', language: 'spa', title: 'Forzados', forced: true },
      { index: 6, track: 'subtitle', codec: 'mov_text', language: null, title: null },
    ],
  }

  it('solo las de texto, con nombre, latino, forzados y SDH', () => {
    const opts = videoSubOptions(probe, name)
    expect(opts.map((o) => [o.url, o.lang, o.label, !!o.latino, !!o.forced, !!o.sdh, o.embedded])).toEqual([
      ['vid:2', 'spl', 'Español latino (del video)', true, false, false, 2],
      ['vid:4', 'eng', 'Inglés (del video)', false, false, true, 4],
      ['vid:5', 'spa', 'Español (del video)', false, true, false, 5],
      ['vid:6', '', 'Pista 5 (del video)', false, false, false, 6],
    ])
  })

  it('sin pistas o sin índices (Stremio Service): nada', () => {
    expect(videoSubOptions({}, name)).toEqual([])
    expect(videoSubOptions({ streams: [{ track: 'subtitle', codec: 'subrip', language: 'spa' }] }, name)).toEqual([])
  })
})

describe('tramos', () => {
  it('URL del motor', () => {
    expect(videoSubWindowUrl('http://127.0.0.1:5000/tok/', 'http://127.0.0.1:5000/tok/abc/0', 3, 2)).toBe(
      'http://127.0.0.1:5000/tok/subtitles/3/2.vtt?mediaURL=http%3A%2F%2F127.0.0.1%3A5000%2Ftok%2Fabc%2F0',
    )
  })

  it('el actual y, cerca del final, el siguiente (sin pasarse del final)', () => {
    expect(windowsAt(0)).toEqual([0])
    expect(windowsAt(EMBEDDED_WINDOW_S - EMBEDDED_AHEAD_S - 1)).toEqual([0])
    expect(windowsAt(EMBEDDED_WINDOW_S - EMBEDDED_AHEAD_S)).toEqual([0, 1])
    expect(windowsAt(EMBEDDED_WINDOW_S * 3 + 5)).toEqual([3])
    expect(windowsAt(EMBEDDED_WINDOW_S - 10, EMBEDDED_WINDOW_S)).toEqual([0])
    expect(windowsAt(Number.NaN)).toEqual([0])
  })
})

describe('parseVttCues', () => {
  it('tiempos con y sin horas, varios renglones, ids y bloques vacíos', () => {
    const vtt = 'WEBVTT\n\nNOTE algo\n\n00:01.000 --> 00:03.500\nHola <i>mundo</i>\n\nid\n01:02:03.250 --> 01:02:05.000 align:start\n<b>Uno</b>\nDos\n\n00:09.000 --> 00:08.000\nAl revés\n\n00:10.000 --> 00:11.000\n\n'
    expect(parseVttCues(vtt)).toEqual([
      { start: 1, end: 3.5, text: 'Hola <i>mundo</i>' },
      { start: 3723.25, end: 3725, text: '<b>Uno</b>\nDos' },
    ])
    expect(parseVttCues('WEBVTT\n\n')).toEqual([])
  })
})

describe('elección automática con pistas del video', () => {
  const ctx = (over: Partial<AutoSubContext> = {}): AutoSubContext => ({
    autoSubtitles: true,
    subtitleLangs: ['spa', 'eng'],
    audioLangs: ['spa', 'eng'],
    hideSdh: false,
    ...over,
  })
  const online = (lang: string, latino = false): SubOption => ({ url: `https://subs.example/${lang}`, lang, latino, label: `${lang} (online)` })
  const video = (index: number, lang: string, extra: Partial<SubOption> = {}): SubOption => ({ url: `vid:${index}`, lang, embedded: index, ...extra })

  it('el latino del video le gana al latino online; el latino online, al español del video', () => {
    const vidLatino = video(2, 'spl', { latino: true })
    expect(autoSubtitle([online('spl', true), vidLatino], ctx())?.option).toBe(vidLatino)
    const onLatino = online('spl', true)
    expect(autoSubtitle([video(2, 'spa'), onLatino], ctx())?.option).toBe(onLatino)
    // Entre dos españoles neutros, el del video (está sincronizado).
    const vidSpa = video(3, 'spa')
    expect(autoSubtitle([online('spa'), vidSpa], ctx())?.option).toBe(vidSpa)
  })

  it('el de España del video nunca se elige solo', () => {
    expect(autoSubtitle([video(2, 'spn')], ctx())).toBeUndefined()
  })

  it('lo elegido para el título: el latino del video primero', () => {
    const vidLatino = video(2, 'spl', { latino: true })
    expect(autoSubtitle([online('spa'), video(3, 'spa'), vidLatino], ctx({ autoSubtitles: false, pref: { subLang: 'spa', at: 0 } }))?.option).toBe(vidLatino)
  })

  it('forzados en el idioma del audio: primero los del video', () => {
    const vidForced = video(5, 'spa', { forced: true })
    expect(autoSubtitle([{ ...online('spa'), forced: true }, vidForced], ctx({ autoSubtitles: false, audioLang: 'spa' }))?.option).toBe(vidForced)
  })
})
