// Los navegadores solo entienden subtítulos WebVTT; la mayoría de los addons dan SRT.

export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    // Algunos SRT traen la hora con un solo dígito ("0:00:01,000"): VTT exige dos.
    .replace(/(\d{1,2}):(\d{2}):(\d{2}),(\d{3})/g, (_m, h: string, m: string, s: string, ms: string) => `${h.padStart(2, '0')}:${m}:${s}.${ms}`)
    .trim()
  return 'WEBVTT\n\n' + body + '\n'
}

/** `0:01:02.34` (ASS) → `00:01:02.340` (VTT). */
function assTime(t: string): string | undefined {
  const m = /^(\d+):(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/.exec(t.trim())
  if (!m) return undefined
  const pad = (n: string, len = 2) => n.padStart(len, '0')
  return `${pad(m[1])}:${pad(m[2])}:${pad(m[3])}.${m[4].padEnd(3, '0')}`
}

/** ASS/SSA básico: solo tiempos y texto, sin estilos ni posiciones. */
export function assToVtt(ass: string): string {
  const lines = ass.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  let format = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text']
  let inEvents = false
  const cues: { start: string; end: string; text: string }[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (line.startsWith('[')) {
      inEvents = /^\[events\]$/i.test(line)
      continue
    }
    if (!inEvents) continue
    const sep = line.indexOf(':')
    if (sep < 0) continue
    const key = line.slice(0, sep).trim().toLowerCase()
    const value = line.slice(sep + 1).trim()
    if (key === 'format') {
      format = value.split(',').map((f) => f.trim().toLowerCase())
      continue
    }
    if (key !== 'dialogue') continue
    const parts = value.split(',')
    // El texto es el último campo y puede tener comas.
    const fields = [...parts.slice(0, format.length - 1), parts.slice(format.length - 1).join(',')]
    const get = (name: string) => fields[format.indexOf(name)] ?? ''
    // Los dibujos vectoriales ({\p1}) no son texto.
    if (/\{[^}]*\\p[1-9]/.test(get('text'))) continue
    const start = assTime(get('start'))
    const end = assTime(get('end'))
    const text = get('text')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\[Nn]/g, '\n')
      .replace(/\\h/g, ' ')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n')
    if (start && end && text) cues.push({ start, end, text })
  }
  cues.sort((a, b) => a.start.localeCompare(b.start))
  return 'WEBVTT\n\n' + cues.map((c) => `${c.start} --> ${c.end}\n${c.text}`).join('\n\n') + '\n'
}

/** Convierte a VTT según el contenido (o la extensión, si se sabe). */
export function toVtt(text: string, name = ''): string {
  const t = text.replace(/^﻿/, '')
  if (t.trimStart().startsWith('WEBVTT')) return t
  if (/\.(ass|ssa)$/i.test(name) || /^\s*\[script info\]/i.test(t)) return assToVtt(t)
  return srtToVtt(t)
}

// Descripciones de sonidos de los subtítulos para sordos: [música], (risas), ♪ letra ♪, "HOMBRE: hola".
const SOUND_RE = /\[[^\]\n]*\]|\([^)\n]*\)|[♪♫][^♪♫\n]*[♪♫]?|[♪♫]+/g
const SPEAKER_RE = /^(-\s*)?([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9 .'#-]*):\s*/
// "NO:", "SÍ:", "OK:" al principio de una frase no son nombres de quien habla.
const INTERJECTIONS = new Set(['NO', 'SI', 'SÍ', 'OK', 'AH', 'EH', 'OH', 'AY', 'UY'])

/** Un nombre de hablante tiene al menos 3 letras y no es una interjección común. */
function isSpeakerName(name: string): boolean {
  const letters = name.match(/\p{L}/gu)?.length ?? 0
  return letters >= 3 && !INTERJECTIONS.has(name.trim())
}

function cleanSdhLine(line: string): string {
  return line
    .replace(SOUND_RE, '')
    .replace(SPEAKER_RE, (whole: string, dash: string | undefined, name: string) => (isSpeakerName(name) ? (dash ?? '') : whole))
    .replace(/<([a-z]+)[^>]*>\s*<\/\1>/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Saca las descripciones de sonidos de un VTT; los cues que quedan vacíos se borran. */
export function stripSdh(vtt: string): string {
  const blocks = vtt.replace(/\r\n?/g, '\n').split(/\n{2,}/)
  const out: string[] = []
  for (const block of blocks) {
    const lines = block.split('\n')
    const timing = lines.findIndex((l) => l.includes('-->'))
    if (timing < 0) {
      out.push(block)
      continue
    }
    const text = lines
      .slice(timing + 1)
      .map(cleanSdhLine)
      // Un guion suelto ("- ") es lo que queda de un diálogo que era solo un sonido.
      .filter((l) => l && !/^[-–—\s.,…]*$/.test(l))
    if (text.length === 0) continue
    // Si quedó un solo renglón de diálogo, el guion inicial sobra.
    if (text.length === 1) text[0] = text[0].replace(/^-\s*/, '')
    out.push([...lines.slice(0, timing + 1), ...text].join('\n'))
  }
  return out.join('\n\n') + '\n'
}

function decode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer.slice(0, 2))
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(buffer)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(buffer)
  const text = new TextDecoder('utf-8').decode(buffer)
  // Muchos .srt en español vienen en Windows-1252: si hay caracteres inválidos, reintentamos.
  return text.includes('�') ? new TextDecoder('windows-1252').decode(buffer) : text
}

// ---------- Caché de subtítulos ----------
// Cada episodio suma un texto y una URL blob: en una tanda larga en la TV eso no tiene que crecer sin fin.
// Se guardan los últimos SUB_CACHE_MAX y al desalojar uno se libera su URL blob (`revokeObjectURL`).
// Los archivos propios no se desalojan: su URL blob es lo único que hay (no se pueden volver a bajar).

/** Cuánto se espera un subtítulo antes de darlo por caído. */
export const SUB_TIMEOUT_MS = 15_000
/** Más que esto no es un subtítulo (o es uno roto): se rechaza antes de convertirlo. */
export const SUB_MAX_BYTES = 5 * 1024 * 1024
export const SUB_CACHE_MAX = 20

/** VTT ya convertido, por URL original (o por la URL local de un archivo cargado). */
const vttTexts = new Map<string, string>()
const blobUrls = new Map<string, string>()
/** Claves de los archivos propios: no se desalojan. */
const pinned = new Set<string>()

const toBlobUrl = (vtt: string) => URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))

function revoke(url: string) {
  try {
    URL.revokeObjectURL(url)
  } catch {
    // nada
  }
}

/** Marca `key` como recién usada (un Map conserva el orden de inserción: el primero es el más viejo). */
function touch<T>(map: Map<string, T>, key: string, value: T) {
  map.delete(key)
  map.set(key, value)
}

/** Deja como mucho SUB_CACHE_MAX entradas (sin contar las fijas), liberando las URL blob desalojadas. */
function trim() {
  for (const map of [vttTexts, blobUrls] as Map<string, string>[]) {
    let extra = [...map.keys()].filter((k) => !pinned.has(k)).length - SUB_CACHE_MAX
    for (const key of map.keys()) {
      if (extra <= 0) break
      if (pinned.has(key)) continue
      if (map === blobUrls) revoke(map.get(key)!)
      map.delete(key)
      extra--
    }
  }
}

/** Cuántas entradas hay en la caché (para los tests). */
export function subtitleCacheSize() {
  return { texts: vttTexts.size, blobs: blobUrls.size }
}

/** Vacía la caché y libera todas las URL blob (incluidas las de archivos propios). */
export function clearSubtitleCache() {
  for (const url of blobUrls.values()) revoke(url)
  vttTexts.clear()
  blobUrls.clear()
  pinned.clear()
}

/**
 * Baja el archivo con tiempo límite y tope de tamaño. `AbortController` + `setTimeout` en vez de
 * `AbortSignal.timeout`, que no existe en navegadores de TV viejos.
 */
async function fetchLimited(url: string): Promise<ArrayBuffer> {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : undefined
  const timer = setTimeout(() => ctrl?.abort(), SUB_TIMEOUT_MS)
  try {
    const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const declared = Number(res.headers?.get?.('content-length'))
    if (declared > SUB_MAX_BYTES) {
      ctrl?.abort()
      throw new Error('Subtítulo demasiado grande')
    }
    const buffer = await res.arrayBuffer()
    if (buffer.byteLength > SUB_MAX_BYTES) throw new Error('Subtítulo demasiado grande')
    return buffer
  } catch (err) {
    if (ctrl?.signal.aborted && !(err instanceof Error && err.message === 'Subtítulo demasiado grande')) throw new Error('El subtítulo tardó demasiado')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Descarga el subtítulo, lo convierte a VTT si hace falta y devuelve una URL local.
 * Con `stripSdh` saca las descripciones de sonidos.
 */
export async function loadSubtitle(url: string, opts: { stripSdh?: boolean } = {}): Promise<string> {
  const key = opts.stripSdh ? `${url}#sin-sdh` : url
  const hit = blobUrls.get(key)
  if (hit) {
    touch(blobUrls, key, hit)
    return hit
  }
  let vtt = vttTexts.get(url)
  if (vtt === undefined) {
    vtt = toVtt(decode(await fetchLimited(url)), new URL(url, location.href).pathname)
  }
  touch(vttTexts, url, vtt)
  const blobUrl = toBlobUrl(opts.stripSdh ? stripSdh(vtt) : vtt)
  touch(blobUrls, key, blobUrl)
  trim()
  return blobUrl
}

export const SUBTITLE_FILE_RE = /\.(srt|vtt|ass|ssa)$/i

/** Subtítulo propio (archivo de la compu o el celu): devuelve la URL local para usar como si fuera de un addon. */
export async function loadSubtitleFile(file: File): Promise<string> {
  if (!SUBTITLE_FILE_RE.test(file.name)) throw new Error('Formato no soportado')
  if (file.size > SUB_MAX_BYTES) throw new Error('Archivo demasiado grande')
  const vtt = toVtt(decode(await file.arrayBuffer()), file.name)
  if (!vtt.includes('-->')) throw new Error('El archivo no tiene subtítulos')
  const url = toBlobUrl(vtt)
  pinned.add(url)
  vttTexts.set(url, vtt)
  blobUrls.set(url, url)
  return url
}
