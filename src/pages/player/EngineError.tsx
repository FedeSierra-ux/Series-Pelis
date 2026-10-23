import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { episodeLabel } from '../../lib/format'
import { useLocalTitle } from '../../lib/localTitles'
import { useTvMode } from '../../lib/tv'
import type { PlayState } from '../Detail'
import { PlayerIcon } from './PlayerIcons'
import { SourcesMenu, useSwitchSource } from './SourcesMenu'

// Un torrent del motor de la app de Android (v0.25) que no se pudo reproducir. La URL es http a 127.0.0.1:
// el reproductor de la web no la puede abrir, así que en vez de pasarle el video se muestra el error y se
// ofrece otra fuente. Las flechas y "Atrás" los maneja la navegación de siempre (`spatialNav`).

/**
 * `at`: segundos donde quedó (la otra fuente sigue desde ahí). `onRetry`: volver a probar la misma fuente.
 * `action` (v0.27): botón principal propio, por ejemplo "Reproducir por torrent" cuando falla el debrid.
 * `link` (v0.29): enlace afuera, por ejemplo la descarga de Stremio Service.
 */
export function EngineError({
  state,
  message,
  at = 0,
  onRetry,
  action,
  link,
}: {
  state: PlayState
  message: string
  at?: number
  onRetry?: () => void
  action?: { label: string; onClick: () => void; busy?: boolean }
  link?: { label: string; href: string }
}) {
  const navigate = useNavigate()
  const switchSource = useSwitchSource(state)
  const tvMode = useTvMode()
  const [sources, setSources] = useState(false)
  const { meta, video } = state
  // v0.28: el nombre en español (si ya se sabe).
  const shownName = useLocalTitle(meta.id, meta.name, { type: meta.type })

  const exit = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate(`/detail/${meta.type}/${encodeURIComponent(meta.id)}`, { replace: true })
  }

  return (
    <div className="player show-controls">
      <div
        className={`player-error player-float player-modal ${tvMode ? 'player-error-tv' : ''}`}
        role="alert"
        style={{ ['--player-bg' as string]: meta.background ? `url("${meta.background}")` : undefined }}
      >
        <div className="player-error-card">
          <span className="player-error-icon">
            <PlayerIcon name="alert" size={tvMode ? 48 : 40} />
          </span>
          <div className="player-error-heading">
            <strong>{shownName}</strong>
            {video && <span>{[episodeLabel(video.season, video.episode), video.title ?? video.name].filter(Boolean).join(' · ')}</span>}
          </div>
          <p>{message}</p>
          {sources && (
            <div className="player-error-sources">
              <SourcesMenu
                state={state}
                // La misma URL no cambia la key del reproductor: se reintenta sin navegar (y sin `onRetry` no se hace nada,
                // porque navegar a la misma fuente no remonta nada y la pantalla quedaba igual).
                onPick={(pick) => {
                  if (pick.url === state.playUrl) onRetry?.()
                  else switchSource(pick, { at })
                }}
              />
            </div>
          )}
          <div className="hero-actions">
            {action && !sources && (
              // `aria-disabled` y no `disabled`: un botón deshabilitado pierde el foco y el control remoto queda sin destino.
              <button className="btn btn-primary" onClick={action.busy ? undefined : action.onClick} aria-disabled={action.busy || undefined} autoFocus data-autofocus>
                {action.label}
              </button>
            )}
            {link && !sources && (
              <a className="btn" href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            )}
            {!sources && (
              <button className={action ? 'btn' : 'btn btn-primary'} onClick={() => setSources(true)} autoFocus={!action} data-autofocus={action ? undefined : true}>
                Elegir otra fuente
              </button>
            )}
            <button className="btn" onClick={exit}>
              Volver
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
