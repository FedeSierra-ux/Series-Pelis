import { useEffect, useMemo } from 'react'
import { PosterCard } from '../../components/PosterCard'
import { Row } from '../../components/Row'
import { notInterestedStore, ratingsStore, resolveNotInterestedTmdbIds, useHiddenIds } from '../../lib/ratings'
import {
  applyActors,
  buildSeeds,
  diversify,
  favoriteActors,
  hiddenIdSet,
  pickSeeds,
  scoreCandidates,
  whyLine,
  type Seed,
  type SeedRecs,
} from '../../lib/recommend'
import { progressStore, useStore } from '../../lib/store'
import {
  findByImdb,
  getDetails,
  parseTmdbId,
  tmdbToPreview,
  toTmdbType,
  type TmdbCast,
  type TmdbDetails,
  type TmdbListItem,
  type TmdbType,
} from '../../lib/tmdb'
import type { MetaPreview } from '../../lib/types'
import { mapLimit } from '../../lib/upNext'
import { useNearViewport, useTmdbQuery } from './lazy'

// "Para vos" (v0.5): recomendaciones de TMDB a partir de lo que viste y de tus estrellas, con una
// línea de "por qué". El puntaje está en `lib/recommend.ts`; acá solo se piden los datos.

export interface ForYouItem {
  meta: MetaPreview
  why: string
}

const SHOW = 20
/** Títulos tuyos que se traducen a TMDB para no recomendarte lo que ya viste. */
const MAX_EXCLUDE_LOOKUPS = 40
/** Los resultados quedan en memoria por sesión: volver a Inicio no pide nada de nuevo. */
const memory = new Map<string, ForYouItem[]>()

type TmdbRef = { type: TmdbType; id: number }

async function toTmdb(seed: Seed): Promise<TmdbRef | undefined> {
  const parsed = parseTmdbId(seed.metaId)
  if (parsed) return parsed
  if (!seed.metaId.startsWith('tt')) return undefined
  const id = seed.tmdbId ?? (await findByImdb(seed.metaId, seed.type).catch(() => undefined))
  return id ? { type: toTmdbType(seed.type), id } : undefined
}

const keyOf = (type: TmdbType, id: number) => `tmdb:${type}:${id}`

function castOf(d: TmdbDetails | undefined): TmdbCast[] {
  return (d?.credits?.cast ?? d?.aggregate_credits?.cast ?? []).slice(0, 10)
}

async function loadForYou(): Promise<ForYouItem[]> {
  const seeds = buildSeeds(progressStore.get(), ratingsStore.get())
  const { positive, negative } = pickSeeds(seeds)
  if (positive.length === 0) return []
  const picked = [...positive, ...negative]

  // Todo lo que viste o puntuaste queda afuera; los más recientes también por su id de TMDB.
  const recent = [...seeds].sort((a, b) => b.lastAt - a.lastAt).slice(0, MAX_EXCLUDE_LOOKUPS)
  const toResolve = [...new Map([...picked, ...recent].map((s) => [s.metaId, s])).values()]
  const refs = new Map<string, TmdbRef>()
  await mapLimit(toResolve, 6, async (s) => {
    const ref = await toTmdb(s)
    if (ref) refs.set(s.metaId, ref)
  })
  const exclude = hiddenIdSet(Object.values(notInterestedStore.get()))
  for (const s of seeds) exclude.add(s.metaId)
  for (const ref of refs.values()) exclude.add(keyOf(ref.type, ref.id))

  // Una sola llamada por título trae recomendaciones y reparto.
  const details = await mapLimit(picked, 4, async (seed) => {
    const ref = refs.get(seed.metaId)
    if (!ref) return undefined
    const d = await getDetails(ref.type, ref.id).catch(() => undefined)
    return d ? { seed, ref, d } : undefined
  })
  const items = new Map<string, TmdbListItem & { media_type: TmdbType }>()
  const lists: SeedRecs[] = []
  for (const x of details) {
    if (!x) continue
    const recs = (x.d.recommendations?.results ?? []).flatMap((item) => {
      const type = item.media_type === 'movie' || item.media_type === 'tv' ? item.media_type : item.media_type ? undefined : x.ref.type
      if (!type) return []
      const key = keyOf(type, item.id)
      if (!items.has(key)) items.set(key, { ...item, media_type: type })
      return [{ key, vote: item.vote_average }]
    })
    lists.push({ seed: x.seed, recs })
  }

  let candidates = scoreCandidates(lists, exclude).slice(0, SHOW + 10)

  // "Con Cillian Murphy, que viste en 3 títulos": actores repetidos entre lo que más te gustó.
  const favorites = favoriteActors(details.flatMap((x) => (x && x.seed.weight > 0 ? [{ cast: castOf(x.d) }] : [])))
  if (favorites.size > 0) {
    const casts = new Map<string, TmdbCast[]>()
    await mapLimit(candidates.slice(0, SHOW), 4, async (c) => {
      const item = items.get(c.key)
      if (!item) return
      const d = await getDetails(item.media_type, item.id).catch(() => undefined)
      casts.set(c.key, castOf(d))
    })
    candidates = applyActors(candidates, casts, favorites)
  }

  return diversify(candidates).flatMap((c) => {
    const item = items.get(c.key)
    return item ? [{ meta: tmdbToPreview(item), why: whyLine(c) }] : []
  })
}

/** Fila "Para vos" de Inicio. Sin TMDB no se monta; sin nada visto queda vacía y no se ve. */
export function ForYouRow({ tmdbKey }: { tmdbKey: string }) {
  const [ref, visible] = useNearViewport<HTMLDivElement>(false)
  const progress = useStore(progressStore)
  const ratings = useStore(ratingsStore)
  const hidden = useHiddenIds()
  useEffect(() => {
    resolveNotInterestedTmdbIds().catch(() => {})
  }, [tmdbKey])
  // Se recalcula si cambian los títulos de partida o sus pesos (no por cada guardado del progreso).
  const seedsKey = useMemo(() => {
    const { positive, negative } = pickSeeds(buildSeeds(progress, ratings))
    return [...positive, ...negative].map((s) => `${s.metaId}:${s.weight.toFixed(1)}`).join(',')
  }, [progress, ratings])
  const depKey = tmdbKey && visible && seedsKey ? `${seedsKey}|${tmdbKey}` : undefined
  const state = useTmdbQuery(
    depKey,
    async () => {
      const data = await loadForYou()
      if (depKey) memory.set(depKey, data)
      return data
    },
    () => (depKey ? memory.get(depKey) : undefined),
  )
  const items = (state.data ?? []).filter((i) => !hidden.has(i.meta.id)).slice(0, SHOW)
  return (
    <div ref={ref}>
      {seedsKey && (
        <Row title="Para vos" loading={state.loading || !visible} error={state.failed ? 'error' : undefined} empty={items.length === 0}>
          {items.map((it, i) => (
            <div key={it.meta.id} className="foryou-item">
              <PosterCard meta={it.meta} eager={i < 6} />
              <p className="foryou-why" title={it.why}>
                {it.why}
              </p>
            </div>
          ))}
        </Row>
      )}
    </div>
  )
}
