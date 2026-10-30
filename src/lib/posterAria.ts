// Nombre accesible de las tarjetas de póster (a11y-10). Puro, para poder probarlo.
//
// Antes el nombre salía del contenido en orden visual ("Puesto 2, Estreno IMDb 7.8 Carrie 2026"): el título quedaba
// en el medio y recorrer los enlaces por letra o de a uno era puro ruido. Ahora arranca con el título y dice qué es:
// "Carrie, película, 2026, IMDb 7,8, Estreno, Puesto 2".

export interface PosterAriaInput {
  /** Nombre que se muestra (en español si se sabe). */
  name: string
  /** `movie`, `series`… de Cinemeta; los demás tipos no se nombran. */
  type?: string
  /** Lo que va debajo del título: el año, "Temporada 2"… (o "2024 · Ciencia ficción" en las apaisadas). */
  info?: string
  /** Puntaje de IMDb, solo si la tarjeta lo muestra. */
  rating?: string
  /** Etiqueta visible ("Estreno", "Episodio nuevo"…). */
  label?: string
  watched?: boolean
  /** Puesto en el Top 10. */
  rank?: number
}

const KIND: Record<string, string> = { movie: 'película', series: 'serie' }

/** "7.8" → "IMDb 7,8"; sin puntaje (o 0) no dice nada. */
export function ratingText(value: string | undefined): string | undefined {
  if (!value || value === '0' || value === '0.0') return undefined
  return `IMDb ${value.replace('.', ',')}`
}

export function posterAriaLabel({ name, type, info, rating, label, watched, rank }: PosterAriaInput): string {
  return [
    name,
    type ? KIND[type] : undefined,
    info,
    ratingText(rating),
    label,
    watched ? 'Vista' : undefined,
    rank === undefined ? undefined : `Puesto ${rank}`,
  ]
    .filter(Boolean)
    .join(', ')
}
