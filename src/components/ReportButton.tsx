import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { MAX_COMMENT, sendReport, useReportsEnabled, type ReportExtra, type ReportKind, type SendResult } from '../lib/diagnostics'
import { useTvMode } from '../lib/tv'
import './report-button.css'

export interface ReportButtonProps {
  kind: ReportKind
  /** El error (Error, string o lo que haya). Para `manual` puede no haber. */
  error?: unknown
  /** Datos sueltos (nombre del addon, título…). Las URLs se reducen al host antes de mandar. */
  context?: Record<string, string | undefined>
  /** URLs de manifest o hosts de los addons involucrados (se manda solo el host). */
  addons?: string[]
  /** El stream que falló (se manda solo el host y el tipo). */
  stream?: ReportExtra['stream']
  /** Texto del botón. */
  label?: string
  /** Clases del botón principal (por defecto `btn`). */
  className?: string
}

const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack'])

const RESULT_TEXT: Record<SendResult, string> = {
  sent: 'Enviado, gracias',
  queued: 'Se manda cuando vuelva la conexión',
  failed: 'No se pudo enviar',
  disabled: 'El sitio no acepta informes ahora',
}

/**
 * "Enviar informe": manda el error al sitio (ver lib/diagnostics.ts), con un comentario opcional.
 * Con mouse o teclado aparece un campo para escribirlo; en la TV (sin teclado nativo) OK lo manda
 * directo y Atrás cancela. No aparece si el sitio no tiene activados los informes.
 */
export function ReportButton({ kind, error, context, addons, stream, label = 'Enviar informe', className = 'btn' }: ReportButtonProps) {
  const enabled = useReportsEnabled()
  const tv = useTvMode()
  const [state, setState] = useState<'idle' | 'ask' | 'sending' | SendResult>('idle')
  const [comment, setComment] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (state === 'ask') input.current?.focus()
  }, [state])

  if (!enabled) return null

  const send = async (text: string) => {
    setState('sending')
    const result = await sendReport(kind, error, { context, addons, stream, comment: text })
    setState(result)
  }

  const start = () => {
    if (tv) void send('')
    else setState('ask')
  }

  const cancel = () => {
    setState('idle')
    setComment('')
    trigger.current?.focus()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void send(comment)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!BACK_KEYS.has(e.key)) return
    e.preventDefault()
    e.stopPropagation()
    cancel()
  }

  if (state === 'ask') {
    return (
      <form className="report report-form" onSubmit={submit} onKeyDown={onKeyDown}>
        <input
          ref={input}
          type="text"
          value={comment}
          maxLength={MAX_COMMENT}
          placeholder="¿Qué estabas haciendo? (opcional)"
          aria-label="Comentario para el informe (opcional)"
          onChange={(e) => setComment(e.target.value)}
        />
        <button type="submit" className="btn btn-primary btn-small">
          Enviar
        </button>
        <button type="button" className="btn btn-small" onClick={cancel}>
          Cancelar
        </button>
      </form>
    )
  }

  if (state === 'sending') {
    return (
      <span className="report">
        <button type="button" className={className} disabled>
          Enviando…
        </button>
      </span>
    )
  }

  if (state !== 'idle') {
    return (
      <span className="report" role="status" aria-live="polite">
        <span className={`report-status ${state === 'sent' ? 'report-ok' : ''}`}>{RESULT_TEXT[state]}</span>
        {state === 'failed' && (
          <button ref={trigger} type="button" className="btn btn-small" onClick={start}>
            Probar de nuevo
          </button>
        )}
      </span>
    )
  }

  return (
    <span className="report">
      <button ref={trigger} type="button" className={className} onClick={start}>
        {label}
      </button>
    </span>
  )
}
