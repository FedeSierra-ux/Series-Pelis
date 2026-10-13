// Diapositivas del protector de pantalla: junta fondos de lo que el usuario vio, guardó y de los
// catálogos ya cargados, sin repetir títulos. Lógica pura.

export interface Slide {
  id: string
  name: string
  image: string
  year?: string
}

export interface SlideSource {
  id: string
  name: string
  background?: string
  year?: string
}

/** Fondo de Metahub para ids de IMDb (lo mismo que usa Cinemeta). */
export const metahubBackground = (imdbId: string, size: 'medium' | 'large' = 'large') =>
  `https://images.metahub.space/background/${size}/${imdbId}/img`

/**
 * Con conexión, el fondo grande (se ve en una TV). Sin conexión, el mismo tamaño que usa la app
 * (`medium`), que es el que puede estar en la caché del service worker.
 */
function imageOf(s: SlideSource, large: boolean): string | undefined {
  if (s.background) return large ? s.background.replace('/background/medium/', '/background/large/') : s.background
  const imdb = /^tt\d+/.exec(s.id)?.[0]
  return imdb ? metahubBackground(imdb, large ? 'large' : 'medium') : undefined
}

/** Mezcla determinística (para tests) o aleatoria. */
export function shuffle<T>(list: T[], random: () => number = Math.random): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Arma la lista de diapositivas. Las fuentes van en orden de prioridad (lo del usuario primero);
 * se queda con `max` y las mezcla.
 */
export function buildSlides(sources: SlideSource[][], max = 40, random: () => number = Math.random, large = true): Slide[] {
  const seen = new Set<string>()
  const out: Slide[] = []
  for (const group of sources) {
    for (const s of group) {
      const key = /^tt\d+/.exec(s.id)?.[0] ?? s.id
      if (seen.has(key) || !s.name) continue
      const image = imageOf(s, large)
      if (!image) continue
      seen.add(key)
      out.push({ id: s.id, name: s.name, image, year: s.year })
      if (out.length >= max) return shuffle(out, random)
    }
  }
  return shuffle(out, random)
}
