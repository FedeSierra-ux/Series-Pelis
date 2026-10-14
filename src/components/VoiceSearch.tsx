import { useEffect, useRef, useState } from 'react'
import { listenOnce, voiceSupported } from '../lib/voice'
import { Theme2Icon } from './Theme2Icons'

export interface VoiceSearchState {
  supported: boolean
  listening: boolean
  error?: string
  /** Empieza a escuchar o, si ya escucha, corta. */
  toggle: () => void
}

/**
 * Búsqueda por voz (v0.14): mientras hablás va escribiendo en el campo (`onText`) y, al terminar, busca
 * (`onFinal`). Si el navegador no tiene reconocimiento de voz, `supported` es falso y no se muestra nada.
 */
export function useVoiceSearch(onText: (text: string) => void, onFinal: (text: string) => void): VoiceSearchState {
  const [supported] = useState(() => voiceSupported())
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string>()
  const stopRef = useRef<(() => void) | undefined>(undefined)
  // Siempre las funciones más nuevas (la escucha dura varios renders).
  const handlers = useRef({ onText, onFinal })
  handlers.current = { onText, onFinal }

  useEffect(
    () => () => {
      stopRef.current?.()
    },
    [],
  )

  const toggle = () => {
    if (stopRef.current) {
      stopRef.current()
      return
    }
    setError(undefined)
    const stop = listenOnce({
      onInterim: (t) => handlers.current.onText(t),
      onFinal: (t) => {
        handlers.current.onText(t)
        handlers.current.onFinal(t)
      },
      onError: setError,
      onEnd: () => {
        stopRef.current = undefined
        setListening(false)
      },
    })
    if (!stop) return
    stopRef.current = stop
    setListening(true)
  }

  return { supported, listening, error, toggle }
}

/** Botón de micrófono al costado del campo de búsqueda. */
export function VoiceButton({ voice, className = '' }: { voice: VoiceSearchState; className?: string }) {
  if (!voice.supported) return null
  return (
    <button
      type="button"
      className={`voice-btn${voice.listening ? ' is-listening' : ''} ${className}`}
      aria-pressed={voice.listening}
      aria-label={voice.listening ? 'Dejar de escuchar' : 'Buscar por voz'}
      title={voice.listening ? 'Dejar de escuchar' : 'Buscar por voz'}
      onClick={voice.toggle}
    >
      <Theme2Icon name="mic" size={22} />
    </button>
  )
}

/** Aviso accesible de lo que está pasando con la voz ("Escuchando…" o el error). */
export function VoiceStatus({ voice }: { voice: VoiceSearchState }) {
  if (!voice.supported) return null
  return (
    <p className={`voice-status${voice.error ? ' is-error' : ''}`} role="status" aria-live="polite">
      {voice.listening ? 'Escuchando… decí el nombre de una película, serie o persona.' : (voice.error ?? '')}
    </p>
  )
}
