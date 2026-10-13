import { saveDataOn } from '../../lib/dataSaver'
import { langLabel } from '../../lib/i18n'
import { settingsStore, useStore, type Settings, type SubtitleStyle } from '../../lib/store'

const LANGS = ['spa', 'eng', 'por']

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} role="radio" aria-checked={value === v} className={`tab ${value === v ? 'active' : ''}`} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}

/** Idiomas en orden de preferencia: el número indica la prioridad. */
function LangChips({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {LANGS.map((code) => {
        const i = value.indexOf(code)
        return (
          <button
            key={code}
            aria-pressed={i >= 0}
            className={`tab ${i >= 0 ? 'active' : ''}`}
            onClick={() => onChange(i >= 0 ? value.filter((c) => c !== code) : [...value, code])}
          >
            {i >= 0 ? `${i + 1}. ` : ''}
            {langLabel(code)}
          </button>
        )
      })}
    </div>
  )
}

export function PlayerSettings() {
  const settings = useStore(settingsStore)
  const update = (patch: Partial<Settings>) => settingsStore.set((s) => ({ ...s, ...patch }))
  const style = settings.subtitleStyle
  const setStyle = (patch: Partial<SubtitleStyle>) => settingsStore.set((s) => ({ ...s, subtitleStyle: { ...s.subtitleStyle, ...patch } }))

  return (
    <section className="settings-section">
      <h2>Reproductor</h2>

      <h3>Saltar intro, resumen y créditos</h3>
      <Choice
        label="Saltar intro, resumen y créditos"
        value={settings.skipSegments}
        options={[
          ['button', 'Mostrar botón'],
          ['auto', 'Saltar solo'],
          ['off', 'No'],
        ]}
        onChange={(skipSegments) => update({ skipSegments })}
      />
      <p className="muted small">Los tiempos vienen de IntroDB, una base comunitaria: no todos los episodios los tienen.</p>

      <h3>Subtítulos</h3>
      <label className="check">
        <input type="checkbox" checked={settings.autoSubtitles} onChange={(e) => update({ autoSubtitles: e.target.checked })} />
        Activarlos solos en el primer idioma preferido que haya
      </label>
      <LangChips label="Idiomas de subtítulos preferidos" value={settings.subtitleLangs} onChange={(subtitleLangs) => update({ subtitleLangs })} />

      <h3>Estilo de subtítulos</h3>
      <Choice
        label="Tamaño"
        value={style.size}
        options={[
          ['s', 'Chico'],
          ['m', 'Mediano'],
          ['l', 'Grande'],
          ['xl', 'Muy grande'],
        ]}
        onChange={(size) => setStyle({ size })}
      />
      <Choice
        label="Color"
        value={style.color}
        options={[
          ['white', 'Blanco'],
          ['yellow', 'Amarillo'],
        ]}
        onChange={(color) => setStyle({ color })}
      />
      <Choice
        label="Fondo"
        value={style.background}
        options={[
          ['none', 'Sin fondo'],
          ['semi', 'Semitransparente'],
          ['solid', 'Negro'],
        ]}
        onChange={(background) => setStyle({ background })}
      />
      <div className={`sub-preview sub-size-${style.size} sub-color-${style.color} sub-bg-${style.background}`} aria-hidden="true">
        <span className="sub-preview-text">Así se van a ver los subtítulos</span>
      </div>

      <h3>Idioma de audio preferido</h3>
      <LangChips label="Idiomas de audio preferidos" value={settings.audioLangs} onChange={(audioLangs) => update({ audioLangs })} />
      <p className="muted small">Solo sirve en streams con varias pistas de audio.</p>

      <h3>¿Seguís viendo?</h3>
      <Choice
        label="Preguntar si seguís viendo"
        value={settings.stillWatchingAfter}
        options={[
          [0, 'Nunca'],
          [2, 'Cada 2 episodios'],
          [3, 'Cada 3'],
          [5, 'Cada 5'],
        ]}
        onChange={(stillWatchingAfter) => update({ stillWatchingAfter })}
      />
      <p className="muted small">Pausa y pregunta después de esa cantidad de episodios seguidos sin tocar nada.</p>

      <h3>Vista previa al adelantar</h3>
      <label className="check">
        <input type="checkbox" checked={settings.seekPreview} onChange={(e) => update({ seekPreview: e.target.checked })} />
        Mostrar el cuadro de ese momento al pasar el mouse por la barra
      </label>
      <p className="muted small">
        {saveDataOn()
          ? 'El navegador tiene activado el ahorro de datos: la vista previa queda apagada.'
          : 'Usa un poco más de datos. Se apaga sola si el navegador tiene activado el ahorro de datos.'}
      </p>

      <h3>Reproductor externo</h3>
      <Choice
        label="Botón Abrir en…"
        value={settings.externalPlayer}
        options={[
          ['system', 'Del sistema'],
          ['vlc', 'VLC'],
          ['none', 'Ocultar botón'],
        ]}
        onChange={(externalPlayer) => update({ externalPlayer })}
      />
      <p className="muted small">
        En Android “Del sistema” muestra la lista de reproductores instalados; en la PC copia el enlace para pegarlo en VLC.
      </p>
    </section>
  )
}
