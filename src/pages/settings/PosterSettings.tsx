import { saveDataOn } from '../../lib/dataSaver'
import { settingsStore, useStore, type Settings } from '../../lib/store'

const RATING_OPTIONS: [Settings['posterRating'], string][] = [
  ['on', 'En el póster'],
  ['below', 'Debajo'],
  ['off', 'No mostrar'],
]

export function PosterSettings() {
  const settings = useStore(settingsStore)
  const set = (patch: Partial<Settings>) => settingsStore.set((s) => ({ ...s, ...patch }))

  return (
    <section className="settings-section">
      <h2>Pósters</h2>
      <h3>Puntaje de IMDb</h3>
      <div className="chips" role="radiogroup" aria-label="Puntaje de IMDb">
        {RATING_OPTIONS.map(([v, text]) => (
          <button
            key={v}
            role="radio"
            aria-checked={settings.posterRating === v}
            className={`tab ${settings.posterRating === v ? 'active' : ''}`}
            onClick={() => set({ posterRating: v })}
          >
            {text}
          </button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={settings.posterLabels} onChange={(e) => set({ posterLabels: e.target.checked })} />
        Etiquetas: “Episodio nuevo”, “Temporada nueva”, “Top 10” y “Estreno”
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.hoverTrailer} onChange={(e) => set({ hoverTrailer: e.target.checked })} />
        Reproducir el tráiler al quedarse sobre un póster (sin sonido y con subtítulos en español)
      </label>
      <p className="muted small">
        El tráiler aparece a los 2 segundos con el mouse o el control remoto. No se reproduce en celulares, con “reducir
        movimiento” ni con ahorro de datos{saveDataOn() ? ' (ahora está activado en este dispositivo)' : ''}. Con el mouse,
        tocá “Activar sonido”; con el teclado, la tecla M.
      </p>
    </section>
  )
}
