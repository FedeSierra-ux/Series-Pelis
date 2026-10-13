import { PosterCard } from '../../components/PosterCard'
import { Row } from '../../components/Row'
import type { CatalogRowDef } from '../../lib/catalogPrefs'
import { useMergedCatalog } from '../../lib/catalogRows'
import { useHiddenIds } from '../../lib/ratings'
import { withoutHidden } from '../../lib/recommend'
import { useNearViewport } from './lazy'

const ROW_LIMIT = 30

/** Fila de Inicio que junta varios catálogos (fusionados en el gestor de catálogos). */
export function MergedCatalogRow({ row, eager }: { row: CatalogRowDef; eager: boolean }) {
  const [ref, visible] = useNearViewport<HTMLDivElement>(eager)
  const { data, loading, error } = useMergedCatalog(visible ? row.sources : undefined)
  const hidden = useHiddenIds()
  // Sin lo marcado "Ya no me interesa", igual que las otras filas.
  const items = withoutHidden(data?.slice(0, ROW_LIMIT) ?? [], hidden)
  return (
    <div ref={ref}>
      <Row
        title={row.name}
        moreTo={`/discover/${encodeURIComponent(row.type)}?row=${encodeURIComponent(row.key)}`}
        loading={loading || !visible}
        error={error}
        empty={items.length === 0}
      >
        {items.map((m, i) => (
          <PosterCard key={m.id} meta={{ ...m, type: m.type ?? row.type }} eager={eager && i < 6} />
        ))}
      </Row>
    </div>
  )
}
