import { settingsStore, useStore, type Settings, type SourceRules, type SubtitleStyle } from '../../lib/store'
import { FIT_LABELS, VIDEO_FITS, type VideoFit } from './videoFit'

// Ajustes rápidos ⚙ dentro del reproductor (U29): lo que más se toca sin salir del video. Usa los
// mismos campos del store que Ajustes → Reproductor y Ajustes → Fuentes, así que un cambio acá se ve
// allá y al revés. La imagen (ajustar/llenar/estirar) es por dispositivo y la maneja el reproductor.

type Option<T> = [T, string]

const SIZES: Option<SubtitleStyle['size']>[] = [
  ['s', 'Chico'],
  ['m', 'Mediano'],
  ['l', 'Grande'],
  ['xl', 'Muy grande'],
]

const SKIP: Option<Settings['skipSegments']>[] = [
  ['button', 'Botón'],
  ['auto', 'Automático'],
  ['off', 'Apagado'],
]

const AUTOPLAY: Option<boolean>[] = [
  [true, 'Sí'],
  [false, 'No'],
]

const QUALITY: Option<SourceRules['preferredQuality']>[] = [
  ['any', 'La mejor'],
  ['2160p', '4K'],
  ['1080p', '1080p'],
  ['720p', '720p'],
]

function Row<T extends string | boolean>({ label, hint, value, options, onPick }: { label: string; hint?: string; value: T; options: Option<T>[]; onPick: (v: T) => void }) {
  return (
    <div className="qs-row" data-qs-row>
      <span className="qs-label">{label}</span>
      <div className="qs-chips" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={String(v)} role="radio" aria-checked={value === v} className={value === v ? 'active' : ''} onClick={() => onPick(v)}>
            {text}
          </button>
        ))}
      </div>
      {hint && <span className="qs-hint muted small">{hint}</span>}
    </div>
  )
}

export function QuickSettings({ fit, onFit, onChange }: { fit: VideoFit; onFit: (f: VideoFit) => void; onChange: () => void }) {
  const settings = useStore(settingsStore)
  const update = (patch: Partial<Settings>) => {
    settingsStore.set((s) => ({ ...s, ...patch }))
    onChange()
  }
  return (
    <>
      <span className="player-menu-title muted small">Ajustes rápidos</span>
      <Row
        label="Tamaño de los subtítulos"
        value={settings.subtitleStyle.size}
        options={SIZES}
        onPick={(size) => update({ subtitleStyle: { ...settingsStore.get().subtitleStyle, size } })}
      />
      <Row label="Saltar intro y resumen" value={settings.skipSegments} options={SKIP} onPick={(skipSegments) => update({ skipSegments })} />
      <Row label="Reproducir el siguiente solo" value={settings.autoplayNext} options={AUTOPLAY} onPick={(autoplayNext) => update({ autoplayNext })} />
      <Row
        label="Calidad máxima"
        hint="Se usa al elegir la fuente del próximo episodio."
        value={settings.sourceRules.preferredQuality}
        options={QUALITY}
        onPick={(preferredQuality) => update({ sourceRules: { ...settingsStore.get().sourceRules, preferredQuality } })}
      />
      <Row
        label="Imagen"
        value={fit}
        options={VIDEO_FITS.map((f) => [f, FIT_LABELS[f]] as Option<VideoFit>)}
        onPick={(f) => {
          onFit(f)
          onChange()
        }}
      />
    </>
  )
}

/**
 * Flechas dentro del ⚙: ↑/↓ cambian de fila (al chip elegido de esa fila) y ←/→ se mueven dentro de la fila
 * sin salirse. Devuelve true si la tecla era de acá.
 */
export function quickSettingsArrow(menu: Element, active: Element | null, key: string): boolean {
  const rows = Array.from(menu.querySelectorAll<HTMLElement>('[data-qs-row]'))
  const row = active?.closest<HTMLElement>('[data-qs-row]')
  if (!row) {
    // Nada enfocado adentro todavía: al primer chip elegido.
    const first = rows[0]?.querySelector<HTMLElement>('button.active') ?? rows[0]?.querySelector<HTMLElement>('button')
    first?.focus()
    return !!first
  }
  const i = rows.indexOf(row)
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const target = rows[i + (key === 'ArrowDown' ? 1 : -1)]
    if (target) (target.querySelector<HTMLElement>('button.active') ?? target.querySelector<HTMLElement>('button'))?.focus()
    return true
  }
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const buttons = Array.from(row.querySelectorAll<HTMLElement>('button'))
    const j = buttons.indexOf(active as HTMLElement)
    buttons[j + (key === 'ArrowRight' ? 1 : -1)]?.focus()
    return true
  }
  return false
}
