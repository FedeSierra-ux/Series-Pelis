// Teclado en pantalla para el control remoto: distribución de teclas y edición del texto. Lógica pura.

export type OskLayer = 'letters' | 'symbols'

export type OskKey =
  | { kind: 'char'; value: string }
  | { kind: 'space' }
  | { kind: 'backspace' }
  | { kind: 'clear' }
  | { kind: 'shift' }
  | { kind: 'layer' }
  | { kind: 'done' }

const chars = (s: string): OskKey[] => [...s].map((value) => ({ kind: 'char', value }))

const LETTERS = ['abcdefghij', 'klmnñopqrs', 'tuvwxyz.-_', '1234567890']
// Lo justo para escribir URLs de manifests y keys.
const SYMBOLS = [':/?=&%#@+~', 'áéíóúü¡!¿\'', '()[],;*$|"', '1234567890']

/** Filas del teclado: 4 de caracteres y una de acciones. */
export function oskRows(layer: OskLayer, upper: boolean): OskKey[][] {
  const base = (layer === 'letters' ? LETTERS : SYMBOLS).map((row) => chars(upper && layer === 'letters' ? row.toUpperCase() : row))
  const actions: OskKey[] = [{ kind: 'shift' }, { kind: 'layer' }, { kind: 'space' }, { kind: 'backspace' }, { kind: 'clear' }, { kind: 'done' }]
  return [...base, actions]
}

/** Aplica una tecla al texto. Devuelve el texto nuevo. */
export function applyKey(text: string, key: OskKey): string {
  switch (key.kind) {
    case 'char':
      return text + key.value
    case 'space':
      return text + ' '
    case 'backspace':
      return [...text].slice(0, -1).join('')
    case 'clear':
      return ''
    default:
      return text
  }
}
