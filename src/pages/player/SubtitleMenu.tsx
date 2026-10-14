import { useEffect, useRef, useState } from 'react'
import type { SubtitlesApi } from './useSubtitles'

const SUB_DELAY_STEP = 0.5

const formatDelay = (d: number) => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toLocaleString('es-AR')} s`

/** Contenido del menú CC del reproductor. */
export function SubtitleMenu({ subs, isSeries, onInteract }: { subs: SubtitlesApi; isSeries: boolean; onInteract: () => void }) {
  const changeDelay = (delta: number) => {
    subs.changeDelay(delta)
    onInteract()
  }
  // "Otros idiomas": se abre en el lugar y el foco va al primero que apareció.
  const [showAll, setShowAll] = useState(false)
  const firstOther = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (showAll) firstOther.current?.focus()
  }, [showAll])
  const others = subs.featured.filter((f) => !f).length
  // Si casi todos son "otros" (ningún idioma preferido), no tiene sentido esconderlos.
  const collapse = !showAll && others > 0 && others < subs.options.length && others > 3
  let firstHidden = true
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
        if (collapse && !subs.featured[i]) return null
        const { main, extra } = subs.labels[i]
        const isFirstOther = showAll && !subs.featured[i] && firstHidden
        if (isFirstOther) firstHidden = false
        return (
          <button
            key={s.url + i}
            ref={isFirstOther ? firstOther : undefined}
            className={subs.active === s.url ? 'active' : ''}
            onClick={() => subs.select(s.url)}
          >
            {main}
            {extra ? <span className="muted small"> · {extra}</span> : null}
          </button>
        )
      })}
      {collapse && (
        <button
          className="sub-menu-more"
          onClick={() => {
            setShowAll(true)
            onInteract()
          }}
        >
          Otros idiomas ({others})
        </button>
      )}
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
