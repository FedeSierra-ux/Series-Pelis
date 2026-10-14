import type { AddonStreams, Meta, Stream, Video } from '../../lib/types'

// La ficha no se cae por una respuesta rara de un addon (auditoría de código #14): lo que no tiene la
// forma esperada se descarta acá, en el borde, y el resto de la ficha sigue andando.

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const strings = (x: unknown): string[] | undefined => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : undefined)

/** La ficha de un addon con los campos que usa la página ya validados (listas que son listas, etc.). */
export function safeMeta(meta: Meta): Meta {
  const videos = Array.isArray(meta.videos)
    ? meta.videos.filter((v): v is Video => isObj(v) && typeof v.id === 'string' && v.id !== '')
    : undefined
  return {
    ...meta,
    name: typeof meta.name === 'string' ? meta.name : '',
    videos,
    genre: strings(meta.genre),
    genres: strings(meta.genres),
    cast: strings(meta.cast),
    director: strings(meta.director),
    writer: strings(meta.writer),
    country: typeof meta.country === 'string' ? meta.country : undefined,
    awards: typeof meta.awards === 'string' ? meta.awards : undefined,
    trailers: Array.isArray(meta.trailers) ? meta.trailers.filter(isObj) as Meta['trailers'] : undefined,
    trailerStreams: Array.isArray(meta.trailerStreams) ? meta.trailerStreams.filter(isObj) as Meta['trailerStreams'] : undefined,
  }
}

/**
 * Grupos de fuentes con `streams` siempre como lista de objetos. Si un addon manda algo que no es una
 * lista (`{"streams": {"error": "rate limited"}}`), cuenta como un error de ese addon.
 */
export function safeGroups(groups: AddonStreams[]): AddonStreams[] {
  return groups.map((g) => {
    if (Array.isArray(g.streams)) {
      const streams = g.streams.filter((s): s is Stream => isObj(s))
      return streams.length === g.streams.length ? g : { ...g, streams }
    }
    return { ...g, streams: [], error: g.error ?? 'respondió algo que no son fuentes' }
  })
}

/** Nombres de los addons que todavía no respondieron ("Torrentio y Addon lento"). */
export function pendingNames(groups: AddonStreams[]): string {
  const names = groups.filter((g) => g.loading).map((g) => g.addon.manifest?.name || 'un addon')
  if (names.length <= 1) return names[0] ?? ''
  if (names.length > 3) return `${names.slice(0, 2).join(', ')} y ${names.length - 2} más`
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}
