import { PosterCard } from '../../components/PosterCard'
import { Row } from '../../components/Row'
import type { CatalogRowDef } from '../../lib/catalogPrefs'
import { useMergedCatalog, useRowShape } from '../../lib/catalogRows'
import { useHiddenIds } from '../../lib/ratings'
import { withoutHidden } from '../../lib/recommend'
import { useNearViewport } from './lazy'

const ROW_LIMIT = 30

function downNotice(row: CatalogRowDef): string {
  const names = [...new Set(row.sources.map((s) => s.addon.manifest.name))]
  return `${names.join(' y ')} no ${names.length > 1 ? 'responden' : 'responde'} ahora. Probá de nuevo en un rato.`
}

/** Fila de Inicio que junta varios catálogos (fusionados en el gestor de catálogos). */
export function MergedCatalogRow({ row, eager }: { row: CatalogRowDef; eager: boolean }) {
  const [ref, visible] = useNearViewport<HTMLDivElement>(eager)
  const { data, loading, error } = useMergedCatalog(visible ? row.sources : undefined)
  const hidden = useHiddenIds()
  const landscape = useRowShape(row.key) === 'landscape'
  // Sin lo marcado "Ya no me interesa", igual que las otras filas.
  const items = withoutHidden(data?.slice(0, ROW_LIMIT) ?? [], hidden)
  return (
    <div ref={ref}>
      <Row
        title={row.name}
        moreTo={`/discover/${encodeURIComponent(row.type)}?row=${encodeURIComponent(row.key)}`}
        loading={loading || !visible}
        error={error}
        errorNotice={downNotice(row)}
        empty={items.length === 0}
        landscape={landscape}
      >
        {items.map((m, i) => (
          <PosterCard key={m.id} meta={{ ...m, type: m.type ?? row.type }} eager={eager && i < 6} landscape={landscape} hideTop10Label />
        ))}
      </Row>
    </div>
  )
}
