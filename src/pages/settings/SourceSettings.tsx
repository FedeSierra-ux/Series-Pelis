import { useState } from 'react'
import { settingsStore, useStore, type SourceRules } from '../../lib/store'

const QUALITY_OPTIONS: { value: SourceRules['preferredQuality']; label: string }[] = [
  { value: 'any', label: 'La mejor disponible' },
  { value: '2160p', label: '4K (2160p)' },
  { value: '1080p', label: 'Full HD (1080p)' },
  { value: '720p', label: 'HD (720p)' },
]

const toList = (text: string) =>
  text
    .split(',')
    .map((w) => w.trim().toLowerCase())
    .filter(Boolean)

function setRules(patch: Partial<SourceRules>) {
  settingsStore.set((s) => ({ ...s, sourceRules: { ...s.sourceRules, ...patch } }))
}

/** Lista de palabras separadas por coma. Se guarda al salir del campo (o con Enter) para no comerse las comas mientras se escribe. */
function KeywordsField({ label, placeholder, value, onSave }: { label: string; placeholder: string; value: string[]; onSave: (list: string[]) => void }) {
  const [draft, setDraft] = useState(value.join(', '))
  const save = () => {
    const list = toList(draft)
    onSave(list)
    setDraft(list.join(', '))
  }
  return (
    <label className="source-field">
      <span>{label}</span>
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />
    </label>
  )
}

export function SourceSettings() {
  const { sourceRules: rules } = useStore(settingsStore)

  return (
    <section className="settings-section">
      <h2>Elección de fuente</h2>
      <p className="muted">
        En automático la app elige el mejor stream según estas reglas y lo reproduce después de una cuenta regresiva de 3
        segundos, que podés cancelar con “Elegir otro”.
      </p>
      <div className="chips" role="radiogroup" aria-label="Modo de elección">
        <button
          role="radio"
          aria-checked={rules.mode === 'manual'}
          className={`tab ${rules.mode === 'manual' ? 'active' : ''}`}
          onClick={() => setRules({ mode: 'manual' })}
        >
          Elegir yo
        </button>
        <button
          role="radio"
          aria-checked={rules.mode === 'auto'}
          className={`tab ${rules.mode === 'auto' ? 'active' : ''}`}
          onClick={() => setRules({ mode: 'auto' })}
        >
          Automático
        </button>
      </div>

      <label className="check">
        <input type="checkbox" checked={rules.rememberLast} onChange={(e) => setRules({ rememberLast: e.target.checked })} />
        Recordar la última fuente de cada título y volver a usarla
      </label>

      <label className="source-field">
        <span>Calidad preferida</span>
        <select
          value={rules.preferredQuality}
          onChange={(e) => setRules({ preferredQuality: e.target.value as SourceRules['preferredQuality'] })}
        >
          {QUALITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <KeywordsField
        label="Palabras que prefiero (separadas por coma)"
        placeholder="latino, dual, castellano"
        value={rules.preferKeywords}
        onSave={(preferKeywords) => setRules({ preferKeywords })}
      />
      <KeywordsField
        label="Palabras que descartan un stream (separadas por coma)"
        placeholder="cam, hdts, telesync"
        value={rules.excludeKeywords}
        onSave={(excludeKeywords) => setRules({ excludeKeywords })}
      />
    </section>
  )
}
