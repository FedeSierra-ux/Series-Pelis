import { useId } from 'react'
import { Advanced } from '../../components/Advanced'
import { saveDataOn } from '../../lib/dataSaver'
import { isDesktopApp } from '../../lib/desktop'
import { effectivePlayer, playersFor } from '../../lib/externalPlayers'
import { langLabel } from '../../lib/i18n'
import { isNativeApp } from '../../lib/native'
import { currentPlatform } from '../../lib/platform'
import { settingsStore, useStore, type Settings, type SubtitleStyle } from '../../lib/store'
import { subtitleClasses } from '../../lib/subtitlePrefs'

const LANGS = ['spa', 'eng', 'por']

export function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
  showLabel = false,
}: {
  label: string
  value: T
  options: [T, string][]
  onChange: (v: T) => void
  /** v0.26: muestra el rótulo arriba de los chips (si no, queda solo para lectores de pantalla). */
  showLabel?: boolean
}) {
  const labelId = useId()
  const group = (
    <div className="chips" role="radiogroup" {...(showLabel ? { 'aria-labelledby': labelId } : { 'aria-label': label })}>
      {options.map(([v, text]) => (
        <button key={String(v)} role="radio" aria-checked={value === v} className={`tab ${value === v ? 'active' : ''}`} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
  if (!showLabel) return group
  return (
    <>
      <span className="choice-label" id={labelId}>
        {label}
      </span>
      {group}
    </>
  )
}

/** Idiomas en orden de preferencia: el número indica la prioridad. */
export function LangChips({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
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
  const os = currentPlatform().os

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
      <LangChips label="Idiomas de subtítulos preferidos" value={settings.subtitleLangs} onChange={(subtitleLangs) => update({ subtitleLangs, langsChosen: true })} />
      <Advanced>
      <label className="check">
        <input type="checkbox" checked={settings.hideSdh} onChange={(e) => update({ hideSdh: e.target.checked })} />
        Ocultar subtítulos para sordos (SDH) y sacar las descripciones de sonidos ([música], (risas)…)
      </label>
      <p className="muted small">
        Si en el reproductor elegís otro idioma de audio o subtítulos, se recuerda para esa serie o peli y le gana a esto. Si no
        hay subtítulos activos y el audio está en un idioma preferido, se activan solos los “forzados” (carteles y diálogos en
        otro idioma) cuando el addon los ofrece.
      </p>
      </Advanced>

      <h3>Estilo de subtítulos</h3>
      <Choice
        label="Tamaño"
        showLabel
        value={style.size}
        options={[
          ['s', 'Chico'],
          ['m', 'Mediano'],
          ['l', 'Grande'],
          ['xl', 'Muy grande'],
        ]}
        onChange={(size) => setStyle({ size })}
      />
      <Advanced>
      <Choice
        label="Color"
        showLabel
        value={style.color}
        options={[
          ['white', 'Blanco'],
          ['yellow', 'Amarillo'],
        ]}
        onChange={(color) => setStyle({ color })}
      />
      <Choice
        label="Fondo"
        showLabel
        value={style.background}
        options={[
          ['none', 'Sin fondo'],
          ['light', 'Suave'],
          ['semi', 'Semitransparente'],
          ['solid', 'Negro'],
        ]}
        onChange={(background) => setStyle({ background })}
      />
      <label className="check">
        <input type="checkbox" checked={style.outline} onChange={(e) => setStyle({ outline: e.target.checked })} />
        Contorno negro en las letras
      </label>
      <Choice
        label="Letra"
        showLabel
        value={style.font}
        options={[
          ['system', 'Sistema'],
          ['rounded', 'Redondeada'],
          ['serif', 'Serif'],
          ['mono', 'Monoespaciada'],
        ]}
        onChange={(font) => setStyle({ font })}
      />
      <Choice
        label="Posición"
        showLabel
        value={style.position}
        options={[
          [0, 'Abajo'],
          [10, 'Un poco más arriba'],
          [20, 'Más arriba'],
        ]}
        onChange={(position) => setStyle({ position })}
      />
      </Advanced>
      <div className={`sub-preview ${subtitleClasses(style)}`} aria-hidden="true">
        <span className="sub-preview-text">Así se van a ver los subtítulos</span>
      </div>

      <h3>Idioma de audio preferido</h3>
      <LangChips label="Idiomas de audio preferidos" value={settings.audioLangs} onChange={(audioLangs) => update({ audioLangs, langsChosen: true })} />
      <p className="muted small">Solo sirve en streams con varias pistas de audio.</p>


      <Advanced>
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
      </Advanced>

      {isNativeApp() && (
        <>
          <h3>Reproductor de la app</h3>
          <label className="check">
            <input type="checkbox" checked={settings.nativePlayer} onChange={(e) => update({ nativePlayer: e.target.checked })} />
            Usar el reproductor de Android
          </label>
          <p className="muted small">
            Reproduce más formatos (MKV, HEVC, audio Dolby) y anda más fluido en la TV. Saltar intro y resumen, siguiente
            episodio, pistas de audio y subtítulos siguen igual. Apagalo si algún video se ve mal: vuelve el de la web.
          </p>
        </>
      )}

      <h3>Reproductor externo</h3>
      <Choice
        label="Botón Abrir en…"
        value={effectivePlayer(settings.externalPlayer, os).id}
        options={playersFor(os).map((p) => [p.id, p.label])}
        onChange={(externalPlayer) => update({ externalPlayer })}
      />
      <p className="muted small">
        {os === 'android'
          ? '“Del sistema” muestra la lista de reproductores instalados; los demás abren directo esa app (si no está, Android ofrece instalarla).'
          : '“Del sistema” copia el enlace para pegarlo en tu reproductor. Los demás lo abren directo si están instalados (y el enlace queda copiado por si no abre).'}{' '}
        {/* En la app de Windows mpv no necesita el manejador de enlaces: se abre el programa. */}
        {isDesktopApp() ? 'En la app de Windows se abre el programa instalado (VLC, mpv o PotPlayer).' : effectivePlayer(settings.externalPlayer, os).note}
      </p>
    </section>
  )
}
