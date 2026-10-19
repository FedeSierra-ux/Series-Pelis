import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { streamingServerUrl } from '../../lib/addons'
import { sameAddon } from '../../lib/addonKey'
import {
  debridFailureText,
  failureFromLocation,
  findTorrentTwin,
  isDebridDownload,
  isTorrentio,
  parseDebridLink,
  requestDebridDownload,
  torrentStreamFor,
  type DebridFailure,
} from '../../lib/debrid'
import { nativeDebridProbe } from '../../lib/native'
import { addonsStore } from '../../lib/store'
import { torrentServerReady, type TorrentServer } from '../../lib/torrentServer'
import type { PlayState } from '../Detail'
import { EngineError } from './EngineError'
import type { Resume, SwitchState } from './SourcesMenu'

// v0.27: debrid con TorBox (a través de Torrentio).
// - Lo que TorBox todavía no tiene ("[TB download]"): se reproduce por torrent (motor de Android o servidor de
//   Stremio en la PC) y en paralelo se abre el link, así TorBox lo baja para la próxima.
// - Si el debrid falla (Torrentio devuelve un video de aviso de 30 s, o un error): cartel con "Reproducir por
//   torrent". Nunca pasa solo.

/** El link de debrid de Torrentio que se está por reproducir (solo si es el link del propio stream). */
export function debridLinkOf(state: PlayState) {
  return state.stream.url && state.stream.url === state.playUrl ? parseDebridLink(state.playUrl) : undefined
}

/** El mismo título por torrent en lugar del link de debrid. Sin servidor de torrents, `undefined`. */
export async function torrentStateFor(state: PlayState, server: TorrentServer, signal?: AbortSignal): Promise<PlayState | undefined> {
  const link = debridLinkOf(state)
  if (!link || !server.url) return undefined
  const addon = state.addonUrl ? addonsStore.get().find((a) => sameAddon(a.transportUrl, state.addonUrl!)) : undefined
  const videoId = state.video?.id ?? state.meta.id
  const twin = addon && isTorrentio(addon) ? await findTorrentTwin(addon, state.meta.type, videoId, link, signal) : undefined
  const stream = torrentStreamFor(state.stream, link, twin)
  const playUrl = streamingServerUrl(server.url, stream, server.engine)
  return playUrl ? { ...state, stream, playUrl } : undefined
}

/** Aviso que muestra el reproductor cuando arranca por torrent en lugar del debrid. */
export const TORRENT_WHILE_DOWNLOADING = 'TorBox todavía no lo tiene: va por torrent mientras lo baja'
export const TORRENT_INSTEAD_OF_DEBRID = 'Por torrent: el debrid no pudo con esta fuente'

/** Cambia al torrent sin salir del reproductor (como cambiar de fuente), con el aviso de por qué. */
function useGoTorrent() {
  const navigate = useNavigate()
  const location = useLocation()
  return (next: PlayState, resume: Resume, note: string) => {
    const target: SwitchState = { ...next, resume: { ...resume, note } }
    navigate(location.pathname + location.search, { replace: true, state: target })
  }
}

/**
 * "[TB download]": le pide a TorBox que lo baje y arranca por torrent. Si no hay con qué abrir torrents,
 * `onPlain` sigue con el link de debrid (Torrentio muestra su aviso y salta el cartel de abajo).
 */
export function DebridDownload({ state, resume, onPlain }: { state: PlayState; resume?: Resume; onPlain: () => void }) {
  const go = useGoTorrent()
  useEffect(() => {
    const ctrl = new AbortController()
    requestDebridDownload(state.playUrl)
    torrentServerReady()
      .then((server) => torrentStateFor(state, server, ctrl.signal))
      .then((next) => {
        if (ctrl.signal.aborted) return
        if (next) go(next, { ...resume, at: resume?.at ?? 0 }, TORRENT_WHILE_DOWNLOADING)
        else onPlain()
      })
      .catch(() => {
        if (!ctrl.signal.aborted) onPlain()
      })
    return () => ctrl.abort()
  }, [])
  return (
    <div className="player player-native">
      <div className="player-spinner" aria-label="Preparando el torrent" />
    </div>
  )
}

/** El debrid no pudo: el motivo (si se puede saber) y el botón "Reproducir por torrent". */
export function DebridError({ state, at = 0 }: { state: PlayState; at?: number }) {
  const go = useGoTorrent()
  const [kind, setKind] = useState<DebridFailure>(isDebridDownload(state.stream) ? 'downloading' : 'unknown')
  const [server, setServer] = useState<TorrentServer>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    torrentServerReady().then((s) => alive && setServer(s))
    // En la app de Android se puede leer adónde redirige el link (el navegador no puede): ahí está el motivo.
    nativeDebridProbe(state.playUrl).then((p) => {
      const k = failureFromLocation(p?.location)
      if (alive && k !== 'unknown') setKind(k)
    })
    return () => {
      alive = false
    }
  }, [state.playUrl])

  const play = async () => {
    if (!server || busy) return
    setBusy(true)
    const next = await torrentStateFor(state, server)
    if (next) go(next, { at }, TORRENT_INSTEAD_OF_DEBRID)
    else setBusy(false)
  }

  const reason = debridFailureText(kind)
  const canTorrent = !!server?.url
  const message = server && !canTorrent ? `${reason} ${server.missing ?? ''}`.trim() : reason
  return (
    <EngineError
      state={state}
      message={message}
      at={at}
      action={canTorrent ? { label: busy ? 'Preparando…' : 'Reproducir por torrent', onClick: play, disabled: busy } : undefined}
    />
  )
}
