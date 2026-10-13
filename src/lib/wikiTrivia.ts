import { cached, fetchJson } from './cache'

// "¿Sabías que?": datos curiosos sacados de Wikipedia en español. El artículo se busca por el id de
// IMDb en Wikidata (propiedad P345 → enlace a eswiki), así no hay confusiones con títulos repetidos.
// Se guardan solo los puntos ya elegidos (30 días), no el artículo entero.

const DAY = 24 * 60 * 60 * 1000
const TTL = 30 * DAY
const ESWIKI = 'https://es.wikipedia.org'
const MIN_LEN = 50
const MAX_LEN = 240
export const MAX_POINTS = 5
/** Con menos que esto la sección no se muestra. */
export const MIN_POINTS = 2

export interface WikiTrivia {
  title?: string
  url?: string
  points: string[]
}

type Kind = 'trivia' | 'production' | 'reception'

const KIND_RULES: [Kind, RegExp][] = [
  ['trivia', /curiosidad|datos? curiosos?|anécdota|trivia/i],
  ['production', /producci|rodaje|filmaci|desarroll|concepci|guion|casting|selecci[oó]n del (reparto|elenco)|efectos|maquillaje|vestuario|precisi[oó]n|influencia|referencias y|homenaje|inspiraci|origen/i],
  ['reception', /recepci|taquilla|cr[ií]tica|legado|impacto|audiencia/i],
]

/** Secciones que no sirven para datos sueltos: listas de premios, reparto, música, notas, etc. */
const SKIP = /premio|nominaci|reparto$|^reparto|elenco|personajes|doblaje|argumento|sinopsis|trama|m[uú]sica|banda sonora|temporadas|episodios|lanzamiento en|v[eé]ase|^referencias$|^notas|bibliograf|enlaces|galer[ií]a|fuentes/i

const KIND_ORDER: Record<Kind, number> = { trivia: 0, production: 1, reception: 2 }

/** Frases que no se entienden fuera de contexto. */
const NEEDS_CONTEXT = /^(eso|esto|ello|esta|este|estos|estas|ambas|ambos|dicha|dicho|dichas|dichos|allí|ahí|los dos|las dos|añadió|agregó|explicó|comentó|declaró|afirmó|dijo|sin embargo|por otro lado|por otra parte|asimismo|en cambio)(?=[\s,.;:]|$)/i

export interface WikiSection {
  /** Encabezados desde el nivel 2 hasta este (ej. ["Producción", "Rodaje"]). */
  path: string[]
  body: string
}

/** Limpia el texto plano de la API: espacios de ancho cero, paréntesis vacíos y espacios de más. */
export function cleanText(s: string): string {
  return s
    .replace(/[​‎‏﻿]/g, '')
    .replace(/\(\s*[,;]?\s*\)/g, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Corta el texto plano (con encabezados "== Título ==") en secciones. */
export function splitSections(text: string): WikiSection[] {
  const out: WikiSection[] = []
  const path: string[] = []
  let body: string[] = []
  const flush = () => {
    if (path.length && body.join('').trim()) out.push({ path: [...path], body: body.join('\n').trim() })
    body = []
  }
  for (const line of text.split('\n')) {
    const m = /^(={2,6})\s*(.*?)\s*\1\s*$/.exec(line)
    if (m) {
      flush()
      const level = m[1].length - 2
      path.length = level
      path[level] = cleanText(m[2])
      // Si falta un nivel intermedio, no dejamos huecos.
      for (let i = 0; i < path.length; i++) path[i] ??= ''
    } else {
      body.push(line)
    }
  }
  flush()
  return out
}

/** Divide un párrafo en oraciones sin cortar en abreviaturas ("EE. UU.", "Sr.", "p. ej."). */
export function splitSentences(paragraph: string): string[] {
  const parts = paragraph.split(/(?<=[.!?…])\s+(?=[«"“¿¡(]?[A-ZÁÉÍÓÚÑ0-9])/)
  const out: string[] = []
  for (const part of parts) {
    const prev = out[out.length - 1]
    if (prev && /(?:^|\s)(?:[A-ZÁÉÍÓÚ][a-záéíóú]{0,2}|[a-z]{1,2}|[A-Z]{1,3})\.$/.test(prev)) out[out.length - 1] = `${prev} ${part}`
    else out.push(part)
  }
  return out.map((s) => s.trim()).filter(Boolean)
}

function kindOf(path: string[]): Kind | undefined {
  const named = path.filter(Boolean)
  if (named.length === 0 || named.some((h) => SKIP.test(h))) return undefined
  // Manda el encabezado más específico; si no dice nada, el de arriba.
  for (const h of [...named].reverse()) {
    const hit = KIND_RULES.find(([, re]) => re.test(h))
    if (hit) return hit[0]
  }
  return undefined
}

const count = (s: string, ch: string) => s.split(ch).length - 1

function usable(s: string): boolean {
  return (
    s.length >= MIN_LEN &&
    s.length <= MAX_LEN &&
    !s.endsWith(':') &&
    !NEEDS_CONTEXT.test(s) &&
    /^[«"“¿¡(]?[A-ZÁÉÍÓÚÑ0-9]/.test(s) &&
    // Líneas de listas de premios o de reparto ("(1999) Mejor montaje, para…", "Keanu Reeves como Neo").
    !/^\(\d{4}\)/.test(s) &&
    // Citas cortadas a la mitad.
    count(s, '«') === count(s, '»') &&
    count(s, '“') === count(s, '”') &&
    count(s, '"') % 2 === 0 &&
    count(s, '(') === count(s, ')') &&
    !/^[^,.]{0,40}\scomo\s[^,.]{0,40}\.?$/.test(s)
  )
}

/** Candidatos de una sección: en "Curiosidades" cada renglón; en el resto, las primeras oraciones de cada párrafo. */
function candidates(section: WikiSection, kind: Kind): string[] {
  const out: string[] = []
  for (const raw of section.body.split('\n')) {
    const para = cleanText(raw)
    if (!para) continue
    if (kind === 'trivia' && usable(para)) {
      out.push(para)
      continue
    }
    const sentences = splitSentences(para).filter(usable)
    out.push(...sentences.slice(0, kind === 'trivia' ? 1 : 2))
  }
  return out
}

/**
 * Elige hasta `max` datos cortos del artículo: primero de "Curiosidades", después de producción/rodaje
 * y de recepción, alternando entre secciones para que no salgan todos del mismo lugar.
 */
export function extractTrivia(text: string, max = MAX_POINTS): string[] {
  const pools = splitSections(text)
    .map((s, i) => ({ kind: kindOf(s.path), i, s }))
    .filter((x): x is { kind: Kind; i: number; s: WikiSection } => !!x.kind)
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.i - b.i)
    .map((x) => candidates(x.s, x.kind))
    .filter((c) => c.length > 0)

  const points: string[] = []
  const seen = new Set<string>()
  for (let round = 0; points.length < max && pools.some((p) => p.length > round); round++) {
    for (const pool of pools) {
      const p = pool[round]
      if (!p || seen.has(p)) continue
      seen.add(p)
      points.push(p)
      if (points.length >= max) break
    }
  }
  return points.length >= MIN_POINTS ? points : []
}

// ---------- Red ----------

/** Título del artículo de eswiki para un id de IMDb, vía Wikidata (SPARQL; si falla, la API común). */
export async function eswikiTitleFor(imdbId: string): Promise<string | undefined> {
  if (!/^tt\d+$/.test(imdbId)) return undefined
  try {
    const query = `SELECT ?a WHERE { ?i wdt:P345 "${imdbId}" . ?a schema:about ?i ; schema:isPartOf <${ESWIKI}/> . } LIMIT 1`
    const res = await fetchJson<{ results: { bindings: { a?: { value: string } }[] } }>(
      `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`,
    )
    const url = res.results.bindings[0]?.a?.value
    return url ? titleFromUrl(url) : undefined
  } catch {
    const api = 'https://www.wikidata.org/w/api.php?format=json&origin=*'
    const search = await fetchJson<{ query?: { search?: { title: string }[] } }>(
      `${api}&action=query&list=search&srlimit=1&srsearch=${encodeURIComponent(`haswbstatement:P345=${imdbId}`)}`,
    )
    const q = search.query?.search?.[0]?.title
    if (!q) return undefined
    const ent = await fetchJson<{ entities?: Record<string, { sitelinks?: { eswiki?: { title: string } } }> }>(
      `${api}&action=wbgetentities&props=sitelinks&sitefilter=eswiki&ids=${encodeURIComponent(q)}`,
    )
    return ent.entities?.[q]?.sitelinks?.eswiki?.title
  }
}

export function titleFromUrl(url: string): string | undefined {
  const m = /\/wiki\/(.+)$/.exec(url)
  return m ? decodeURIComponent(m[1]).replace(/_/g, ' ') : undefined
}

export const wikiUrl = (title: string) => `${ESWIKI}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`

async function loadTrivia(imdbId: string): Promise<WikiTrivia> {
  const title = await eswikiTitleFor(imdbId)
  if (!title) return { points: [] }
  const res = await fetchJson<{ query?: { pages?: { title: string; extract?: string; missing?: boolean }[] } }>(
    `${ESWIKI}/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&format=json&formatversion=2&origin=*&titles=${encodeURIComponent(title)}`,
  )
  const page = res.query?.pages?.[0]
  if (!page?.extract) return { points: [] }
  return { title: page.title, url: wikiUrl(page.title), points: extractTrivia(page.extract) }
}

/** Datos curiosos de un título (cacheado 30 días, también cuando no hay nada). */
export function getWikiTrivia(imdbId: string): Promise<WikiTrivia> {
  return cached(`wiki-trivia:v1:${imdbId}`, () => loadTrivia(imdbId), TTL)
}
