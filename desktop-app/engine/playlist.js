// @ts-check
// Cortes y listas HLS (puro). Todas las pistas usan los mismos cortes, así hls.js cambia de audio sin saltos.
//
// Estrategia de segmentos:
// - Video copiado: los cortes caen en keyframes reales del archivo (del índice del contenedor), cada ~4 s o lo que
//   dé el GOP. Cada segmento empieza en un keyframe y se puede pedir suelto (al saltar se arranca ffmpeg ahí).
// - Video convertido: grilla fija de 4 s y el codificador pone un IDR justo en cada corte (`-force_key_frames`).
// - Los tiempos son absolutos (los del archivo, `-copyts`): un segmento hecho por un ffmpeg y el siguiente hecho
//   por otro (después de un salto) encajan sin discontinuidades.

/** Largo buscado de un segmento (s). */
export const SEG_TARGET = 4
/** Un último segmento más corto que esto se suma al anterior. */
const MIN_LAST = 1

/**
 * @typedef {{
 *   starts: number[],   // inicio (absoluto, s) de cada segmento
 *   end: number,        // fin del último
 *   cuts: number[],     // cuts[k] = tiempo (absoluto) que se le pasa al segmentador para cortar antes del segmento k
 * }} Boundaries
 */

/**
 * Cortes en keyframes: el próximo keyframe a ≥ SEG_TARGET del anterior. Para el segmentador se corta un poco
 * antes del keyframe (sin pasar el anterior), así el redondeo no lo manda al siguiente.
 * @param {readonly number[]} keyframes  ordenados (s)
 * @param {number} end  fin del video (s)
 * @param {number} [target]
 * @returns {Boundaries | null}
 */
export function keyframeBoundaries(keyframes, end, target = SEG_TARGET) {
  const kf = keyframes.filter((t) => Number.isFinite(t) && t < end)
  if (!kf.length || !(end > kf[0])) return null
  const starts = [kf[0]]
  const cuts = [kf[0]]
  for (let i = 1; i < kf.length; i++) {
    if (kf[i] - starts[starts.length - 1] < target - 1e-3) continue
    starts.push(kf[i])
    cuts.push(kf[i] - Math.min(0.2, (kf[i] - kf[i - 1]) / 2))
  }
  if (starts.length > 1 && end - starts[starts.length - 1] < MIN_LAST) {
    starts.pop()
    cuts.pop()
  }
  return { starts, end, cuts }
}

/**
 * Grilla fija (video convertido o solo audio).
 * @param {number} start
 * @param {number} end
 * @param {number} [seg]
 * @returns {Boundaries | null}
 */
export function gridBoundaries(start, end, seg = SEG_TARGET) {
  if (!(end > start) || !Number.isFinite(end)) return null
  const starts = []
  for (let t = start; t < end - 1e-6; t += seg) starts.push(round6(t))
  if (starts.length > 1 && end - starts[starts.length - 1] < MIN_LAST) starts.pop()
  return { starts, end, cuts: starts.map((t, i) => (i === 0 ? t : round6(t - Math.min(0.2, seg / 2)))) }
}

/** @param {number} x */
function round6(x) {
  return Math.round(x * 1e6) / 1e6
}

/** @param {Boundaries} b @param {number} k */
export function segmentDuration(b, k) {
  return (k + 1 < b.starts.length ? b.starts[k + 1] : b.end) - b.starts[k]
}

/**
 * `-segment_times` para un ffmpeg que arranca en el segmento `from` y hace hasta `to` (exclusivo). El segmentador
 * los cuenta desde el primer paquete que sale (≈ el inicio del segmento `from`).
 * @param {Boundaries} b
 * @param {number} from
 * @param {number} to
 * @param {boolean} exact  true = cortar justo en el inicio (audio: cada paquete se puede cortar)
 */
export function segmentTimes(b, from, to, exact) {
  const out = []
  for (let k = from + 1; k <= to && k < b.starts.length; k++) {
    out.push(((exact ? b.starts[k] : b.cuts[k]) - b.starts[from]).toFixed(6))
  }
  return out
}

/**
 * Lista de una pista (VOD completa desde el principio).
 * @param {Boundaries} b
 * @param {(n: number) => string} uri
 */
export function mediaPlaylist(b, uri) {
  let max = 1
  const lines = []
  for (let k = 0; k < b.starts.length; k++) {
    const d = segmentDuration(b, k)
    max = Math.max(max, d)
    lines.push(`#EXTINF:${d.toFixed(6)},`, uri(k))
  }
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${Math.ceil(max - 1e-6)}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    ...lines,
    '#EXT-X-ENDLIST',
    '',
  ].join('\n')
}

/** ISO 639-2 (lo que traen los MKV) → 639-1 (lo que entiende la web y la spec de HLS). */
const LANG_1 = /** @type {Record<string, string>} */ ({
  spa: 'es', eng: 'en', por: 'pt', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', jpn: 'ja', kor: 'ko',
  chi: 'zh', zho: 'zh', rus: 'ru', cat: 'ca', glg: 'gl', baq: 'eu', eus: 'eu', dut: 'nl', nld: 'nl', pol: 'pl',
  tur: 'tr', ara: 'ar', heb: 'he', hin: 'hi', swe: 'sv', nor: 'no', nob: 'nb', dan: 'da', fin: 'fi', ces: 'cs',
  cze: 'cs', hun: 'hu', ron: 'ro', rum: 'ro', gre: 'el', ell: 'el', ukr: 'uk', tha: 'th', vie: 'vi', ind: 'id',
})

/** Nombres en español (si la pista no trae título). */
const LANG_NAME = /** @type {Record<string, string>} */ ({
  es: 'Español', 'es-419': 'Español latino', en: 'Inglés', pt: 'Portugués', fr: 'Francés', de: 'Alemán',
  it: 'Italiano', ja: 'Japonés', ko: 'Coreano', zh: 'Chino', ru: 'Ruso', ca: 'Catalán', nl: 'Neerlandés',
  pl: 'Polaco', tr: 'Turco', ar: 'Árabe', he: 'Hebreo', hi: 'Hindi', sv: 'Sueco', da: 'Danés', fi: 'Finés',
  cs: 'Checo', hu: 'Húngaro', ro: 'Rumano', el: 'Griego', uk: 'Ucraniano', th: 'Tailandés', vi: 'Vietnamita',
})

/** Títulos que no dicen nada (los pone el programa que armó el archivo). */
const JUNK_TITLE = /^(sound ?handler|audio ?handler|video ?handler|stereo|mono|track ?\d*|audio ?\d*|und|default)$/i
const LATINO_RE = /latin|latam|es[-_]?419|m[eé]xic|neutro|\blat\b/i

/**
 * @typedef {{ language: string | null, title: string | null, default: boolean }} AudioInfo
 * @typedef {{ name: string, language: string | null, isDefault: boolean }} Rendition
 */

/**
 * Idioma y nombre de cada pista de audio para `EXT-X-MEDIA`. El latino se marca `es-419` (la web lo prefiere).
 * @param {readonly AudioInfo[]} audios
 * @returns {Rendition[]}
 */
export function audioRenditions(audios) {
  const used = new Map()
  let def = audios.findIndex((a) => a.default)
  if (def < 0) def = 0
  return audios.map((a, i) => {
    const raw = (a.language ?? '').toLowerCase()
    let language = raw && raw !== 'und' ? LANG_1[raw] ?? (/^[a-z]{2}(-[a-z0-9]+)?$/i.test(raw) ? raw : null) : null
    const title = a.title && !JUNK_TITLE.test(a.title.trim()) ? a.title.trim().replace(/"/g, "'").slice(0, 60) : null
    if (language === 'es' && title && LATINO_RE.test(title)) language = 'es-419'
    let name = title ?? (language ? LANG_NAME[language] ?? language : null) ?? `Audio ${i + 1}`
    const seen = used.get(name) ?? 0
    used.set(name, seen + 1)
    if (seen) name = `${name} (${seen + 1})`
    return { name, language, isDefault: i === def }
  })
}

/**
 * Lista maestra. Siempre con el audio aparte (`EXT-X-MEDIA`): una lista por pista, la web elige el idioma.
 * @param {{ video: boolean, renditions: Rendition[], bandwidth: number, resolution?: string, query: string }} m
 */
export function masterPlaylist(m) {
  const q = m.query ? `?${m.query}` : ''
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS']
  if (!m.video) {
    const def = Math.max(0, m.renditions.findIndex((r) => r.isDefault))
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${Math.round(m.bandwidth)}`, `audio${def}.m3u8${q}`, '')
    return lines.join('\n')
  }
  m.renditions.forEach((r, i) => {
    const attrs = [
      'TYPE=AUDIO',
      'GROUP-ID="aud"',
      `NAME="${r.name}"`,
      ...(r.language ? [`LANGUAGE="${r.language}"`] : []),
      `DEFAULT=${r.isDefault ? 'YES' : 'NO'}`,
      'AUTOSELECT=YES',
      `URI="audio${i}.m3u8${q}"`,
    ]
    lines.push(`#EXT-X-MEDIA:${attrs.join(',')}`)
  })
  const inf = [`BANDWIDTH=${Math.round(m.bandwidth)}`]
  if (m.resolution) inf.push(`RESOLUTION=${m.resolution}`)
  if (m.renditions.length) inf.push('AUDIO="aud"')
  lines.push(`#EXT-X-STREAM-INF:${inf.join(',')}`, `video.m3u8${q}`, '')
  return lines.join('\n')
}

/**
 * Tamaño de salida del video convertido: hasta 1920×1080, manteniendo la proporción, lados pares.
 * @param {number} w
 * @param {number} h
 */
export function scaledSize(w, h) {
  if (!(w > 0 && h > 0)) return undefined
  const k = Math.min(1, 1920 / w, 1080 / h)
  const even = (/** @type {number} */ x) => Math.max(2, Math.round((x * k) / 2) * 2)
  return { w: even(w), h: even(h) }
}
