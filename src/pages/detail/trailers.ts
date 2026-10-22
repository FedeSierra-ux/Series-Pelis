// Tráileres de la ficha (v0.14): el reproductor a pantalla completa y el tráiler de fondo. Todo lógica
// pura para poder probarla sin navegador. (La pestaña "Extras" se sacó en la v0.24.)

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
