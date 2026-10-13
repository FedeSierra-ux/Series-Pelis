import { subLabel, type SubtitlesApi } from './useSubtitles'

const SUB_DELAY_STEP = 0.5

const formatDelay = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toLocaleString('es-AR')} s`

/** Contenido del menú CC del reproductor. */
export function SubtitleMenu({ subs, isSeries, onInteract }: { subs: SubtitlesApi; isSeries: boolean; onInteract: () => void }) {
  const changeDelay = (delta: number) => {
    subs.changeDelay(delta)
    onInteract()
  }
  return (
    <>
      {subs.active && (
        <div className="sub-delay">
          <button onClick={() => changeDelay(-SUB_DELAY_STEP)} aria-label="Subtítulos antes">
            −
          </button>
          <span>
            <span className="muted small">Retraso </span>
            {formatDelay(subs.delay)}
          </span>
          <button onClick={() => changeDelay(SUB_DELAY_STEP)} aria-label="Subtítulos después">
            +
          </button>
        </div>
      )}
      <button className={subs.active === '' ? 'active' : ''} onClick={() => subs.select('')}>
        Sin subtítulos
      </button>
      {subs.options.map((s, i) => {
        const { main, extra } = subLabel(s)
        return (
          <button key={s.url + i} className={subs.active === s.url ? 'active' : ''} onClick={() => subs.select(s.url)}>
            {main}
            {extra ? <span className="muted small"> · {extra}</span> : null}
          </button>
        )
      })}
      <button className="sub-menu-extra" onClick={subs.pickFile}>
        Cargar archivo…
      </button>
      {subs.hasPref && (
        <button className="sub-menu-extra" onClick={subs.forget}>
          Olvidar idiomas de esta {isSeries ? 'serie' : 'peli'}
        </button>
      )}
    </>
  )
}
