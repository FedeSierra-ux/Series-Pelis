import { useEffect, useState, type RefObject } from 'react'
import { tip } from './controlBar'
import { PlayerIcon } from './PlayerIcons'
import { clampVolume, readVolume, storeVolume, volumeIcon, type VolumeState } from './volume'

// Volumen con mouse (U23): parlante en la barra y, al pasar el mouse (o con el foco), un slider.
// En la TV y en el celular no se muestra (ahí manda el volumen del aparato): ver player-v14.css.

/** Sigue el volumen del <video> y lo recuerda en la sesión (al pasar de episodio no vuelve al 100 %). */
export function useVolume(videoRef: RefObject<HTMLVideoElement | null>) {
  const [state, setState] = useState<VolumeState>(() => readVolume() ?? { volume: 1, muted: false })

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const saved = readVolume()
    if (saved) {
      el.volume = saved.volume
      el.muted = saved.muted
    }
    const sync = () => {
      const next = { volume: clampVolume(el.volume), muted: el.muted }
      setState(next)
      storeVolume(next)
    }
    sync()
    el.addEventListener('volumechange', sync)
    return () => el.removeEventListener('volumechange', sync)
  }, [videoRef])

  return state
}

interface Props {
  state: VolumeState
  onToggleMute: () => void
  /** 0 a 1 */
  onSet: (volume: number) => void
}

export function VolumeControl({ state, onToggleMute, onSet }: Props) {
  const level = state.muted ? 0 : Math.round(state.volume * 100)
  return (
    <div className="vol" style={{ ['--vol' as string]: `${level}%` }}>
      <button onClick={onToggleMute} {...tip(state.muted ? 'Activar el sonido' : 'Silenciar')} aria-pressed={state.muted} data-vol-btn>
        <PlayerIcon name={volumeIcon(state)} />
      </button>
      <input
        className="vol-slider"
        type="range"
        min={0}
        max={100}
        step={5}
        value={level}
        aria-label="Volumen"
        aria-valuetext={state.muted ? 'Silenciado' : `${level} %`}
        onChange={(e) => onSet(Number(e.target.value) / 100)}
      />
    </div>
  )
}
