import { settingsStore } from '../../lib/store'
import { useTheme, type ThemeId } from '../../lib/theme'

const THEMES: { id: ThemeId; name: string; desc: string }[] = [
  { id: '1', name: 'Tema 1 (clásico)', desc: 'El de siempre: menú arriba y pósters.' },
  { id: '2', name: 'Tema 2 (nuevo)', desc: 'Menú al costado (abajo en el celular), tonos violetas suaves y tarjetas redondeadas.' },
]

/** Ajustes → Apariencia: elegir Tema 1 o Tema 2. Se aplica al instante y queda guardado. */
export function AppearanceSettings() {
  const theme = useTheme()

  const choose = (id: ThemeId) => {
    if (id === theme) return
    settingsStore.set((s) => ({ ...s, theme: id }))
    // Al cambiar de tema se vuelve a armar la pantalla: devolvemos el foco a la opción elegida
    // para que el control remoto no quede "en el aire".
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-theme-option="${id}"]`)?.focus({ preventScroll: true })),
    )
  }

  return (
    <section className="settings-section">
      <h2>Apariencia</h2>
      <h3 id="theme-label">Tema</h3>
      <div className="theme-options" role="radiogroup" aria-labelledby="theme-label">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={theme === t.id}
            data-theme-option={t.id}
            className={`theme-option${theme === t.id ? ' active' : ''}`}
            onClick={() => choose(t.id)}
          >
            <span className={`theme-swatch theme-swatch-${t.id}`} aria-hidden>
              <span />
              <span />
              <span />
            </span>
            <span className="theme-option-text">
              <strong>{t.name}</strong>
              <span className="muted small">{t.desc}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="muted small">Se aplica al instante y queda guardado en este dispositivo.</p>
    </section>
  )
}
