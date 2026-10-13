// Atajos de teclado: la tabla (datos puros, la dibuja la ayuda "?") y la lógica del atajo encadenado
// "G + letra". Lo que escucha el teclado vive en components/ShortcutsHelp.tsx (useGlobalShortcuts) y
// en el reproductor, que usa esta misma tabla como referencia.

export interface Shortcut {
  /**
   * Teclas que lo disparan. Cada una se dibuja como <kbd>; las alternativas se separan con " / "
   * al mostrarlas. Una secuencia (primero G, después H) se escribe con un espacio: "G H".
   */
  keys: string[]
  description: string
}

export type ShortcutGroupId = 'global' | 'player' | 'remote'

export interface ShortcutGroup {
  id: ShortcutGroupId
  title: string
  shortcuts: Shortcut[]
}

/** Adónde lleva cada letra después de "G" (Go to). */
export const GOTO_TARGETS: Record<string, { to: string; label: string }> = {
  h: { to: '/', label: 'Inicio' },
  d: { to: '/discover/movie', label: 'Descubrir' },
  b: { to: '/search', label: 'Buscar' },
  l: { to: '/list', label: 'Mi lista' },
  i: { to: '/history', label: 'Historial' },
  c: { to: '/calendar', label: 'Calendario' },
  a: { to: '/settings', label: 'Ajustes' },
}

/** Cuánto se espera la segunda tecla del atajo encadenado. */
export const CHORD_TIMEOUT_MS = 1500

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: 'global',
    title: 'En toda la app',
    shortcuts: [
      { keys: ['/'], description: 'Ir a Buscar' },
      { keys: ['?'], description: 'Mostrar u ocultar esta ayuda' },
      { keys: ['T'], description: 'Cambiar el tema (Tema 1 / Tema 2)' },
      ...Object.entries(GOTO_TARGETS).map(([letter, t]) => ({
        keys: [`G ${letter.toUpperCase()}`],
        description: `Ir a ${t.label}`,
      })),
      { keys: ['Esc'], description: 'Cerrar la ayuda o la ventana abierta' },
    ],
  },
  {
    id: 'player',
    title: 'En el reproductor',
    shortcuts: [
      { keys: ['Espacio', 'K'], description: 'Reproducir o pausar' },
      { keys: ['←', '→'], description: 'Retroceder o adelantar 10 s' },
      { keys: ['J', 'L'], description: 'Retroceder o adelantar 10 s' },
      { keys: ['↑', '↓'], description: 'Subir o bajar el volumen' },
      { keys: ['M'], description: 'Silenciar o volver el sonido' },
      { keys: ['F'], description: 'Pantalla completa' },
      { keys: ['C'], description: 'Subtítulos sí / no' },
      { keys: ['S'], description: 'Menú de subtítulos' },
      { keys: ['A'], description: 'Fuentes' },
      { keys: ['N'], description: 'Siguiente episodio' },
      { keys: ['P'], description: 'Imagen en imagen (ventana flotante)' },
      { keys: ['<', '>'], description: 'Velocidad más lenta o más rápida' },
      { keys: ['0–9'], description: 'Saltar al 0 %, 10 %… 90 % del video' },
      { keys: ['I'], description: 'Saltar la intro' },
      { keys: ['Esc', 'Atrás'], description: 'Salir del reproductor' },
    ],
  },
  {
    id: 'remote',
    title: 'Con el control remoto',
    shortcuts: [
      { keys: ['Flechas'], description: 'Moverse entre pósters, botones y menús' },
      { keys: ['OK'], description: 'Elegir o abrir lo marcado; en el reproductor, pausar o reanudar' },
      { keys: ['Atrás'], description: 'Volver a la pantalla anterior o cerrar una ventana' },
      { keys: ['← →'], description: 'En el reproductor, retroceder o adelantar 10 s' },
      { keys: ['↑ ↓'], description: 'En el reproductor, mostrar los controles y moverse entre ellos' },
      { keys: ['Play/Pausa'], description: 'Las teclas de medios del control también sirven en el reproductor' },
    ],
  },
]

/** ¿El foco está en algo donde se escribe? Ahí las letras son letras, no atajos. */
export function isTypingTarget(el: Element | null | undefined): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    return !['checkbox', 'radio', 'range', 'button', 'submit', 'file'].includes(type)
  }
  return (el as HTMLElement).isContentEditable === true
}

export type ChordResult<T> =
  /** Se apretó la primera tecla: esperamos la segunda. */
  | { type: 'pending' }
  /** Primera + segunda a tiempo. */
  | { type: 'match'; value: T }
  /** No es parte del atajo (o la segunda llegó tarde o no existe). */
  | { type: 'none' }

export interface ChordOptions<T> {
  /** Primera tecla, en minúscula ("g"). */
  leader: string
  /** Segunda tecla (minúscula) → valor. */
  targets: Record<string, T>
  timeoutMs?: number
}

/**
 * Atajo encadenado: `leader` y, dentro de `timeoutMs`, una de `targets`. Lógica pura: `feed` recibe la
 * tecla y el instante (ms) y dice qué pasó. Apretar el leader otra vez reinicia la espera; cualquier otra
 * tecla la cancela.
 */
export function createChordMatcher<T>({ leader, targets, timeoutMs = CHORD_TIMEOUT_MS }: ChordOptions<T>) {
  let armedAt: number | undefined
  const lead = leader.toLowerCase()
  return {
    feed(key: string, now = Date.now()): ChordResult<T> {
      const k = key.toLowerCase()
      const armed = armedAt !== undefined && now - armedAt <= timeoutMs
      if (armed && k in targets) {
        armedAt = undefined
        return { type: 'match', value: targets[k] }
      }
      if (k === lead) {
        armedAt = now
        return { type: 'pending' }
      }
      armedAt = undefined
      return { type: 'none' }
    },
    /** ¿Estamos esperando la segunda tecla? */
    isPending(now = Date.now()) {
      return armedAt !== undefined && now - armedAt <= timeoutMs
    },
    reset() {
      armedAt = undefined
    },
  }
}
