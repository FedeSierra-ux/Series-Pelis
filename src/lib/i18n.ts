// Textos en español latino para lo que viene en inglés desde Cinemeta.

const GENRES: Record<string, string> = {
  Action: 'Acción',
  Adventure: 'Aventura',
  Animation: 'Animación',
  Biography: 'Biografía',
  Comedy: 'Comedia',
  Crime: 'Crimen',
  Documentary: 'Documental',
  Drama: 'Drama',
  Family: 'Familia',
  Fantasy: 'Fantasía',
  'Film-Noir': 'Cine negro',
  'Game-Show': 'Concursos',
  History: 'Historia',
  Horror: 'Terror',
  Mystery: 'Misterio',
  Music: 'Música',
  Musical: 'Musical',
  News: 'Noticias',
  'Reality-TV': 'Reality',
  Romance: 'Romance',
  'Sci-Fi': 'Ciencia ficción',
  Sport: 'Deportes',
  'Talk-Show': 'Talk show',
  Thriller: 'Suspenso',
  War: 'Bélica',
  Western: 'Western',
}

export const genreLabel = (g: string) => GENRES[g] ?? g

const CATALOG_NAMES: Record<string, string> = {
  Popular: 'Populares',
  New: 'Nuevas',
  Featured: 'Mejor puntuadas',
}

export const typeLabel = (type: string, plural = true) =>
  type === 'movie' ? (plural ? 'Películas' : 'Película') : type === 'series' ? (plural ? 'Series' : 'Serie') : type

export function catalogLabel(name: string | undefined, type: string, addonName: string) {
  const base = name ? (CATALOG_NAMES[name] ?? name) : addonName
  return `${type === 'series' && base === 'Nuevas' ? 'Nuevos estrenos' : base} · ${typeLabel(type)}`
}

const LANGS: Record<string, string> = {
  spa: 'Español',
  es: 'Español',
  'es-419': 'Español latino',
  eng: 'Inglés',
  en: 'Inglés',
  por: 'Portugués',
  pob: 'Portugués (Brasil)',
  pt: 'Portugués',
  fre: 'Francés',
  fra: 'Francés',
  fr: 'Francés',
  ita: 'Italiano',
  it: 'Italiano',
  ger: 'Alemán',
  deu: 'Alemán',
  de: 'Alemán',
  jpn: 'Japonés',
  ja: 'Japonés',
  kor: 'Coreano',
  ko: 'Coreano',
}

export const langLabel = (code: string) => LANGS[code?.toLowerCase()] ?? code
