import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { episodeLabel } from '../../lib/format'
import { useTvMode } from '../../lib/tv'
import type { PlayState } from '../Detail'
import { PlayerIcon } from './PlayerIcons'
import { SourcesMenu, useSwitchSource } from './SourcesMenu'

// Un torrent del motor de la app de Android (v0.25) que no se pudo reproducir. La URL es http a 127.0.0.1:
// el reproductor de la web no la puede abrir, así que en vez de pasarle el video se muestra el error y se
// ofrece otra fuente. Las flechas y "Atrás" los maneja la navegación de siempre (`spatialNav`).

/** `at`: segundos donde quedó (la otra fuente sigue desde ahí). */
export function EngineError({ state, message, at = 0 }: { state: PlayState; message: string; at?: number }) {
  const navigate = useNavigate()
  const switchSource = useSwitchSource(state)
  const tvMode = useTvMode()
  const [sources, setSources] = useState(false)
  const { meta, video } = state

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
            <strong>{meta.name}</strong>
            {video && <span>{[episodeLabel(video.season, video.episode), video.title ?? video.name].filter(Boolean).join(' · ')}</span>}
          </div>
          <p>{message}</p>
          {sources && (
            <div className="player-error-sources">
              <SourcesMenu state={state} onPick={(pick) => switchSource(pick, { at })} />
            </div>
          )}
          <div className="hero-actions">
            {!sources && (
              <button className="btn btn-primary" onClick={() => setSources(true)} autoFocus data-autofocus>
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
