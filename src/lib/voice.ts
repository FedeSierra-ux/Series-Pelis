// Búsqueda por voz (v0.14) con la Web Speech API. Solo existe en algunos navegadores (Chrome de escritorio
// y Android, Edge, Safari); en el resto el micrófono no se muestra. Sin dependencias de React para probarla
// con un reconocedor simulado.

export const VOICE_LANG = 'es-AR'

/** Lo mínimo que usamos de `SpeechRecognition` (los tipos de TypeScript no lo traen). */
export interface RecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((e: RecognitionResultEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

export interface RecognitionResultEvent {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

export type RecognitionCtor = new () => RecognitionLike

type SpeechWindow = { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }

/** El constructor del navegador (con o sin prefijo), o `undefined` si no hay. */
export function speechRecognitionCtor(win: unknown = typeof window === 'undefined' ? undefined : window): RecognitionCtor | undefined {
  if (!win) return undefined
  const w = win as SpeechWindow
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export const voiceSupported = (win?: unknown) => !!speechRecognitionCtor(win)

/** Errores del reconocedor en castellano. `aborted` (lo cortamos nosotros) no se muestra. */
export function voiceErrorText(code: string): string | undefined {
  switch (code) {
    case 'aborted':
      return undefined
    case 'no-speech':
      return 'No te escuchamos. Tocá el micrófono y hablá cerca.'
    case 'audio-capture':
      return 'No encontramos un micrófono.'
    case 'not-allowed':
    case 'service-not-allowed':
      return 'El navegador no dio permiso para usar el micrófono.'
    case 'network':
      return 'La búsqueda por voz necesita internet.'
    case 'language-not-supported':
      return 'Este navegador no reconoce voz en español.'
    default:
      return 'No se pudo usar la búsqueda por voz.'
  }
}

export interface VoiceHandlers {
  /** Texto parcial mientras hablás (para ir mostrándolo en el campo). */
  onInterim?: (text: string) => void
  /** Texto final: se busca. */
  onFinal: (text: string) => void
  onError?: (message: string) => void
  /** Terminó de escuchar (con o sin resultado). */
  onEnd?: () => void
}

/**
 * Arranca a escuchar una frase. Devuelve una función para cortar, o `undefined` si el navegador no tiene
 * reconocimiento de voz (o falló al arrancar: el error ya se avisó por `onError`).
 */
export function listenOnce(handlers: VoiceHandlers, Ctor: RecognitionCtor | undefined = speechRecognitionCtor()): (() => void) | undefined {
  if (!Ctor) return undefined
  const rec = new Ctor()
  rec.lang = VOICE_LANG
  rec.interimResults = true
  rec.continuous = false
  rec.maxAlternatives = 1
  let finalText = ''
  let ended = false
  rec.onresult = (e) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      const text = r[0]?.transcript ?? ''
      if (r.isFinal) finalText += text
      else interim += text
    }
    const shown = (finalText + interim).replace(/\s+/g, ' ').trim()
    if (interim && shown) handlers.onInterim?.(shown)
  }
  rec.onerror = (e) => {
    const msg = voiceErrorText(e.error)
    if (msg) handlers.onError?.(msg)
  }
  rec.onend = () => {
    if (ended) return
    ended = true
    const text = finalText.replace(/\s+/g, ' ').trim()
    if (text) handlers.onFinal(text)
    handlers.onEnd?.()
  }
  try {
    rec.start()
  } catch {
    // Por ejemplo, "already started" o el navegador sin permiso de micrófono.
    handlers.onError?.(voiceErrorText('')!)
    handlers.onEnd?.()
    return undefined
  }
  return () => {
    try {
      rec.stop()
    } catch {
      // Ya había terminado.
    }
  }
}
