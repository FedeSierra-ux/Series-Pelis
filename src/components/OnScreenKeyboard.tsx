import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { applyKey, oskRows, type OskKey, type OskLayer } from '../lib/osk'
import { useTvMode } from '../lib/tv'
import { Theme2Icon } from './Theme2Icons'

interface KeyboardProps {
  value: string
  onChange: (value: string) => void
  /** Tecla "Listo" (o "Buscar", "Agregar"...). */
  onDone?: () => void
  doneLabel?: string
  /** Enfocar la primera tecla al aparecer (con el control remoto). */
  autoFocus?: boolean
  label?: string
}

function keyText(k: OskKey, layer: OskLayer, upper: boolean, doneLabel: string): string {
  switch (k.kind) {
    case 'char':
      return k.value
    case 'space':
      return 'Espacio'
    case 'backspace':
      return '⌫'
    case 'clear':
      return 'Limpiar'
    case 'shift':
      return upper ? 'abc' : 'ABC'
    case 'layer':
      return layer === 'letters' ? '#+=' : 'abc'
    case 'done':
      return doneLabel
  }
}

function keyAria(k: OskKey, layer: OskLayer, upper: boolean, doneLabel: string): string | undefined {
  switch (k.kind) {
    case 'backspace':
      return 'Borrar una letra'
    case 'shift':
      return upper ? 'Minúsculas' : 'Mayúsculas'
    case 'layer':
      return layer === 'letters' ? 'Símbolos y acentos' : 'Letras'
    case 'char':
      return k.value === ' ' ? 'Espacio' : undefined
    case 'clear':
      return 'Borrar todo'
    default:
      return keyText(k, layer, upper, doneLabel)
  }
}

/** Teclado en pantalla navegable con las flechas del control remoto. */
export function OnScreenKeyboard({ value, onChange, onDone, doneLabel = 'Listo', autoFocus, label = 'Teclado en pantalla' }: KeyboardProps) {
  const [layer, setLayer] = useState<OskLayer>('letters')
  const [upper, setUpper] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  // El valor más nuevo, por si llegan varias teclas antes del re-render.
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    if (autoFocus) rootRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [autoFocus])

  const press = (k: OskKey) => {
    if (k.kind === 'shift') return setUpper((u) => !u)
    if (k.kind === 'layer') return setLayer((l) => (l === 'letters' ? 'symbols' : 'letters'))
    if (k.kind === 'done') return onDone?.()
    const next = applyKey(valueRef.current, k)
    valueRef.current = next
    onChange(next)
  }

  // Con un teclado físico enchufado a la TV también se puede escribir sin volver al campo.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    if (e.key === 'Backspace') {
      // Si no, la navegación con el control lo toma como "Atrás".
      e.preventDefault()
      press({ kind: 'backspace' })
    } else if (e.key.length === 1 && e.key !== ' ') {
      e.preventDefault()
      press({ kind: 'char', value: e.key })
    }
  }

  return (
    <div ref={rootRef} className="osk" role="group" aria-label={label} onKeyDown={onKeyDown}>
      {oskRows(layer, upper).map((row, r) => (
        <div key={r} className={`osk-row${r === 4 ? ' osk-actions' : ''}`}>
          {row.map((k, i) => (
            <button
              key={`${layer}${r}-${i}`}
              type="button"
              className={`osk-key osk-${k.kind}${(k.kind === 'shift' && upper) || (k.kind === 'layer' && layer === 'symbols') ? ' active' : ''}`}
              aria-label={keyAria(k, layer, upper, doneLabel)}
              // En la PC no le saca el foco al campo de texto (se puede seguir escribiendo).
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => press(k)}
            >
              {keyText(k, layer, upper, doneLabel)}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

interface ToggleProps extends Omit<KeyboardProps, 'autoFocus'> {
  /** Mostrar el botón "Teclado" también fuera del modo TV. */
  alwaysToggle?: boolean
  /** En modo TV arranca abierto. */
  openInTv?: boolean
}

/**
 * Botón "⌨ Teclado" + teclado. En modo TV aparece siempre el botón (y si `openInTv`, el teclado ya abierto);
 * fuera del modo TV solo si `alwaysToggle`.
 */
export function KeyboardToggle({ alwaysToggle, openInTv, onDone, ...props }: ToggleProps) {
  const tv = useTvMode()
  const [open, setOpen] = useState(tv && !!openInTv)
  const [focusKeys, setFocusKeys] = useState(tv && !!openInTv)
  const toggleRef = useRef<HTMLButtonElement>(null)
  if (!tv && !alwaysToggle) return null
  return (
    <div className="osk-wrap">
      <button
        ref={toggleRef}
        type="button"
        className={`btn btn-small btn-ghost osk-toggle${open ? ' active' : ''}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o)
          setFocusKeys(true)
        }}
      >
        <Theme2Icon name="keyboard" size={20} />
        {open ? 'Ocultar teclado' : 'Teclado'}
      </button>
      {open && (
        <OnScreenKeyboard
          {...props}
          autoFocus={focusKeys}
          onDone={() => {
            setOpen(false)
            onDone?.()
            // Si `onDone` no movió el foco, que no quede perdido en la página.
            requestAnimationFrame(() => {
              if (!document.activeElement || document.activeElement === document.body) toggleRef.current?.focus()
            })
          }}
        />
      )}
    </div>
  )
}
