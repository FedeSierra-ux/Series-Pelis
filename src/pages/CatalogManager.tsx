import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DEFAULT_CATALOG_PREFS, mergeRows, moveRow, renameRow, setRowHidden, splitMerge, type CatalogRowDef } from '../lib/catalogPrefs'
import { defaultCatalogLabel, updateCatalogPrefs, useCatalogRows } from '../lib/catalogRows'
import { useTitle } from '../lib/hooks'
import { typeLabel } from '../lib/i18n'

/** Gestor de catálogos: renombrar, ocultar, reordenar y fusionar las filas de Inicio y Descubrir. */
export function CatalogManager() {
  useTitle('Catálogos')
  const rows = useCatalogRows()
  const [filter, setFilter] = useState('all')
  const types = useMemo(() => [...new Set(rows.map((r) => r.type))], [rows])
  const view = filter === 'all' ? rows : rows.filter((r) => r.type === filter)
  const viewKeys = view.map((r) => r.key)
  const allKeys = rows.map((r) => r.key)
  const [status, setStatus] = useState<string>()
  const listRef = useRef<HTMLOListElement>(null)

  /** Después de subir/bajar, el foco sigue al mismo botón de la fila movida (para el control remoto). */
  const move = (key: string, delta: -1 | 1, name: string) => {
    updateCatalogPrefs((p) => moveRow(p, allKeys, key, delta, viewKeys))
    setStatus(`“${name}” ${delta < 0 ? 'subió' : 'bajó'} un lugar`)
    requestAnimationFrame(() => {
      const li = listRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(key)}"]`)
      const btn = li?.querySelector<HTMLButtonElement>(delta < 0 ? '[data-move="up"]' : '[data-move="down"]')
      const target = btn && !btn.disabled ? btn : li?.querySelector<HTMLButtonElement>('[data-move]:not([disabled])')
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: 'nearest' })
    })
  }

  return (
    <div className="page settings catalog-manager">
      <header className="page-header">
        <h1>Catálogos</h1>
        <Link to="/settings" className="btn btn-ghost">
          ← Ajustes
        </Link>
      </header>
      <p className="muted catalog-manager-intro">
        Elegí qué filas ves en Inicio y en Películas/Series, en qué orden y con qué nombre. También podés juntar dos
        catálogos del mismo tipo en una sola fila. Los addons desactivados no aparecen acá.
      </p>

      <div className="filters catalog-manager-filters" role="tablist" aria-label="Tipo">
        {['all', ...types].map((t) => (
          <button key={t} type="button" role="tab" aria-selected={filter === t} className={`tab${filter === t ? ' active' : ''}`} onClick={() => setFilter(t)}>
            {t === 'all' ? 'Todos' : typeLabel(t)}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-ghost danger"
          onClick={() => {
            if (confirm('¿Volver a los catálogos como vienen de los addons? Se pierden los nombres, el orden y las fusiones.')) {
              updateCatalogPrefs(() => DEFAULT_CATALOG_PREFS)
              setStatus('Catálogos restablecidos')
            }
          }}
        >
          Restablecer
        </button>
      </div>

      <p className="catalog-manager-live" role="status" aria-live="polite">
        {status}
      </p>

      {view.length === 0 && <div className="empty">No hay catálogos. Instalá o activá un addon con catálogos en Ajustes.</div>}

      <ol className="catalog-manager-list" ref={listRef}>
        {view.map((row, i) => (
          <CatalogItem
            key={row.key}
            row={row}
            first={i === 0}
            last={i === view.length - 1}
            rows={rows}
            candidates={rows.filter((r) => r.type === row.type && r.key !== row.key)}
            onMove={(d) => move(row.key, d, row.name)}
            onStatus={setStatus}
          />
        ))}
      </ol>
    </div>
  )
}

function CatalogItem({
  row,
  rows,
  first,
  last,
  candidates,
  onMove,
  onStatus,
}: {
  row: CatalogRowDef
  rows: CatalogRowDef[]
  first: boolean
  last: boolean
  candidates: CatalogRowDef[]
  onMove: (delta: -1 | 1) => void
  onStatus: (s: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.name)
  const [merging, setMerging] = useState(false)
  const [target, setTarget] = useState('')

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    updateCatalogPrefs((p) => renameRow(p, row.key, draft === row.defaultName ? '' : draft))
    setEditing(false)
    onStatus('Nombre guardado')
  }

  const merge = () => {
    if (!target) return
    updateCatalogPrefs((p) => mergeRows(p, rows, row.key, target).prefs)
    setMerging(false)
    setTarget('')
    onStatus('Catálogos fusionados')
  }

  const addonNames = [...new Set(row.sources.map((s) => s.addon.manifest.name))].join(', ')

  return (
    <li className={`catalog-item${row.hidden ? ' is-hidden' : ''}`} data-row-key={row.key}>
      <div className="catalog-item-main">
        <div className="catalog-item-text">
          {editing ? (
            <form className="inline-form" onSubmit={save}>
              <input type="text" value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} aria-label="Nombre de la fila" placeholder={row.defaultName} />
              <button className="btn btn-primary btn-small">Guardar</button>
              <button type="button" className="btn btn-small" onClick={() => setEditing(false)}>
                Cancelar
              </button>
            </form>
          ) : (
            <strong className="catalog-item-name">
              {row.name}
              {row.hidden && <span className="chip small">Oculta</span>}
            </strong>
          )}
          <span className="muted small">
            {typeLabel(row.type)} · {addonNames}
            {row.renamed && !editing && <> · antes “{row.defaultName}”</>}
          </span>
          {row.merged && (
            <span className="chips">
              {row.sources.map((s) => (
                <span key={`${s.addon.manifest.id}|${s.catalog.id}`} className="chip small">
                  {defaultCatalogLabel(s).split(' · ')[0]} ({s.addon.manifest.name})
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="catalog-item-actions">
          <button className="btn btn-ghost" data-move="up" disabled={first} onClick={() => onMove(-1)} aria-label={`Subir “${row.name}”`}>
            ↑
          </button>
          <button className="btn btn-ghost" data-move="down" disabled={last} onClick={() => onMove(1)} aria-label={`Bajar “${row.name}”`}>
            ↓
          </button>
          <button
            className="btn btn-ghost"
            aria-pressed={!row.hidden}
            onClick={() => {
              updateCatalogPrefs((p) => setRowHidden(p, row.key, !row.hidden))
              onStatus(row.hidden ? `“${row.name}” visible` : `“${row.name}” oculta`)
            }}
          >
            {row.hidden ? 'Mostrar' : 'Ocultar'}
          </button>
          {!editing && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setDraft(row.name)
                setEditing(true)
              }}
            >
              Renombrar
            </button>
          )}
          {row.renamed && !editing && (
            <button className="btn btn-ghost" onClick={() => updateCatalogPrefs((p) => renameRow(p, row.key, ''))}>
              Nombre original
            </button>
          )}
          {row.merged ? (
            <button className="btn btn-ghost" onClick={() => updateCatalogPrefs((p) => splitMerge(p, rows, row.key))}>
              Separar
            </button>
          ) : (
            candidates.length > 0 &&
            !merging && (
              <button className="btn btn-ghost" onClick={() => setMerging(true)}>
                Fusionar…
              </button>
            )
          )}
        </div>
      </div>
      {merging && (
        <div className="inline-form catalog-merge">
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label={`Fusionar “${row.name}” con`} autoFocus>
            <option value="">Fusionar con…</option>
            {candidates.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name} ({[...new Set(c.sources.map((s) => s.addon.manifest.name))].join(', ')})
              </option>
            ))}
          </select>
          <button className="btn btn-primary btn-small" disabled={!target} onClick={merge}>
            Fusionar
          </button>
          <button className="btn btn-small" onClick={() => setMerging(false)}>
            Cancelar
          </button>
        </div>
      )}
    </li>
  )
}
