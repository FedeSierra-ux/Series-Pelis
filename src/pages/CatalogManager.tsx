import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Picker } from '../components/Picker'
import { Theme2Icon } from '../components/Theme2Icons'
import {
  DEFAULT_CATALOG_PREFS,
  mergeRows,
  moveRow,
  renameRow,
  setRowHidden,
  setRowShape,
  splitMerge,
  TMDB_HOME_ROWS,
  type CatalogRowDef,
  type VirtualRowDef,
} from '../lib/catalogPrefs'
import { defaultCatalogLabel, updateCatalogPrefs, useCatalogRows, useRowShape } from '../lib/catalogRows'
import { useTitle } from '../lib/hooks'
import { typeLabel } from '../lib/i18n'
import { useTmdbKey } from '../lib/tmdb'

/** Gestor de catálogos: renombrar, ocultar, reordenar y fusionar las filas de Inicio y Descubrir. */
export function CatalogManager() {
  useTitle('Catálogos')
  // Con las filas propias de Inicio (`HOME_VIRTUAL_ROWS`), que se ocultan y mueven igual que un catálogo.
  const rows = useCatalogRows(true)
  const [filter, setFilter] = useState('all')
  const types = useMemo(() => [...new Set(rows.filter((r) => !r.virtual).map((r) => r.type))], [rows])
  const view = filter === 'all' ? rows : rows.filter((r) => r.type === filter)
  const viewKeys = view.map((r) => r.key)
  const allKeys = rows.map((r) => r.key)
  const [status, setStatus] = useState<string>()
  const listRef = useRef<HTMLOListElement>(null)
  const tmdbOn = !!useTmdbKey()

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
        catálogos del mismo tipo en una sola fila. Con “Apaisada” la fila de Inicio muestra tarjetas anchas con el fondo y el logo del título.
        Los addons desactivados no aparecen acá.
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

      {view.every((r) => r.virtual) && <div className="empty">No hay catálogos. Instalá o activá un addon con catálogos en Ajustes.</div>}

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

      {tmdbOn && filter === 'all' && (
        <section className="catalog-manager-tmdb" aria-labelledby="catalog-tmdb-title">
          <h2 id="catalog-tmdb-title">Filas de TMDB en Inicio</h2>
          <p className="muted small">Estas filas no se mueven ni se ocultan: solo elegís la forma de las tarjetas.</p>
          <ol className="catalog-manager-list">
            {TMDB_HOME_ROWS.map((row) => (
              <TmdbRowItem key={row.key} row={row} onStatus={setStatus} />
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

/** Botón "Apaisada": cambia la forma de las tarjetas de la fila en Inicio (póster ↔ apaisada). */
function ShapeToggle({ rowKey, name, onStatus }: { rowKey: string; name: string; onStatus: (s: string) => void }) {
  const landscape = useRowShape(rowKey) === 'landscape'
  return (
    <button
      className="btn btn-ghost btn-text catalog-shape-toggle"
      aria-pressed={landscape}
      title={landscape ? 'Tarjetas apaisadas con logo. Tocá para volver al póster.' : 'Tarjetas con póster. Tocá para pasar a apaisadas con logo.'}
      onClick={() => {
        updateCatalogPrefs((p) => setRowShape(p, rowKey, landscape ? 'poster' : 'landscape'))
        onStatus(`“${name}” con ${landscape ? 'pósters' : 'tarjetas apaisadas'}`)
      }}
    >
      Apaisada
    </button>
  )
}

function TmdbRowItem({ row, onStatus }: { row: VirtualRowDef; onStatus: (s: string) => void }) {
  return (
    <li className="catalog-item" data-row-key={row.key}>
      <div className="catalog-item-main">
        <div className="catalog-item-text">
          <strong className="catalog-item-name">{row.name}</strong>
          <span className="muted small">Solo en Inicio · TMDB</span>
        </div>
        <div className="catalog-item-actions is-shape-only">
          <ShapeToggle rowKey={row.key} name={row.name} onStatus={onStatus} />
        </div>
      </div>
    </li>
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
  const actionsRef = useRef<HTMLDivElement>(null)

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    updateCatalogPrefs((p) => renameRow(p, row.key, draft === row.defaultName ? '' : draft))
    setEditing(false)
    onStatus('Nombre guardado')
  }

  const merge = (target: string) => {
    if (!target) return
    updateCatalogPrefs((p) => mergeRows(p, rows, row.key, target).prefs)
    setMerging(false)
    onStatus('Catálogos fusionados')
  }

  const addonNames = [...new Set(row.sources.map((s) => s.addon.manifest.name))].join(', ')

  // Las mismas acciones sirven para los botones de la fila (PC/TV) y para el menú "⋯" (celular).
  const toggleHidden = () => {
    updateCatalogPrefs((p) => setRowHidden(p, row.key, !row.hidden))
    onStatus(row.hidden ? `“${row.name}” visible` : `“${row.name}” oculta`)
  }
  const startRename = () => {
    setDraft(row.name)
    setEditing(true)
  }
  const restoreName = () => updateCatalogPrefs((p) => renameRow(p, row.key, ''))
  const split = () => updateCatalogPrefs((p) => splitMerge(p, rows, row.key))
  const landscape = useRowShape(row.key) === 'landscape'
  const toggleShape = () => {
    updateCatalogPrefs((p) => setRowShape(p, row.key, landscape ? 'poster' : 'landscape'))
    onStatus(`“${row.name}” con ${landscape ? 'pósters' : 'tarjetas apaisadas'}`)
  }

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
            {row.virtual ? 'Solo en Inicio' : `${typeLabel(row.type)} · ${addonNames}`}
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
        {/* PC y TV: todas las acciones en fila. Celular (CSS ≤ 700 px): solo ↑ ↓ y el menú "⋯" con el resto. */}
        <div ref={actionsRef} className="catalog-item-actions">
          <button className="btn btn-ghost btn-icon" data-move="up" disabled={first} onClick={() => onMove(-1)} aria-label={`Subir “${row.name}”`}>
            ↑
          </button>
          <button className="btn btn-ghost btn-icon" data-move="down" disabled={last} onClick={() => onMove(1)} aria-label={`Bajar “${row.name}”`}>
            ↓
          </button>
          <button className="btn btn-ghost btn-text" aria-pressed={!row.hidden} onClick={toggleHidden}>
            {row.hidden ? 'Mostrar' : 'Ocultar'}
          </button>
          <ShapeToggle rowKey={row.key} name={row.name} onStatus={onStatus} />
          {!editing && (
            <button className="btn btn-ghost btn-text" onClick={startRename}>
              Renombrar
            </button>
          )}
          {row.renamed && !editing && (
            <button className="btn btn-ghost btn-text" onClick={restoreName}>
              Nombre original
            </button>
          )}
          {row.merged ? (
            <button className="btn btn-ghost btn-text" data-merge-btn onClick={split}>
              Separar
            </button>
          ) : (
            candidates.length > 0 &&
            !merging && (
              <button className="btn btn-ghost btn-text" data-merge-btn onClick={() => setMerging(true)}>
                Fusionar…
              </button>
            )
          )}
          <ActionMenu
            label={`Más acciones de “${row.name}”`}
            actions={[
              { id: 'hidden', label: row.hidden ? 'Mostrar en Inicio' : 'Ocultar de Inicio', run: toggleHidden },
              { id: 'shape', label: landscape ? 'Tarjetas con póster en Inicio' : 'Tarjetas apaisadas en Inicio', run: toggleShape },
              ...(!editing ? [{ id: 'rename', label: 'Renombrar', run: startRename, refocus: false }] : []),
              ...(row.renamed && !editing ? [{ id: 'restore', label: 'Volver al nombre original', run: restoreName }] : []),
              ...(row.merged
                ? [{ id: 'split', label: 'Separar', run: split }]
                : candidates.length > 0 && !merging
                  ? [{ id: 'merge', label: 'Fusionar con otra fila…', run: () => setMerging(true), refocus: false }]
                  : []),
            ]}
          />
        </div>
      </div>
      {merging && (
        <div className="inline-form catalog-merge">
          {/* Se abre solo: elegir una fila ya fusiona (se deshace con "Separar"); Atrás cancela. */}
          <Picker
            label={`Fusionar “${row.name}” con`}
            value=""
            placeholder="Elegí una fila…"
            autoOpen
            options={candidates.map((c) => ({
              value: c.key,
              label: `${c.name} (${[...new Set(c.sources.map((s) => s.addon.manifest.name))].join(', ')})`,
            }))}
            onChange={merge}
            onClose={() => {
              setMerging(false)
              // El foco vuelve a los botones de la fila (el Picker ya no existe para recibirlo).
              requestAnimationFrame(() => {
                const a = actionsRef.current
                ;(a?.querySelector<HTMLButtonElement>('[data-merge-btn]') ?? a?.querySelector<HTMLButtonElement>('button:not([disabled])'))?.focus({ preventScroll: true })
              })
            }}
          />
          <button className="btn btn-small" onClick={() => setMerging(false)}>
            Cancelar
          </button>
        </div>
      )}
    </li>
  )
}

interface MenuAction {
  id: string
  label: string
  run: () => void
  /** `false` cuando la acción ya mueve el foco (abre el campo de nombre o el selector de fusión). */
  refocus?: boolean
}

const CLOSE_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])

/**
 * Menú "⋯" de cada catálogo (el CSS lo muestra solo en el celular). Reusa el estilo del Picker:
 * en el celular se abre como hoja desde abajo; ↑/↓ recorren, Enter elige y Atrás cierra.
 */
function ActionMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>()
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const id = useId()

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) requestAnimationFrame(() => button.current?.focus({ preventScroll: true }))
  }

  useLayoutEffect(() => {
    if (!open || !button.current) return
    // Por si se abre en una pantalla ancha (el CSS del celular lo pega abajo de todos modos).
    const r = button.current.getBoundingClientRect()
    setPos({ top: Math.min(r.bottom + 6, window.innerHeight - 260), left: Math.max(8, Math.min(r.left, window.innerWidth - 240)) })
  }, [open])

  useEffect(() => {
    // Recién con la posición puesta: antes la lista está oculta y no puede recibir el foco
    // (y Atrás le llegaría a la navegación general, que se va de la página).
    if (!open || !pos) return
    list.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
  }, [open, pos])

  const moveFocus = (delta: -1 | 1) => {
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    if (!items.length) return
    const i = items.indexOf(document.activeElement as HTMLElement)
    items[Math.min(items.length - 1, Math.max(0, (i < 0 ? (delta > 0 ? -1 : items.length) : i) + delta))].focus({ preventScroll: true })
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (CLOSE_KEYS.has(e.key)) {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      moveFocus(e.key === 'ArrowDown' ? 1 : -1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  if (!actions.length) return null
  return (
    <>
      <button
        ref={button}
        type="button"
        className="btn btn-ghost btn-icon catalog-item-more"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        <Theme2Icon name="more" size={22} />
      </button>
      {open &&
        createPortal(
          <div className="picker-layer" data-nav-scope onKeyDown={onKeyDown} onClick={() => close()}>
            <div
              ref={list}
              id={id}
              className="picker-pop catalog-menu"
              role="menu"
              aria-label={label}
              style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="picker-title">{label}</div>
              {actions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="menuitem"
                  className="picker-opt"
                  onClick={() => {
                    close(a.refocus !== false)
                    a.run()
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
