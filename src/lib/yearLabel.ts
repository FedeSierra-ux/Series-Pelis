import { metaKey } from './addons'
import { peekMemory } from './cache'
import { seasonCount, seriesYear } from './format'
import type { Meta } from './types'

/**
 * Año de un título donde no se sabe cuántas temporadas tiene (pósters, Buscar, portada de Inicio, protector).
 * Si la ficha de la serie ya está en la caché en memoria (se abrió, o la cargó la portada de Series al pasar por
 * el póster), manda su cuenta real de temporadas: así "2025–" con una sola temporada queda "2025" también en la
 * tarjeta, como en la ficha. Si no está, `seriesYear` adivina (sin guion si arrancó este año). Nunca pide nada.
 */
export function displayYear(item: { id: string; type?: string; releaseInfo?: string; year?: string }, thisYear?: number): string | undefined {
  const info = item.releaseInfo ?? item.year
  if (item.type === 'movie') return seriesYear(info, undefined, thisYear)
  const meta = peekMemory<Meta>(metaKey('series', item.id))?.data
  return seriesYear(info, seasonCount(meta?.videos), thisYear)
}
