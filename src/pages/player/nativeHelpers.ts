// Lógica pura del reproductor nativo de la app de TV (v0.20): qué se le manda a Android y qué se guarda.

import type { NativeSubOption, NativeSubtitleStyle, NativeTextTrack } from '../../lib/nativePlayer'
import { RESUME_MIN_S, type SubtitleStyle, type WatchEntry } from '../../lib/store'
import { langRank, looksForced, looksSdh, subMenuLabels, type SubOption } from '../../lib/subtitlePrefs'
import { MIN_HISTORY_EPISODE_S, MIN_HISTORY_S } from './autoNext'
import type { Resume } from './SourcesMenu'

/** Prefijo de los subtítulos que vienen dentro del video (los arma Android: `emb:<grupo>:<pista>`). */
export const EMBEDDED_PREFIX = 'emb:'
export const isEmbedded = (id: string) => id.startsWith(EMBEDDED_PREFIX)

/**
 * Dónde arranca: la posición que trae el cambio de fuente o, si no, lo guardado (igual que el reproductor de
 * la web: más de `RESUME_MIN_S` y no en los últimos 30 s). `at === 0` es "sin posición"; con `fromStart`
 * ("Ver desde el principio") arranca en 0 aunque haya progreso.
 */
export function nativeStartAt(resume: Pick<Resume, 'at' | 'fromStart'> | undefined, saved: Pick<WatchEntry, 'position' | 'duration' | 'watched'> | undefined): number {
  if (resume?.fromStart) return 0
  if (resume !== undefined && resume.at > 0) return resume.at
  if (saved && !saved.watched && saved.position > RESUME_MIN_S && (!(saved.duration > 0) || saved.position < saved.duration - 30)) return saved.position
  return 0
}

/** Mismos mínimos que la web: los clips cortos y los primeros segundos no van al historial. */
export function shouldSaveProgress(position: number, duration: number, isEpisode: boolean): boolean {
  const min = isEpisode ? MIN_HISTORY_EPISODE_S : MIN_HISTORY_S
  return Number.isFinite(duration) && duration >= min && position >= 5
}

/** Una pista de subtítulos del video, como opción del menú (para la elección automática). */
export function embeddedSubOption(t: NativeTextTrack): SubOption {
  return {
    id: t.id,
    url: t.id,
    lang: t.lang ?? '',
    label: t.label || undefined,
    forced: !!t.forced || looksForced(t.label),
    sdh: looksSdh(t.label),
  }
}

/** Reemplaza las pistas del video en la lista y deja las externas como estaban. */
export function withEmbedded(subs: SubOption[], tracks: NativeTextTrack[]): SubOption[] {
  return [...subs.filter((s) => !isEmbedded(s.url)), ...tracks.map(embeddedSubOption)]
}

/**
 * Lista para el menú de Android: las externas (las del video las arma Android solo), en el mismo orden que
 * el menú de la web (idiomas preferidos primero) y sin ids internos en el nombre.
 */
export function nativeSubList(
  subs: SubOption[],
  opts: { hideSdh: boolean; langs: string[]; active: string },
  langName: (code: string | undefined) => string,
): NativeSubOption[] {
  const options = subs
    .filter((s) => !isEmbedded(s.url) && s.hls === undefined && !s.file)
    .filter((s) => !(opts.hideSdh && s.sdh) || s.url === opts.active)
    .sort(
      (a, b) =>
        langRank(a.lang, opts.langs) - langRank(b.lang, opts.langs) ||
        (a.label ?? langName(a.lang)).localeCompare(b.label ?? langName(b.lang), 'es'),
    )
  const labels = subMenuLabels(options, langName)
  return options.map((o, i) => ({
    id: o.url,
    label: [labels[i].main, labels[i].extra].filter(Boolean).join(' · '),
    lang: o.lang || undefined,
    latino: o.latino || undefined,
    forced: o.forced || undefined,
  }))
}

/** El estilo de Ajustes → Subtítulos (la fuente no: Android usa la del sistema). */
export function nativeSubtitleStyle(style: SubtitleStyle): NativeSubtitleStyle {
  return {
    size: style.size,
    color: style.color,
    background: style.background,
    outline: style.outline,
    position: style.position,
  }
}
