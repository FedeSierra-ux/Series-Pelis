import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { KeyboardToggle } from '../components/OnScreenKeyboard'
import { PosterCard, PosterSkeleton } from '../components/PosterCard'
import { getCatalog, searchableCatalogs } from '../lib/addons'
import { useAddons, useDebounced, useTitle } from '../lib/hooks'
import { typeLabel } from '../lib/i18n'
import { useOnline } from '../lib/online'
import { useTvMode } from '../lib/tv'
import type { MetaPreview } from '../lib/types'

interface Group {
  key: string
  title: string
  items: MetaPreview[]
  loading: boolean
}

export function Search() {
  useTitle('Buscar')
  const addons = useAddons()
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const query = useDebounced(text.trim(), 350)
  const [groups, setGroups] = useState<Group[]>([])
  const tv = useTvMode()
  const online = useOnline()

  useEffect(() => {
    setParams(query ? { q: query } : {}, { replace: true })
    if (query.length < 2) {
      setGroups([])
      return
    }
    let alive = true
    const targets = searchableCatalogs(addons)
    const next: Group[] = targets.map(({ addon, catalog }) => ({
      key: `${addon.transportUrl}|${catalog.type}|${catalog.id}`,
      title: `${typeLabel(catalog.type)}${targets.length > 2 ? ` · ${addon.manifest.name}` : ''}`,
      items: [],
      loading: true,
    }))
    setGroups(next)
    targets.forEach(({ addon, catalog }, i) => {
      getCatalog(addon, catalog, { search: query })
        .then((items) => {
          next[i] = { ...next[i], items: items.map((m) => ({ ...m, type: m.type ?? catalog.type })), loading: false }
        })
        .catch(() => {
          next[i] = { ...next[i], loading: false }
        })
        .finally(() => alive && setGroups([...next]))
    })
    return () => {
      alive = false
    }
  }, [query, addons])

  const anyLoading = groups.some((g) => g.loading)
  const noResults = query.length >= 2 && !anyLoading && groups.every((g) => g.items.length === 0)

  return (
    <div className="page">
      <header className="page-header">
        <h1>Buscar</h1>
      </header>
      <input
        className="search-input"
        type="search"
        // En la TV el foco arranca en el teclado en pantalla (así no salta el teclado del sistema).
        autoFocus={!tv}
        placeholder="Película, serie, actor..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        enterKeyHint="search"
      />
      <KeyboardToggle
        value={text}
        onChange={setText}
        alwaysToggle
        openInTv
        doneLabel="Buscar"
        label="Teclado para buscar"
        onDone={() => document.querySelector<HTMLElement>('.search-group a[href]')?.focus()}
      />
      {!online && <div className="empty muted">Sin conexión: la búsqueda necesita internet. Mientras tanto tenés Mi lista y el Historial.</div>}
      {groups
        .filter((g) => g.loading || g.items.length > 0)
        .map((g) => (
          <section key={g.key} className="search-group">
            <h2>{g.title}</h2>
            <div className="grid">
              {g.loading
                ? Array.from({ length: 6 }, (_, i) => <PosterSkeleton key={i} />)
                : g.items.map((m) => <PosterCard key={m.id} meta={m} />)}
            </div>
          </section>
        ))}
      {noResults && online && <div className="empty">No encontramos nada para “{query}”.</div>}
      {query.length < 2 && <div className="empty muted">Escribí al menos 2 letras.</div>}
    </div>
  )
}
