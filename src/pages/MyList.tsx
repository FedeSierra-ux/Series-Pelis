import { useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { Picker } from '../components/Picker'
import { PosterCard } from '../components/PosterCard'
import { UserStars } from '../components/StarRating'
import { progressStore, ratingsStore, useStore, watchlistStore } from '../lib/store'

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

  const items = Object.values(list).sort((a, b) => {
    if (sort === 'mine') return (ratings[b.id]?.stars ?? 0) - (ratings[a.id]?.stars ?? 0) || b.addedAt - a.addedAt
    if (sort === 'rating') return Number(b.imdbRating ?? 0) - Number(a.imdbRating ?? 0)
    if (sort === 'name') return a.name.localeCompare(b.name, 'es')
    return b.addedAt - a.addedAt
  })
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
                meta={{ id: m.id, type: m.type, name: m.name, poster: m.poster, releaseInfo: m.year, imdbRating: m.imdbRating }}
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
