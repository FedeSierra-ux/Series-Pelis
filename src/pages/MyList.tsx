import { useMemo, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { Picker } from '../components/Picker'
import { PosterCard } from '../components/PosterCard'
import { UserStars } from '../components/StarRating'
import { localTitle, useTitlesVersion } from '../lib/localTitles'
import { progressStore, ratingsStore, useStore, watchlistStore } from '../lib/store'
import type { MetaPreview } from '../lib/types'

// Mi lista completa, en grilla. Desde la v0.23 es lo principal de "Vos" (salió del menú; /list lleva a /me).

type Sort = 'added' | 'rating' | 'name' | 'mine'

const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: 'added', label: 'Agregadas recientemente' },
  { value: 'rating', label: 'Mejor puntaje IMDb' },
  { value: 'mine', label: 'Tu puntaje' },
  { value: 'name', label: 'Nombre' },
]

export function MyListSection() {
  const list = useStore(watchlistStore)
  const progress = useStore(progressStore)
  const [sort, setSort] = useState<Sort>('added')
  const ratings = useStore(ratingsStore)

  // Por nombre ordena con el que se ve (v0.28: el español si se sabe); se reordena cuando llega uno nuevo.
  // Con los otros órdenes los nombres que llegan no cambian nada (cada tarjeta se redibuja sola).
  const titles = useTitlesVersion()
  const nameKey = sort === 'name' ? titles : 0
  const items = useMemo(
    () =>
      Object.values(list).sort((a, b) => {
        if (sort === 'mine') return (ratings[b.id]?.stars ?? 0) - (ratings[a.id]?.stars ?? 0) || b.addedAt - a.addedAt
        if (sort === 'rating') return Number(b.imdbRating ?? 0) - Number(a.imdbRating ?? 0)
        if (sort === 'name') return localTitle(a.id, a.name).localeCompare(localTitle(b.id, b.name), 'es')
        return b.addedAt - a.addedAt
      }),
    [list, sort, ratings, nameKey],
  )
  // Las mismas metas entre redibujos: así las tarjetas (memo) no se redibujan todas por cada nombre que llega.
  const metas = useMemo(() => {
    const out = new Map<string, MetaPreview>()
    for (const m of Object.values(list))
      out.set(m.id, { id: m.id, type: m.type, name: m.name, poster: m.poster, releaseInfo: m.year, imdbRating: m.imdbRating })
    return out
  }, [list])
  const watchedMovies = new Set(Object.values(progress).filter((e) => e.type === 'movie' && e.watched).map((e) => e.metaId))

  return (
    <section className="me-list" aria-labelledby="me-list-title">
      <header className="me-list-head">
        <h2 id="me-list-title">Mi lista</h2>
        {items.length > 1 && (
          <div className="filters">
            <Picker label="Ordenar" value={sort} options={SORT_OPTIONS} onChange={(v) => setSort(v as Sort)} />
          </div>
        )}
      </header>
      {items.length === 0 ? (
        <EmptyState
          icon="list"
          title="Tu lista está vacía"
          text="Usá “+ Mi lista” en cualquier título para guardarlo acá y tenerlo a mano."
          action={{ label: 'Explorar películas', to: '/discover/movie' }}
        />
      ) : (
        <div className="grid">
          {items.map((m) => (
            <div key={m.id} className="rated-card">
              <PosterCard
                meta={metas.get(m.id)!}
                watched={watchedMovies.has(m.id)}
              />
              <UserStars id={m.id} className="on-poster" />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
