import { formatStars, HIGH_STARS } from './stars'
import type { NotInterestedEntry, RatingEntry, WatchEntry } from './store'

// "Para vos": recomendaciones personales a partir de lo que viste y de tus estrellas.
// Lógica pura: los pedidos a TMDB están en `pages/home/ForYouRow.tsx`.

const DAY = 24 * 60 * 60 * 1000

/** Un título tuyo que sirve de punto de partida (o de freno, si le pusiste pocas estrellas). */
export interface Seed {
  metaId: string
  type: string
  name: string
  /** > 0 te gustó (más alto, más pesa); < 0 no te gustó: lo parecido baja. */
  weight: number
  stars?: number
  /** Episodios vistos (series). */
  episodes: number
  lastAt: number
  tmdbId?: number
}

/** Peso de tus estrellas: 5★ pesa 3 veces lo que una serie vista sin puntuar; 2,5★ o menos resta. */
export function starWeight(stars: number): number {
  if (stars >= HIGH_STARS) return stars - 2
  if (stars >= 3.5) return 1
  if (stars >= 3) return 0.6
  return -(3 - stars)
}

/** Lo que viste hace mucho pesa menos (nunca menos de la mitad). */
export function recency(lastAt: number, now: number, halfLifeDays = 120): number {
  const days = Math.max(0, (now - lastAt) / DAY)
  return 0.5 + 0.5 * Math.exp(-days / halfLifeDays)
}

/** Todos los títulos que viste o puntuaste, con su peso. */
export function buildSeeds(progress: Record<string, WatchEntry>, ratings: Record<string, RatingEntry>, now = Date.now()): Seed[] {
  const byMeta = new Map<string, { type: string; name: string; lastAt: number; episodes: number; watched: boolean; ratio: number }>()
  for (const e of Object.values(progress)) {
    const cur = byMeta.get(e.metaId) ?? { type: e.type, name: e.name, lastAt: 0, episodes: 0, watched: false, ratio: 0 }
    cur.lastAt = Math.max(cur.lastAt, e.updatedAt)
    if (e.watched) {
      cur.watched = true
      if (e.season !== undefined) cur.episodes++
    }
    if (e.duration > 0) cur.ratio = Math.max(cur.ratio, e.position / e.duration)
    byMeta.set(e.metaId, cur)
  }

  const seeds: Seed[] = []
  for (const [metaId, m] of byMeta) {
    const rating = ratings[metaId]
    if (rating) continue // las puntuadas van abajo, con su propio peso
    const isSeries = m.type !== 'movie'
    // Cuánto le dedicaste: una peli vista entera o una serie de varios episodios cuenta completa.
    const engagement = isSeries ? Math.min(1, 0.4 + 0.15 * m.episodes) : m.watched ? 1 : m.ratio >= 0.5 ? 0.6 : 0.3
    seeds.push({ metaId, type: m.type, name: m.name, weight: engagement * recency(m.lastAt, now), episodes: m.episodes, lastAt: m.lastAt })
  }
  for (const [metaId, r] of Object.entries(ratings)) {
    const watched = byMeta.get(metaId)
    const lastAt = Math.max(r.at, watched?.lastAt ?? 0)
    seeds.push({
      metaId,
      type: r.type,
      name: r.name,
      // Las estrellas son explícitas: se gastan más despacio que lo visto.
      weight: starWeight(r.stars) * recency(lastAt, now, 365),
      stars: r.stars,
      episodes: watched?.episodes ?? 0,
      lastAt,
      tmdbId: r.tmdbId,
    })
  }
  return seeds
}

/** Los que más te gustaron (para pedir recomendaciones) y los que menos (para restar). */
export function pickSeeds(seeds: Seed[], maxPositive = 8, maxNegative = 2): { positive: Seed[]; negative: Seed[] } {
  return {
    positive: seeds.filter((s) => s.weight > 0).sort((a, b) => b.weight - a.weight || b.lastAt - a.lastAt).slice(0, maxPositive),
    negative: seeds.filter((s) => s.weight < 0).sort((a, b) => a.weight - b.weight).slice(0, maxNegative),
  }
}

export interface RecInput {
  /** `tmdb:movie:603` / `tmdb:tv:1396` (el mismo id que usan las tarjetas de TMDB). */
  key: string
  /** Puntaje de TMDB (0 a 10), si lo hay. */
  vote?: number
}

export interface SeedRecs {
  seed: Seed
  recs: RecInput[]
}

export interface FavoriteActor {
  id: number
  name: string
  /** En cuántos de tus títulos aparece. */
  count: number
}

export interface Candidate {
  key: string
  score: number
  /** Títulos tuyos que la recomiendan (solo los que suman), del que más aporta al que menos. */
  because: { seed: Seed; points: number }[]
  actor?: FavoriteActor
}

/**
 * Junta las recomendaciones de cada título tuyo: cada una suma el peso del título (más si está
 * arriba en la lista de TMDB), las de títulos que puntuaste bajo restan, y lo ya visto, puntuado
 * o marcado "Ya no me interesa" (`exclude`) no aparece.
 */
export function scoreCandidates(list: SeedRecs[], exclude: Set<string>): Candidate[] {
  const map = new Map<string, Candidate & { vote?: number }>()
  for (const { seed, recs } of list) {
    recs.forEach((rec, rank) => {
      if (exclude.has(rec.key)) return
      const position = 1 - rank / (Math.max(recs.length, 1) * 1.5)
      const points = seed.weight * position
      const cur = map.get(rec.key) ?? { key: rec.key, score: 0, because: [], vote: rec.vote }
      cur.score += points
      if (points > 0 && !cur.because.some((b) => b.seed.metaId === seed.metaId)) cur.because.push({ seed, points })
      map.set(rec.key, cur)
    })
  }
  const out: Candidate[] = []
  for (const c of map.values()) {
    if (c.because.length === 0) continue
    // Un empujoncito a lo bien puntuado en TMDB (±0,2 como mucho).
    const vote = c.vote ? Math.max(-0.2, Math.min(0.2, (c.vote - 6.5) * 0.08)) : 0
    const score = c.score + vote
    if (score <= 0) continue
    c.because.sort((a, b) => b.points - a.points)
    out.push({ key: c.key, score, because: c.because })
  }
  return out.sort((a, b) => b.score - a.score)
}

/** Actores que aparecen en al menos `minTitles` de tus títulos (solo los primeros del reparto). */
export function favoriteActors(casts: { cast: { id: number; name: string }[] }[], minTitles = 2, topBilled = 10): Map<number, FavoriteActor> {
  const counts = new Map<number, FavoriteActor>()
  for (const { cast } of casts) {
    const seen = new Set<number>()
    for (const p of cast.slice(0, topBilled)) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      const cur = counts.get(p.id) ?? { id: p.id, name: p.name, count: 0 }
      cur.count++
      counts.set(p.id, cur)
    }
  }
  for (const [id, a] of counts) if (a.count < minTitles) counts.delete(id)
  return counts
}

/** Suma puntos a las que tienen a alguno de tus actores y anota el más visto (para el "por qué"). */
export function applyActors(
  candidates: Candidate[],
  castOf: Map<string, { id: number; name: string }[]>,
  favorites: Map<number, FavoriteActor>,
  topBilled = 10,
): Candidate[] {
  if (favorites.size === 0) return candidates
  return candidates
    .map((c) => {
      let actor: FavoriteActor | undefined
      for (const p of (castOf.get(c.key) ?? []).slice(0, topBilled)) {
        const fav = favorites.get(p.id)
        if (fav && (!actor || fav.count > actor.count)) actor = fav
      }
      return actor ? { ...c, actor, score: c.score + 0.25 * Math.min(actor.count, 4) } : c
    })
    .sort((a, b) => b.score - a.score)
}

/**
 * Que un solo título no llene la fila: cada recomendación más que sale del mismo título tuyo
 * vale un 15 % menos al ordenar (las de 5★ siguen arriba, pero se intercalan con las demás).
 */
export function diversify(candidates: Candidate[], decay = 0.85): Candidate[] {
  const pool = [...candidates]
  const used = new Map<string, number>()
  const out: Candidate[] = []
  while (pool.length) {
    let best = 0
    let bestScore = -Infinity
    pool.forEach((c, i) => {
      const adjusted = c.score * decay ** (used.get(c.because[0]?.seed.metaId ?? '') ?? 0)
      if (adjusted > bestScore) {
        bestScore = adjusted
        best = i
      }
    })
    const [pick] = pool.splice(best, 1)
    const src = pick.because[0]?.seed.metaId ?? ''
    used.set(src, (used.get(src) ?? 0) + 1)
    out.push(pick)
  }
  return out
}

/** "Porque le diste 5★ a Dark", "Con Cillian Murphy, que viste en 3 títulos", "Porque viste Breaking Bad". */
export function whyLine(c: Candidate): string {
  const top = c.because[0]
  if (top?.seed.stars !== undefined && top.seed.stars >= HIGH_STARS) return `Porque le diste ${formatStars(top.seed.stars)}★ a ${top.seed.name}`
  if (c.actor && c.actor.count >= 2) return `Con ${c.actor.name}, que viste en ${c.actor.count} títulos`
  if (c.because.length >= 2) return `Porque viste ${c.because[0].seed.name} y ${c.because[1].seed.name}`
  if (top) return `Porque viste ${top.seed.name}`
  return 'Para vos'
}

// ---------- "Ya no me interesa" ----------

/** `tmdb:movie:603` / `tmdb:tv:1396` para un tipo de la app y un id de TMDB. */
export const tmdbKeyOf = (type: string, tmdbId: number) => `tmdb:${type === 'movie' ? 'movie' : 'tv'}:${tmdbId}`

/** Todos los ids con que puede aparecer en pantalla un título marcado (IMDb y TMDB). */
export function hiddenIdSet(entries: Pick<NotInterestedEntry, 'id' | 'type' | 'tmdbId'>[]): Set<string> {
  const set = new Set<string>()
  for (const e of entries) {
    set.add(e.id)
    if (e.tmdbId) set.add(tmdbKeyOf(e.type, e.tmdbId))
  }
  return set
}

/** Saca de una lista los títulos marcados "Ya no me interesa". */
export function withoutHidden<T extends { id: string }>(items: T[], hidden: Set<string>): T[] {
  return hidden.size === 0 ? items : items.filter((i) => !hidden.has(i.id))
}
