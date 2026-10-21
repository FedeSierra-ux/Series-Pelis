import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchWithTimeout } from '../../lib/abort'
import {
  browserMediaCaps,
  canPlayDirect,
  createBody,
  formatSpeed,
  hlsUrl,
  markLocalStremioMissing,
  STREMIO_SERVER,
  STREMIO_SERVICE_URL,
  torrentProgress,
  transcodeId,
  type MediaProbe,
  type ServerPlan,
} from '../../lib/stremioServer'
import type { PlayState } from '../Detail'
import { EngineError } from './EngineError'

// v0.29: antes de abrir un torrent con el servidor de Stremio (Stremio Service en la PC) se hace lo mismo que
// Stremio Web: se crea el torrent con sus trackers, se pregunta qué trae el archivo y, si el navegador no lo puede
// reproducir tal cual (MKV con x265, AC3, 5.1, dos audios), se pide la versión convertida (HLS).

/** Hasta tener el torrent (sus datos llegan de los pares). Sin nadie que lo comparta, no llega nunca. */
export const CONNECT_TIMEOUT_MS = 90_000
/** Preguntar el formato: el servidor tiene que bajar el principio del archivo. */
const PROBE_TIMEOUT_MS = 45_000
/** Un link directo (ya está en internet): si tarda más, se abre como siempre. */
const DIRECT_PROBE_TIMEOUT_MS = 15_000
const STATS_EVERY_MS = 1500

type Failure = 'server' | 'peers' | 'error'

const FAILURE_TEXT: Record<Failure, string> = {
  server: 'No se pudo conectar con Stremio Service. Abrilo en esta compu (o instalalo) y probá de nuevo.',
  peers: 'Nadie está compartiendo este torrent ahora o tarda demasiado en conectar. Probá de nuevo o elegí otra fuente.',
  error: 'El servidor de Stremio no pudo abrir este torrent. Probá de nuevo o elegí otra fuente.',
}

async function probe(base: string, mediaUrl: string, timeoutMs: number): Promise<MediaProbe> {
  const res = await fetchWithTimeout(`${base}/hlsv2/probe?${new URLSearchParams([['mediaURL', mediaUrl]])}`, { timeoutMs })
  if (!res.ok) throw new Error(`probe ${res.status}`)
  return (await res.json()) as MediaProbe
}

/** Directo si el navegador puede; si no, la versión convertida. */
function playableUrl(base: string, mediaUrl: string, info: MediaProbe): string {
  const caps = browserMediaCaps()
  return canPlayDirect(info, caps) ? mediaUrl : hlsUrl(base, mediaUrl, caps, transcodeId())
}

/**
 * `onReady`: la URL que abre el reproductor de la web (directa o HLS). `onPlain`: abrir la de siempre (un link
 * directo cuando el servidor no contestó). `onRetry`: volver a empezar (lo remonta el que lo usa).
 */
export function StremioPrepare({
  state,
  plan,
  at,
  onReady,
  onPlain,
  onRetry,
}: {
  state: PlayState
  plan: ServerPlan
  at?: number
  onReady: (url: string) => void
  onPlain: () => void
  onRetry: () => void
}) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<'connecting' | 'probing'>(plan.kind === 'torrent' ? 'connecting' : 'probing')
  const [stats, setStats] = useState<{ peers: number; speed: number }>()
  const [failure, setFailure] = useState<Failure>()

  useEffect(() => {
    const ctrl = new AbortController()
    let statsTimer: ReturnType<typeof setTimeout> | undefined
    const local = plan.base === STREMIO_SERVER

    const serverDown = () => {
      if (local) markLocalStremioMissing()
    }

    if (plan.kind === 'direct') {
      probe(plan.base, plan.mediaUrl, DIRECT_PROBE_TIMEOUT_MS)
        .then((info) => {
          if (!ctrl.signal.aborted) onReady(playableUrl(plan.base, plan.mediaUrl, info))
        })
        .catch((err) => {
          if (ctrl.signal.aborted) return
          if (err instanceof TypeError) serverDown()
          // Sin respuesta del servidor: el link se abre como siempre (puede que el navegador sí pueda).
          onPlain()
        })
      return () => ctrl.abort()
    }

    // Mientras se conecta: cuántos comparten y a qué velocidad baja.
    const pollStats = async () => {
      try {
        const res = await fetchWithTimeout(`${plan.base}/${plan.hash}/stats.json`, { timeoutMs: 4000, signal: ctrl.signal })
        if (res.ok && !ctrl.signal.aborted) setStats(torrentProgress(await res.json()))
      } catch {
        // Todavía no existe o el servidor está ocupado: el próximo intento.
      }
      if (!ctrl.signal.aborted) statsTimer = setTimeout(pollStats, STATS_EVERY_MS)
    }
    statsTimer = setTimeout(pollStats, STATS_EVERY_MS)

    const run = async () => {
      let fileIdx = plan.fileIdx
      let res: Response
      try {
        res = await fetchWithTimeout(`${plan.base}/${plan.hash}/create`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(createBody(plan.hash, plan.fileIdx, plan.sources, state.video)),
          timeoutMs: CONNECT_TIMEOUT_MS,
          signal: ctrl.signal,
        })
      } catch (err) {
        if (ctrl.signal.aborted) return
        // Error de red: el servidor no está (o el navegador no dejó). Si no, se cortó por tiempo: el servidor anda
        // pero el torrent no llega.
        if (!(err instanceof TypeError)) return setFailure('peers')
        serverDown()
        return setFailure('server')
      }
      if (!res.ok) return setFailure('error')
      if (fileIdx === undefined) {
        const body = (await res.json().catch(() => null)) as { guessedFileIdx?: unknown } | null
        if (typeof body?.guessedFileIdx === 'number' && body.guessedFileIdx >= 0) fileIdx = body.guessedFileIdx
      }
      if (ctrl.signal.aborted) return
      clearTimeout(statsTimer)
      setPhase('probing')
      const mediaUrl = `${plan.base}/${plan.hash}/${fileIdx ?? -1}`
      let url = mediaUrl
      try {
        url = playableUrl(plan.base, mediaUrl, await probe(plan.base, mediaUrl, PROBE_TIMEOUT_MS))
      } catch {
        // Como Stremio Web: sin respuesta del formato se intenta directo (el reproductor avisa si no puede).
      }
      if (!ctrl.signal.aborted) onReady(url)
    }
    void run()
    return () => {
      ctrl.abort()
      clearTimeout(statsTimer)
    }
  }, [])

  if (failure) {
    return (
      <EngineError
        state={state}
        message={FAILURE_TEXT[failure]}
        at={at}
        onRetry={onRetry}
        action={{ label: 'Probar de nuevo', onClick: onRetry }}
        link={failure === 'server' ? { label: 'Descargar Stremio Service', href: STREMIO_SERVICE_URL } : undefined}
      />
    )
  }

  const exit = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate(`/detail/${state.meta.type}/${encodeURIComponent(state.meta.id)}`, { replace: true })
  }
  const title = phase === 'connecting' ? 'Conectando con el torrent…' : 'Preparando el video…'
  const detail =
    phase !== 'connecting'
      ? undefined
      : !stats || stats.peers === 0
        ? 'Buscando quién lo comparte'
        : `${stats.peers === 1 ? '1 persona lo comparte' : `${stats.peers} personas lo comparten`}${stats.speed > 0 ? ` · ${formatSpeed(stats.speed)}` : ''}`
  return (
    <div className="player player-native player-prepare">
      <div className="player-prepare-box" role="status" aria-live="polite">
        <div className="player-spinner" aria-hidden="true" />
        <strong>{title}</strong>
        {detail && <span>{detail}</span>}
        <button className="btn" onClick={exit} autoFocus data-autofocus>
          Volver
        </button>
      </div>
    </div>
  )
}
