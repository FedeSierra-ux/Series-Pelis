import { useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { ImdbRating } from '../../components/Rating'
import { portraitLogo } from '../../components/focusBillboardData'
import { GLYPHS, IconSvg } from '../../components/Icon'
import { useLogoTone } from '../../lib/logoTone'
import type { DetailLocationState } from '../detail/StreamList'

// Íconos de línea de la portada (mismo trazo que Theme2Icons). Heredan el color del texto.
const PATHS = {
  play: <path d="M7 4.5v15a.5.5 0 0 0 .77.42l11.5-7.5a.5.5 0 0 0 0-.84L7.77 4.08A.5.5 0 0 0 7 4.5z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  plus: GLYPHS.plus,
  check: GLYPHS.check,
  info: GLYPHS.info,
  prev: GLYPHS.back,
  next: GLYPHS.next,
}

export type HeroIconName = keyof typeof PATHS

export function HeroIcon({ name, size = 22 }: { name: HeroIconName; size?: number }) {
  return (
    <IconSvg size={size} strokeWidth={2.2}>
      {PATHS[name]}
    </IconSvg>
  )
}

/** "Más info" abre la ficha sin la cuenta regresiva del modo automático (eso es "Reproducir"). */
const INFO_STATE: DetailLocationState = { noAuto: true }

export interface HeroInfoProps {
  /** Texto chico arriba del título, por ejemplo "Estrenos en cines". */
  eyebrow?: string
  /** Nombre para mostrar (en español si se sabe; el logo sigue en idioma original): texto si no hay logo y nombre accesible del logo. */
  title: string
  /** Logo del título; sin logo va el nombre en texto. */
  logo?: string
  /** Mientras llegan los datos el lugar del título queda reservado (así el logo no aparece de golpe sobre el nombre). */
  titleReady?: boolean
  /** Puntaje de IMDb. */
  rating?: string
  /** Año, duración, tipo… (ya en orden; van en la misma línea que IMDb). */
  facts: string[]
  /** Géneros: en una línea aparte, así nunca queda un separador suelto al principio de un renglón. */
  genres?: string[]
  overview?: string
  /** Idioma de la sinopsis si no es el de la página: la de Cinemeta va en inglés (a11y-16). */
  overviewLang?: string
  cast?: { id: number | string; name: string; photo?: string }[]
  /** Ficha del título. */
  to: string
  list: { inList: boolean; busy?: boolean; unavailable?: boolean; onToggle: () => void }
  /**
   * Botón principal "▶ Reproducir" / "Continuar": reproduce directo (busca la fuente sin pasar por la
   * ficha). Sin esto, el botón es "Ver ficha" y abre la ficha. El enlace sigue apuntando a la ficha
   * (abrir en otra pestaña, y es a donde va si no encuentra nada reproducible).
   */
  play?: { label: string; busy?: boolean; onPlay: () => void }
}

/** Lo de adentro de la portada: logo, IMDb y datos, sinopsis, reparto y botones. */
export function HeroInfo({ eyebrow, title, logo, titleReady = true, rating, facts, genres, overview, overviewLang, cast, to, list, play }: HeroInfoProps) {
  const [brokenLogo, setBrokenLogo] = useState<string>()
  // Si el logo no carga, volvemos al título en texto.
  const showLogo = logo && logo !== brokenLogo ? logo : undefined
  const logoTone = useLogoTone(showLogo)
  const listLabel = list.busy ? 'Agregando…' : list.unavailable ? 'No disponible' : list.inList ? 'En mi lista' : 'Mi lista'

  // Control remoto (tv-03): ↑ desde los botones va a la pausa del carrusel y → desde el último botón al indicador
  // del destacado actual. Si no, la navegación espacial caía en la fila de abajo (más cerca que los puntos) y
  // desde la TV no había forma de pausar ni de elegir otro destacado. Sin carrusel (un solo título) no hace nada.
  const onActionsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowRight')) return
    const portada = e.currentTarget.closest('.portada')
    if (!portada) return
    const actions = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('a[href], button'))
    if (e.key === 'ArrowRight' && e.target !== actions[actions.length - 1]) return
    const pause = portada.querySelector<HTMLElement>('.portada-pause')
    const dot = portada.querySelector<HTMLElement>('.portada-dot[aria-current]')
    const target = e.key === 'ArrowUp' ? (pause ?? dot) : (dot ?? pause)
    if (!target) return
    e.preventDefault()
    target.focus({ preventScroll: true })
  }
  return (
    <div className="portada-content">
      {eyebrow && <span className="portada-eyebrow">{eyebrow}</span>}
      {/* h2: el h1 es el de la página (este título cambia con el carrusel). */}
      <h2 className={`portada-title${showLogo ? ' has-logo' : ''}${titleReady ? '' : ' is-pending'}`}>
        {showLogo ? (
          <img
            className="portada-logo"
            {...logoTone}
            src={showLogo}
            alt={title}
            onLoad={(e) => {
              logoTone.onLoad(e)
              // Logo vertical de metahub (visual-01): a 44×65 px no se lee, va el título en texto.
              if (portraitLogo(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)) setBrokenLogo(showLogo)
            }}
            onError={() => setBrokenLogo(showLogo)}
          />
        ) : (
          <span>{title}</span>
        )}
      </h2>
      {(rating || facts.length > 0) && (
        <p className="portada-facts">
          <ImdbRating value={rating} />
          {facts.map((f, i) => (
            <span key={`${i}-${f}`}>{f}</span>
          ))}
        </p>
      )}
      {genres && genres.length > 0 && <p className="portada-genres">{genres.join(' · ')}</p>}
      {overview && (
        <p className="portada-desc" lang={overviewLang}>
          {overview}
        </p>
      )}
      {cast && cast.length > 0 && (
        <ul className="portada-cast" aria-label="Reparto">
          {cast.map((c) => (
            <li key={c.id}>
              {c.photo && <img src={c.photo} alt="" loading="lazy" />}
              <span>{c.name}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="portada-actions" onKeyDown={onActionsKey}>
        <Link
          className="portada-btn is-play"
          data-autofocus
          to={to}
          aria-busy={play?.busy || undefined}
          onClick={(e) => {
            if (!play || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
            e.preventDefault()
            play.onPlay()
          }}
        >
          {play?.busy ? <span className="portada-btn-spinner" aria-hidden /> : <HeroIcon name="play" />}
          <span>{play ? (play.busy ? 'Buscando fuente…' : play.label) : 'Ver ficha'}</span>
        </Link>
        {/* aria-disabled en vez de disabled: así el control remoto no pierde el foco mientras resuelve. */}
        <button
          type="button"
          className={`portada-btn is-ghost${list.inList ? ' is-on' : ''}`}
          onClick={list.onToggle}
          aria-disabled={list.busy || undefined}
          aria-busy={list.busy || undefined}
        >
          <HeroIcon name={list.inList ? 'check' : 'plus'} />
          <span className="portada-btn-label">{listLabel}</span>
        </button>
        <Link className="portada-btn is-ghost" to={to} state={INFO_STATE}>
          <HeroIcon name="info" />
          <span className="portada-btn-label">Más info</span>
        </Link>
      </div>
    </div>
  )
}
