import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getStreams } from '../../lib/addons'
import { useAddons } from '../../lib/hooks'
import { lastSourceStore, settingsStore } from '../../lib/store'
import { lastSourceOf, playable } from '../../lib/streamPicker'
import { useTorrentServer } from '../../lib/torrentServer'
import type { AddonStreams, InstalledAddon, Stream } from '../../lib/types'
import type { PlayState } from '../Detail'

/** Lo que se lleva el reproductor al cambiar de fuente, para seguir donde estaba. */
export interface Resume {
  /** segundos */
  at: number
  /** url del subtítulo activo ('' = sin subtítulos) */
  sub?: string
  /** Nombre del subtítulo activo: la pista nueva lo necesita antes de que llegue la lista. */
  subLabel?: string
  subDelay?: number
  /** idioma de la pista de audio activa */
  audioLang?: string
}

export type SwitchState = PlayState & { resume?: Resume }

interface Pick {
  stream: Stream
  url: string
  addon: InstalledAddon
}

/** Cambia de fuente sin salir del reproductor: la misma ruta con otro stream y la posición actual. */
export function useSwitchSource(state: PlayState) {
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(
    (pick: Pick, resume: Resume) => {
      if (settingsStore.get().sourceRules.rememberLast) {
        lastSourceStore.set((all) => ({
          ...all,
          [state.meta.id]: lastSourceOf(pick.addon.transportUrl, pick.stream),
        }))
      }
      const next: SwitchState = {
        ...state,
        stream: pick.stream,
        playUrl: pick.url,
        addonName: pick.addon.manifest.name,
        addonUrl: pick.addon.transportUrl,
        resume,
      }
      navigate(location.pathname + location.search, { replace: true, state: next })
    },
    [state, navigate, location.pathname, location.search],
  )
}

function lines(s: Stream) {
  return (s.title ?? s.description ?? '').split('\n').filter(Boolean)
}

/** Opciones del menú "Fuentes": los streams reproducibles del video, con la actual marcada. */
export function SourcesMenu({ state, onPick }: { state: PlayState; onPick: (pick: Pick) => void }) {
  const addons = useAddons()
  const server = useTorrentServer()
  const [groups, setGroups] = useState<AddonStreams[]>()
  const ref = useRef<HTMLSpanElement>(null)
  const videoId = state.video?.id ?? state.meta.id

  // Sale de la caché de streams (10 min) si se eligió hace poco desde la ficha.
  useEffect(() => getStreams(addons, state.meta.type, videoId, setGroups), [addons, state.meta.type, videoId])

  const items = (groups ?? []).flatMap((g) =>
    g.streams.flatMap((stream) => {
      const url = playable(stream, server).url
      return url ? [{ stream, url, addon: g.addon }] : []
    }),
  )
  const loading = !groups || groups.some((g) => g.loading)

  // Si los streams llegaron después de abrir el menú, el foco va a la fuente actual.
  const count = items.length
  useEffect(() => {
    const menu = ref.current?.closest('.player-menu, .player-error-sources')
    if (!count || !menu || menu.contains(document.activeElement)) return
    ;(menu.querySelector<HTMLElement>('button.active') ?? menu.querySelector<HTMLElement>('button'))?.focus()
  }, [count])

  return (
    <>
      <span ref={ref} className="player-menu-title muted small">
        Fuentes{loading ? ' · buscando…' : ''}
      </span>
      {!loading && items.length === 0 && <span className="player-menu-title muted small">No hay otras fuentes reproducibles.</span>}
      {items.map((it, i) => {
        const current = it.url === state.playUrl
        const sub = lines(it.stream)
        return (
          <button
            key={`${it.addon.transportUrl}|${i}`}
            className={`source-item ${current ? 'active' : ''}`}
            aria-current={current || undefined}
            onClick={() => onPick(it)}
          >
            <span className="source-name">
              {(it.stream.name ?? '').replace(/\n/g, ' ') || it.addon.manifest.name}
              {current && <em> · Actual</em>}
            </span>
            <span className="source-lines muted small">
              {it.addon.manifest.name}
              {sub.length ? ` · ${sub.join(' · ')}` : ''}
            </span>
          </button>
        )
      })}
    </>
  )
}
