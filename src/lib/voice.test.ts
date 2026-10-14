import { describe, expect, it, vi } from 'vitest'
import { listenOnce, speechRecognitionCtor, VOICE_LANG, voiceErrorText, voiceSupported, type RecognitionLike, type RecognitionResultEvent } from './voice'

/** Reconocedor simulado: guarda la última instancia para "hablarle". */
function mockCtor(opts: { failStart?: boolean } = {}) {
  const instances: FakeRecognition[] = []
  class FakeRecognition implements RecognitionLike {
    lang = ''
    interimResults = false
    continuous = true
    maxAlternatives = 5
    onresult: RecognitionLike['onresult'] = null
    onerror: RecognitionLike['onerror'] = null
    onend: RecognitionLike['onend'] = null
    started = false
    constructor() {
      instances.push(this)
    }
    start() {
      if (opts.failStart) throw new Error('not-allowed')
      this.started = true
    }
    stop() {
      this.onend?.()
    }
    abort() {
      this.onend?.()
    }
    say(parts: [string, boolean][], resultIndex = 0) {
      const results = parts.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal }))
      this.onresult?.({ resultIndex, results } as RecognitionResultEvent)
    }
  }
  return { Ctor: FakeRecognition, instances }
}

describe('soporte', () => {
  it('detecta con y sin prefijo', () => {
    const { Ctor } = mockCtor()
    expect(voiceSupported({ webkitSpeechRecognition: Ctor })).toBe(true)
    expect(speechRecognitionCtor({ SpeechRecognition: Ctor })).toBe(Ctor)
    expect(voiceSupported({})).toBe(false)
    expect(voiceSupported(undefined)).toBe(false)
  })
})

describe('listenOnce', () => {
  it('configura español de Argentina, muestra lo parcial y busca lo final', () => {
    const { Ctor, instances } = mockCtor()
    const onInterim = vi.fn()
    const onFinal = vi.fn()
    const onEnd = vi.fn()
    const stop = listenOnce({ onInterim, onFinal, onEnd }, Ctor)
    const rec = instances[0]
    expect(stop).toBeTypeOf('function')
    expect(rec.started).toBe(true)
    expect(rec.lang).toBe(VOICE_LANG)
    expect(rec.lang).toBe('es-AR')
    expect(rec.interimResults).toBe(true)
    expect(rec.continuous).toBe(false)

    rec.say([['relatos', false]])
    expect(onInterim).toHaveBeenLastCalledWith('relatos')
    rec.say([['relatos  salvajes', true]])
    rec.onend?.()
    expect(onFinal).toHaveBeenCalledWith('relatos salvajes')
    expect(onEnd).toHaveBeenCalledTimes(1)
    // Un segundo "end" no repite la búsqueda.
    rec.onend?.()
    expect(onFinal).toHaveBeenCalledTimes(1)
  })

  it('sin texto final no busca', () => {
    const { Ctor, instances } = mockCtor()
    const onFinal = vi.fn()
    const onError = vi.fn()
    listenOnce({ onFinal, onError }, Ctor)
    instances[0].onerror?.({ error: 'no-speech' })
    instances[0].onend?.()
    expect(onFinal).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(voiceErrorText('no-speech'))
  })

  it('cortar con la función devuelta termina la escucha', () => {
    const { Ctor } = mockCtor()
    const onEnd = vi.fn()
    const stop = listenOnce({ onFinal: () => {}, onEnd }, Ctor)
    stop?.()
    expect(onEnd).toHaveBeenCalled()
  })

  it('si no arranca avisa y no devuelve nada', () => {
    const { Ctor } = mockCtor({ failStart: true })
    const onError = vi.fn()
    const onEnd = vi.fn()
    expect(listenOnce({ onFinal: () => {}, onError, onEnd }, Ctor)).toBeUndefined()
    expect(onError).toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalled()
  })

  it('sin reconocedor no hace nada', () => {
    expect(listenOnce({ onFinal: () => {} }, undefined)).toBeUndefined()
  })
})

describe('voiceErrorText', () => {
  it('"aborted" no se muestra; el resto en castellano', () => {
    expect(voiceErrorText('aborted')).toBeUndefined()
    expect(voiceErrorText('not-allowed')).toMatch(/permiso/)
    expect(voiceErrorText('raro')).toMatch(/voz/)
  })
})
