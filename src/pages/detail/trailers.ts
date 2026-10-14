import type { TmdbVideo } from '../../lib/tmdb'

// Tráileres de la ficha (v0.14): el reproductor a pantalla completa, el tráiler de fondo y la
// pestaña "Extras". Todo lógica pura para poder probarla sin navegador.

export const YT_EMBED = 'https://www.youtube-nocookie.com/embed/'

/** Un id de YouTube válido (así nunca se arma una URL con basura de un addon). */
export function isYtId(s: string | undefined): s is string {
  return !!s && /^[\w-]{6,20}$/.test(s)
}

export interface EmbedOptions {
  /** Arrancar sin sonido (el tráiler de fondo; los navegadores no dejan arrancar con sonido sin un clic). */
  muted?: boolean
  /** Repetir (el de fondo). */
  loop?: boolean
  origin?: string
}

/**
 * URL del reproductor de YouTube sin su interfaz (los controles son nuestros, por postMessage) y con
 * subtítulos en español forzados, igual que el tráiler de los pósters.
 */
export function embedTrailerUrl(ytId: string, opts: EmbedOptions = {}): string {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: opts.muted ? '1' : '0',
    controls: '0',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    iv_load_policy: '3',
    disablekb: '1',
    fs: '0',
    cc_load_policy: '1',
    cc_lang_pref: 'es',
    hl: 'es',
    enablejsapi: '1',
  })
  if (opts.loop) {
    params.set('loop', '1')
    params.set('playlist', ytId)
  }
  if (opts.origin) params.set('origin', opts.origin)
  return `${YT_EMBED}${encodeURIComponent(ytId)}?${params.toString()}`
}

export interface BackdropEnv {
  /** Ajustes → Pósters: "Reproducir el tráiler…" (el mismo interruptor apaga el de fondo). */
  enabled: boolean
  saveData: boolean
  reducedMotion: boolean
  /** Pantalla ancha (en el celular no: gasta datos y tapa la ficha). */
  wide: boolean
  /** Pantalla táctil como puntero principal. */
  coarsePointer: boolean
}

/** Si corresponde pasar el fondo de la ficha al tráiler: igual que el de los pósters. */
export function backdropTrailerAllowed(env: BackdropEnv): boolean {
  return env.enabled && !env.saveData && !env.reducedMotion && env.wide && !env.coarsePointer
}

/** A los cuántos milisegundos de abrir la ficha el fondo pasa al tráiler. */
export const BACKDROP_DELAY_MS = 3000

// ---------- Extras ----------

export interface ExtraVideo {
  key: string
  name: string
  /** "Tráiler", "Avance", "Detrás de escena"… */
  kind: string
  lang?: string
  thumb: string
}

const KINDS: Record<string, { label: string; order: number }> = {
  Trailer: { label: 'Tráiler', order: 0 },
  Teaser: { label: 'Avance', order: 1 },
  Clip: { label: 'Escena', order: 2 },
  'Behind the Scenes': { label: 'Detrás de escena', order: 3 },
  Featurette: { label: 'Especial', order: 4 },
  Bloopers: { label: 'Tomas falsas', order: 5 },
  'Opening Credits': { label: 'Presentación', order: 6 },
}

const LANGS: Record<string, string> = { es: 'Español', en: 'Inglés' }

/** Videos de TMDB para "Extras": solo YouTube, sin repetidos, primero los tráileres y lo que está en español. */
export function extrasFromTmdb(videos: TmdbVideo[] | undefined): ExtraVideo[] {
  const seen = new Set<string>()
  return (Array.isArray(videos) ? videos : [])
    .filter((v) => v && v.site === 'YouTube' && isYtId(v.key) && KINDS[v.type] && !seen.has(v.key) && !!seen.add(v.key))
    .sort(
      (a, b) =>
        KINDS[a.type].order - KINDS[b.type].order ||
        Number(b.iso_639_1 === 'es') - Number(a.iso_639_1 === 'es') ||
        Number(!!b.official) - Number(!!a.official),
    )
    .map((v) => ({
      key: v.key,
      name: v.name?.trim() || KINDS[v.type].label,
      kind: KINDS[v.type].label,
      lang: v.iso_639_1 ? (LANGS[v.iso_639_1] ?? v.iso_639_1.toUpperCase()) : undefined,
      thumb: `https://i.ytimg.com/vi/${encodeURIComponent(v.key)}/mqdefault.jpg`,
    }))
}

/** Título original si está en alfabeto latino; si no (japonés, coreano…), el que manda TMDB. */
export function originalTitle(item: { original_title?: string; original_name?: string } | undefined, fallback: string): string {
  const orig = item?.original_title ?? item?.original_name
  return orig && /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u.test(orig) ? orig : fallback
}
