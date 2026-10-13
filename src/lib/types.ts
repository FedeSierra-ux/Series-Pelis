// Tipos del protocolo de addons de Stremio.
// Referencia: https://github.com/Stremio/stremio-addon-sdk/tree/master/docs/api

export type ContentType = 'movie' | 'series' | string

export interface ExtraProp {
  name: string
  isRequired?: boolean
  options?: string[]
}

export interface CatalogDef {
  type: ContentType
  id: string
  name?: string
  genres?: string[]
  extra?: ExtraProp[]
  extraRequired?: string[]
  extraSupported?: string[]
}

export type ResourceDef = string | { name: string; types?: ContentType[]; idPrefixes?: string[] }

export interface Manifest {
  id: string
  version: string
  name: string
  description?: string
  logo?: string
  resources: ResourceDef[]
  types: ContentType[]
  idPrefixes?: string[]
  catalogs: CatalogDef[]
  behaviorHints?: { configurable?: boolean; configurationRequired?: boolean; adult?: boolean; p2p?: boolean }
}

export interface InstalledAddon {
  /** URL del manifest, por ejemplo https://v3-cinemeta.strem.io/manifest.json */
  transportUrl: string
  manifest: Manifest
}

export interface MetaPreview {
  id: string
  type: ContentType
  name: string
  poster?: string
  posterShape?: 'poster' | 'landscape' | 'square'
  background?: string
  logo?: string
  description?: string
  releaseInfo?: string
  year?: string
  imdbRating?: string
  genre?: string[]
  genres?: string[]
}

export interface Video {
  id: string
  title?: string
  name?: string
  season?: number
  episode?: number
  number?: number
  released?: string
  firstAired?: string
  overview?: string
  description?: string
  thumbnail?: string
  rating?: string
}

export interface Meta extends MetaPreview {
  runtime?: string
  cast?: string[]
  director?: string[]
  writer?: string[]
  country?: string
  awards?: string
  status?: string
  videos?: Video[]
  trailers?: { source: string; type: string }[]
  trailerStreams?: { ytId: string; title?: string }[]
  links?: { name: string; category: string; url: string }[]
}

export interface Subtitle {
  id?: string
  url: string
  lang: string
}

export interface Stream {
  url?: string
  ytId?: string
  infoHash?: string
  fileIdx?: number
  externalUrl?: string
  name?: string
  title?: string
  description?: string
  subtitles?: Subtitle[]
  behaviorHints?: {
    notWebReady?: boolean
    bingeGroup?: string
    filename?: string
    videoSize?: number
    proxyHeaders?: { request?: Record<string, string>; response?: Record<string, string> }
  }
}

/** Streams agrupados por el addon que los devolvió. */
export interface AddonStreams {
  addon: InstalledAddon
  streams: Stream[]
  error?: string
  loading: boolean
}
