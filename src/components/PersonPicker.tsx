import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchPeople, type TmdbPersonResult } from '../lib/discoverApi'
import { debounce, MIN_QUERY, normalizeQuery } from '../lib/searchHistory'
import { departmentLabel, PersonAvatar } from './PeopleRow'

// "Buscar con otra persona…": en la página de una persona, elegís a otra y vas a
// /together con los títulos que hicieron juntas.

export function TogetherPicker({ personId, personName }: { personId: number; personName: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ q: string; list: TmdbPersonResult[] }>()
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const schedule = useMemo(() => debounce((v: string) => setQuery(normalizeQuery(v)), 300), [])
  useEffect(() => () => schedule.cancel(), [schedule])

  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  useEffect(() => {
    if (query.length < MIN_QUERY) return
    let alive = true
    searchPeople(query)
      .then((list) => alive && setResults({ q: query, list: list.filter((p) => p.id !== personId).slice(0, 8) }))
      .catch(() => alive && setResults({ q: query, list: [] }))
    return () => {
      alive = false
    }
  }, [query, personId])

  const list = results?.q === query ? results.list : []
  const pick = (other: TmdbPersonResult) => navigate(`/together?ids=${personId},${other.id}`)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    schedule.flush()
  }

  if (!open)
    return (
      <button ref={toggle} type="button" className="btn btn-small together-open" onClick={() => setOpen(true)}>
        👥 Buscar con otra persona…
      </button>
    )

  return (
    <div className="together-picker">
      <form role="search" onSubmit={submit} className="together-form">
        <input
          ref={input}
          type="search"
          value={text}
          placeholder={`¿Con quién? (títulos con ${personName} y…)`}
          aria-label="Buscar otra persona"
          enterKeyHint="search"
          onChange={(e) => {
            setText(e.target.value)
            schedule(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setOpen(false)
              requestAnimationFrame(() => toggle.current?.focus())
            }
          }}
        />
        <button type="button" className="btn btn-small btn-ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </form>
      {list.length > 0 && (
        <ul className="together-results">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" className="together-result" onClick={() => pick(p)}>
                <PersonAvatar person={p} size="w92" />
                <span>
                  <strong>{p.name}</strong>
                  {p.known_for_department && <span className="muted small"> · {departmentLabel(p.known_for_department)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.length >= MIN_QUERY && results?.q === query && list.length === 0 && (
        <p className="muted small">No encontramos a nadie con ese nombre.</p>
      )}
    </div>
  )
}
