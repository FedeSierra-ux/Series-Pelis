// Tu puntaje con estrellas: de 0,5 a 5, de a media estrella. Lógica pura (se prueba sin navegador).

export const MIN_STARS = 0.5
export const MAX_STARS = 5
export const STAR_STEP = 0.5

/** Hasta acá es "puntaje bajo": no se usa para recomendar y lo parecido baja en "Para vos". */
export const LOW_STARS = 2.5
/** Desde acá es "te gustó": pesa más en las recomendaciones y en el "por qué". */
export const HIGH_STARS = 4

/** Redondea a media estrella y lo deja entre 0,5 y 5. */
export function clampStars(n: number): number {
  if (!Number.isFinite(n)) return MIN_STARS
  return Math.min(MAX_STARS, Math.max(MIN_STARS, Math.round(n / STAR_STEP) * STAR_STEP))
}

/** "4,5" / "4" (coma decimal, como en Argentina). */
export function formatStars(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',')
}

/** Texto para lectores de pantalla y tooltips: "4,5 estrellas", "1 estrella". */
export function starsLabel(n: number): string {
  return `${formatStars(n)} ${n === 1 ? 'estrella' : 'estrellas'}`
}

/** Cómo se pinta la estrella número `index` (1 a 5) con `value` estrellas. */
export function starFill(value: number, index: number): 'full' | 'half' | 'empty' {
  if (value >= index) return 'full'
  if (value >= index - 0.5) return 'half'
  return 'empty'
}

/**
 * Clic o toque sobre la estrella `index` (1 a 5): el lado izquierdo vale media estrella menos.
 * El corte está un poco antes de la mitad para que un toque al centro cuente la estrella entera.
 */
export function starsFromPointer(index: number, fraction: number): number {
  return clampStars(fraction < 0.4 ? index - 0.5 : index)
}

/**
 * Teclas del control remoto sobre las estrellas (← → de a media, ↑↓ no se usan para no
 * atrapar el foco, números 1 a 5 directo, Inicio/Fin). Devuelve undefined si la tecla no es suya.
 * `current` undefined = todavía sin puntaje (arranca en 0).
 */
export function starsFromKey(current: number | undefined, key: string): number | undefined {
  const base = current ?? 0
  if (key === 'ArrowRight') return clampStars(base + STAR_STEP)
  if (key === 'ArrowLeft') return base === 0 ? undefined : clampStars(base - STAR_STEP)
  if (key === 'Home') return MIN_STARS
  if (key === 'End') return MAX_STARS
  if (/^[1-5]$/.test(key)) return Number(key)
  return undefined
}

export const isLowStars = (n: number) => n <= LOW_STARS
export const isHighStars = (n: number) => n >= HIGH_STARS
