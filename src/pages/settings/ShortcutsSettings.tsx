import { openShortcutsHelp, ShortcutKeys } from '../../components/ShortcutsHelp'
import { openTvHints } from '../../components/TvHints'
import { SHORTCUT_GROUPS } from '../../lib/shortcuts'

// Ajustes → "Teclado y ayuda": abre la tabla de atajos ("?") y la guía del control remoto de la TV.
// Se inserta en pages/Settings.tsx como <ShortcutsSettings />.

export function ShortcutsSettings() {
  const global = SHORTCUT_GROUPS.find((g) => g.id === 'global')
  const sample = global?.shortcuts.slice(0, 3) ?? []
  return (
    <section className="settings-section">
      <h2>Teclado y ayuda</h2>
      <p className="muted">
        Con un teclado, la app tiene atajos para moverse y para el reproductor. Con el control remoto alcanza con las flechas,
        OK y Atrás.
      </p>
      {sample.length > 0 && (
        <ul className="sh-list sh-settings-sample" aria-label="Algunos atajos">
          {sample.map((s) => (
            <li key={s.keys.join('|')} className="sh-row">
              <ShortcutKeys keys={s.keys} />
              <span className="sh-desc muted">{s.description}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="hero-actions">
        <button type="button" className="btn" onClick={openShortcutsHelp}>
          Ver atajos
        </button>
        <button type="button" className="btn" onClick={openTvHints}>
          Ver la guía del control remoto
        </button>
      </div>
    </section>
  )
}
