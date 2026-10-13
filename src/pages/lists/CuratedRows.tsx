import { PosterCard } from '../../components/PosterCard'
import { Row } from '../../components/Row'
import { curatedById, curatedPath } from '../../lib/curated'
import { curatedItemPath, loadCurated } from '../../lib/discoverApi'
import { settingsStore, useStore } from '../../lib/store'
import { useNearViewport, useTmdbQuery } from '../home/lazy'

// Filas opcionales de Inicio con las listas curadas que el usuario marcó ("+ Mostrar en Inicio").

const ROW_LIMIT = 20

function CuratedRow({ id }: { id: string }) {
  const def = curatedById(id)
  const [ref, visible] = useNearViewport<HTMLDivElement>(false)
  const state = useTmdbQuery(visible && def ? `curated|${id}` : undefined, () => loadCurated(id))
  if (!def) return null
  const items = state.data?.items.slice(0, ROW_LIMIT) ?? []
  return (
    <div ref={ref}>
      <Row
        title={state.data?.title ?? def.title}
        moreTo={curatedPath(def)}
        loading={state.loading || !visible}
        error={state.failed ? 'error' : undefined}
        empty={items.length === 0}
      >
        {items.map((m) => (
          <PosterCard key={m.id} meta={m} to={curatedItemPath(m)} />
        ))}
      </Row>
    </div>
  )
}

export function CuratedRows() {
  const settings = useStore(settingsStore)
  const tmdbOn = settings.tmdbKey.trim().length > 0
  const ids = (settings.curatedRows ?? []).filter((id) => {
    const def = curatedById(id)
    return def && (tmdbOn || !def.needsTmdb)
  })
  return (
    <>
      {ids.map((id) => (
        <CuratedRow key={id} id={id} />
      ))}
    </>
  )
}
