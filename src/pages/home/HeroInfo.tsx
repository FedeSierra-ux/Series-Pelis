import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ImdbRating } from '../../components/Rating'
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
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </>
  ),
  prev: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
}

export type HeroIconName = keyof typeof PATHS

export function HeroIcon({ name, size = 22 }: { name: HeroIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {PATHS[name]}
    </svg>
  )
}

/** "Más info" abre la ficha sin la cuenta regresiva del modo automático (eso es "Ver ahora"). */
const INFO_STATE: DetailLocationState = { noAuto: true }

export interface HeroInfoProps {
  /** Texto chico arriba del título, por ejemplo "Estrenos en cines". */
  eyebrow?: string
  /** Título original (nunca traducido): texto si no hay logo y nombre accesible del logo. */
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
  cast?: { id: number | string; name: string; photo?: string }[]
  /** Ficha del título. */
  to: string
  list: { inList: boolean; busy?: boolean; unavailable?: boolean; onToggle: () => void }
  /**
   * Botón principal "▶ Reproducir" / "Continuar": reproduce directo (busca la fuente sin pasar por la
   * ficha). Sin esto, el botón es "Ver ahora" y abre la ficha. El enlace sigue apuntando a la ficha
   * (abrir en otra pestaña, y es a donde va si no encuentra nada reproducible).
   */
  play?: { label: string; busy?: boolean; onPlay: () => void }
}

/** Lo de adentro de la portada: logo, IMDb y datos, sinopsis, reparto y botones. */
export function HeroInfo({ eyebrow, title, logo, titleReady = true, rating, facts, genres, overview, cast, to, list, play }: HeroInfoProps) {
  const [brokenLogo, setBrokenLogo] = useState<string>()
  // Si el logo no carga, volvemos al título en texto.
  const showLogo = logo && logo !== brokenLogo ? logo : undefined
  const listLabel = list.busy ? 'Agregando…' : list.unavailable ? 'No disponible' : list.inList ? 'En mi lista' : 'Mi lista'
  return (
    <div className="portada-content">
      {eyebrow && <span className="portada-eyebrow">{eyebrow}</span>}
      <h1 className={`portada-title${showLogo ? ' has-logo' : ''}${titleReady ? '' : ' is-pending'}`}>
        {showLogo ? <img className="portada-logo" src={showLogo} alt={title} onError={() => setBrokenLogo(showLogo)} /> : <span>{title}</span>}
      </h1>
      {(rating || facts.length > 0) && (
        <p className="portada-facts">
          <ImdbRating value={rating} />
          {facts.map((f, i) => (
            <span key={`${i}-${f}`}>{f}</span>
          ))}
        </p>
      )}
      {genres && genres.length > 0 && <p className="portada-genres">{genres.join(' · ')}</p>}
      {overview && <p className="portada-desc">{overview}</p>}
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
      <div className="portada-actions">
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
          <span>{play ? (play.busy ? 'Buscando fuente…' : play.label) : 'Ver ahora'}</span>
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
