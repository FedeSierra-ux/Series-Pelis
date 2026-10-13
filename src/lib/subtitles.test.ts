import { describe, expect, it } from 'vitest'
import { addonSubOption, autoSubtitle, guessAudioLang, looksSdh, type AutoSubContext, type SubOption } from './subtitlePrefs'
import { assToVtt, srtToVtt, stripSdh, toVtt } from './subtitles'

describe('conversión a VTT', () => {
  it('SRT', () => {
    expect(srtToVtt('1\r\n00:00:01,000 --> 00:00:02,500\r\nHola\r\n')).toBe('WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\nHola\n')
  })

  it('SRT con la hora de un solo dígito', () => {
    expect(srtToVtt('1\n0:00:01,000 --> 0:00:03,000\nHola\n')).toBe('WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\nHola\n')
    expect(srtToVtt('1\n1:02:03,400 --> 10:02:04,500\nHola\n')).toBe('WEBVTT\n\n1\n01:02:03.400 --> 10:02:04.500\nHola\n')
  })

  it('ASS/SSA básico, sin estilos', () => {
    const ass = [
      '[Script Info]',
      'Title: prueba',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname',
      'Style: Default,Arial',
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:05.10,0:00:07.00,Default,,0,0,0,,{\\i1}Segunda{\\i0}, con coma',
      'Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,Primera\\Nlínea',
      'Dialogue: 0,0:00:08.00,0:00:09.00,Default,,0,0,0,,{\\p1}m 0 0 l 100 0',
    ].join('\n')
    expect(assToVtt(ass)).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nPrimera\nlínea\n\n00:00:05.100 --> 00:00:07.000\nSegunda, con coma\n')
    expect(toVtt(ass, 'algo.ass')).toBe(assToVtt(ass))
    expect(toVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nYa es VTT\n')).toContain('Ya es VTT')
  })
})

describe('stripSdh', () => {
  it('saca sonidos, canciones y nombres de quien habla', () => {
    const vtt = [
      'WEBVTT',
      '',
      '1',
      '00:00:01.000 --> 00:00:02.000',
      '[música tensa]',
      '',
      '00:00:03.000 --> 00:00:04.000',
      '(risas) ¡Qué bueno!',
      '',
      '00:00:05.000 --> 00:00:06.000',
      '♪ La la la ♪',
      '',
      '00:00:07.000 --> 00:00:08.000',
      'JUAN: Hola.',
      '- [suspira]',
      '',
      '00:00:09.000 --> 00:00:10.000',
      '<i>[trueno]</i>',
      '',
    ].join('\n')
    expect(stripSdh(vtt)).toBe('WEBVTT\n\n00:00:03.000 --> 00:00:04.000\n¡Qué bueno!\n\n00:00:07.000 --> 00:00:08.000\nHola.\n')
  })

  it('deja el diálogo normal como está', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n- ¿Vamos?\n- Sí, dale.\n'
    expect(stripSdh(vtt)).toBe(vtt)
  })

  it('no confunde "NO:", "SÍ:" u "OK:" con el nombre de quien habla', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nNO: no vayas.\n- SÍ: ya lo sé.\n\n00:00:03.000 --> 00:00:04.000\nOK: dale.\n\n00:00:05.000 --> 00:00:06.000\nANA: ¿Vamos?\n- EH: ¿qué?\n'
    expect(stripSdh(vtt)).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nNO: no vayas.\n- SÍ: ya lo sé.\n\n00:00:03.000 --> 00:00:04.000\nOK: dale.\n\n00:00:05.000 --> 00:00:06.000\n¿Vamos?\n- EH: ¿qué?\n')
  })
})

const sub = (lang: string, extra: Partial<SubOption> = {}): SubOption => ({ url: `https://subs.example/${lang}-${extra.id ?? ''}`, lang, ...extra })
const ctx = (over: Partial<AutoSubContext> = {}): AutoSubContext => ({
  autoSubtitles: false,
  subtitleLangs: ['spa', 'eng'],
  audioLangs: ['spa', 'eng'],
  hideSdh: false,
  ...over,
})

describe('autoSubtitle', () => {
  const subs = [sub('eng'), sub('spa', { id: 'forced', forced: true }), sub('spa'), sub('por')]

  it('sin subtítulos automáticos ni forzados no activa nada', () => {
    expect(autoSubtitle(subs, ctx())).toBeUndefined()
  })

  it('con automáticos elige el primer idioma, el completo antes que el forzado', () => {
    expect(autoSubtitle(subs, ctx({ autoSubtitles: true }))?.option).toBe(subs[2])
  })

  it('lo elegido para el título le gana a Ajustes', () => {
    expect(autoSubtitle(subs, ctx({ autoSubtitles: true, pref: { subLang: 'por', at: 0 } }))?.option).toBe(subs[3])
    expect(autoSubtitle(subs, ctx({ pref: { subLang: 'eng', at: 0 } }))?.option).toBe(subs[0])
    // "Sin subtítulos" en este título apaga los automáticos.
    expect(autoSubtitle(subs, ctx({ autoSubtitles: true, pref: { subOff: true, at: 0 } }))).toBeUndefined()
  })

  it('forzados en el idioma del audio cuando no hay otro activo', () => {
    expect(autoSubtitle(subs, ctx({ audioLang: 'es' }))?.option).toBe(subs[1])
    expect(autoSubtitle(subs, ctx({ audioLang: 'spa', pref: { subOff: true, at: 0 } }))?.option).toBe(subs[1])
    // Audio en un idioma que no está entre los preferidos: nada.
    expect(autoSubtitle(subs, ctx({ audioLang: 'jpn' }))).toBeUndefined()
    // Audio en inglés pero sin forzados en inglés.
    expect(autoSubtitle(subs, ctx({ audioLang: 'eng' }))).toBeUndefined()
  })

  it('oculta los SDH si se pide', () => {
    const list = [sub('spa', { id: 'SDH', sdh: true }), sub('spa', { id: 'normal' })]
    expect(autoSubtitle(list, ctx({ autoSubtitles: true, hideSdh: true }))?.option).toBe(list[1])
    expect(autoSubtitle(list, ctx({ autoSubtitles: true }))?.option).toBe(list[0])
  })

  it('nunca elige solo un archivo propio', () => {
    expect(autoSubtitle([sub('spa', { file: true })], ctx({ autoSubtitles: true }))).toBeUndefined()
  })
})

describe('marcas de los subtítulos', () => {
  it('SDH y forzados según id o URL', () => {
    expect(addonSubOption({ id: 'Spanish (SDH)', url: 'https://x/1.srt', lang: 'spa' }).sdh).toBe(true)
    expect(addonSubOption({ id: '123', url: 'https://x/eng.hi.srt', lang: 'eng' }).sdh).toBe(false)
    expect(looksSdh('English HI')).toBe(true)
    expect(addonSubOption({ id: '123', url: 'https://x/spa.forced.srt', lang: 'spa' }).forced).toBe(true)
    expect(addonSubOption({ id: '123', url: 'https://x/spa.srt', lang: 'spa' }).forced).toBe(false)
  })

  it('idioma del audio según el nombre del stream', () => {
    expect(guessAudioLang({ name: 'Addon', title: 'Peli 1080p Latino' })).toBe('spa')
    expect(guessAudioLang({ name: 'Addon', title: 'Peli 1080p Dual Latino-Inglés' })).toBeUndefined()
    expect(guessAudioLang({ name: 'Addon', title: 'Peli 1080p' })).toBeUndefined()
  })
})
