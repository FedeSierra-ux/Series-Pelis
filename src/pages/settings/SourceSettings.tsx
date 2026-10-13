import { useState } from 'react'
import { settingsStore, useStore, type SourceRules } from '../../lib/store'

const QUALITY_OPTIONS: { value: SourceRules['preferredQuality']; label: string }[] = [
  { value: 'any', label: 'La mejor disponible' },
  { value: '2160p', label: '4K (2160p)' },
  { value: '1080p', label: 'Full HD (1080p)' },
  { value: '720p', label: 'HD (720p)' },
]

const SIZE_OPTIONS = [0, 2, 5, 10, 20, 40]

const CODECS: { value: SourceRules['excludeCodecs'][number]; label: string }[] = [
  { value: 'hevc', label: 'Descartar HEVC (x265 / H.265)' },
  { value: 'av1', label: 'Descartar AV1' },
]

const HDR_OPTIONS: [SourceRules['hdr'], string][] = [
  ['allow', 'Permitir'],
  ['prefer', 'Preferir'],
  ['exclude', 'Excluir'],
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

      <h3>Filtros avanzados</h3>
      <p className="muted small">
        Los streams que no pasan estos filtros no se eligen solos y en la ficha quedan aparte, en “Ocultos por tus filtros”
        (los podés ver y reproducir igual).
      </p>
      <label className="source-field">
        <span>Tamaño máximo</span>
        <select value={rules.maxSizeGB} onChange={(e) => setRules({ maxSizeGB: Number(e.target.value) })}>
          {SIZE_OPTIONS.map((gb) => (
            <option key={gb} value={gb}>
              {gb ? `${gb} GB` : 'Sin límite'}
            </option>
          ))}
        </select>
      </label>
      {CODECS.map((c) => (
        <label key={c.value} className="check">
          <input
            type="checkbox"
            checked={rules.excludeCodecs.includes(c.value)}
            onChange={(e) =>
              setRules({ excludeCodecs: e.target.checked ? [...rules.excludeCodecs, c.value] : rules.excludeCodecs.filter((v) => v !== c.value) })
            }
          />
          {c.label}
        </label>
      ))}
      <p className="muted small">HEVC y AV1 pesan menos, pero muchos televisores y navegadores no los reproducen.</p>
      <span className="source-label">HDR / Dolby Vision</span>
      <div className="chips" role="radiogroup" aria-label="HDR / Dolby Vision">
        {HDR_OPTIONS.map(([value, label]) => (
          <button key={value} role="radio" aria-checked={rules.hdr === value} className={`tab ${rules.hdr === value ? 'active' : ''}`} onClick={() => setRules({ hdr: value })}>
            {label}
          </button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={rules.dedupe} onChange={(e) => setRules({ dedupe: e.target.checked })} />
        Ocultar repetidos (el mismo archivo en varios addons)
      </label>
    </section>
  )
}
