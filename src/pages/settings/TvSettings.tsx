import { openOnboarding } from '../../components/Onboarding'
import { SCREENSAVER_OPTIONS } from '../../lib/idle'
import { currentPlatform, type TvModeSetting } from '../../lib/platform'
import { settingsStore, useStore, type Settings } from '../../lib/store'
import { normalizeUiScale, UI_SCALES } from '../../lib/tv'
import { Choice } from './PlayerSettings'

const TV_OPTIONS: [TvModeSetting, string][] = [
  ['auto', 'Automático'],
  ['on', 'Siempre'],
  ['off', 'Nunca'],
]

export function TvSettings() {
  const settings = useStore(settingsStore)
  const update = (patch: Partial<Settings>) => settingsStore.set((s) => ({ ...s, ...patch }))
  const detected = currentPlatform().tv

  return (
    <section className="settings-section">
      <h2>Pantalla y control remoto</h2>

      <h3>Tamaño de la interfaz</h3>
      <Choice
        label="Tamaño de la interfaz"
        value={normalizeUiScale(settings.uiScale)}
        options={UI_SCALES.map((v) => [v, `${v} %`])}
        onChange={(uiScale) => update({ uiScale })}
      />
      <p className="muted small">
        Agranda o achica letras, pósters y botones en toda la app (el reproductor tiene sus propios tamaños). Sirve para
        ver la TV de lejos o un celular con letra más grande.
      </p>

      <h3>Protector de pantalla</h3>
      <Choice
        label="Protector de pantalla"
        value={settings.screensaverMinutes}
        options={SCREENSAVER_OPTIONS.map((m) => [m, m === 0 ? 'Apagado' : `${m} min`])}
        onChange={(screensaverMinutes) => update({ screensaverMinutes })}
      />
      <p className="muted small">
        Después de ese tiempo sin tocar nada (fuera del reproductor o con el video en pausa) muestra fondos de pelis y series con
        la hora. Cualquier tecla lo cierra.
      </p>

      <h3>Modo TV</h3>
      <Choice label="Modo TV" value={settings.tvMode} options={TV_OPTIONS} onChange={(tvMode) => update({ tvMode })} />
      <p className="muted small">
        Muestra el teclado en pantalla para escribir con el control remoto (en Buscar y en los campos de texto).{' '}
        {detected ? 'Este aparato parece una TV.' : 'Este aparato no parece una TV.'}
      </p>

      <div className="hero-actions">
        <button type="button" className="btn" onClick={openOnboarding}>
          Abrir el asistente inicial
        </button>
      </div>
    </section>
  )
}
