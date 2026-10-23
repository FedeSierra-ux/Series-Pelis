import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { debridFailureText, failureFromLocation, isDebridDownload, requestDebridDownload, torrentStateFor, type DebridFailure } from '../../lib/debrid'
import { DEBRID_WAIT_MAX_MS, formatElapsed, nextWaitStep, pollDelay, probeDebridLink, startWait } from '../../lib/debridWait'
import { nativeDebridProbe } from '../../lib/native'
import { addonsStore } from '../../lib/store'
import { torrentServerReady, type TorrentServer } from '../../lib/torrentServer'
import type { PlayState } from '../Detail'
import { EngineError } from './EngineError'
import type { Resume, SwitchState } from './SourcesMenu'

// v0.27: debrid con TorBox (a través de Torrentio).
// - Lo que TorBox todavía no tiene ("[TB download]"): se reproduce por torrent (motor de Android o servidor de
//   Stremio en la PC) y en paralelo se abre el link, así TorBox lo baja para la próxima.
// - Si el debrid falla (Torrentio devuelve un video de aviso de 30 s; en la app de Android, también un error antes
//   de arrancar): cartel con "Reproducir por torrent". Nunca pasa solo. En el navegador un error del video no
//   cuenta: suele ser el formato (MKV), no el debrid.
// v0.30: sin servidor de torrents (el navegador del celular o de la compu) no hay torrent mientras TorBox lo baja:
//   se espera en una pantalla propia y arranca solo cuando TorBox lo tiene (ver `lib/debridWait.ts`). Ahí el
//   cartel de falla no ofrece "Reproducir por torrent" (no hay con qué), solo "Probar de nuevo".

/** Aviso que muestra el reproductor cuando arranca por torrent en lugar del debrid. */
export const TORRENT_WHILE_DOWNLOADING = 'TorBox todavía no lo tiene: va por torrent mientras lo baja'
export const TORRENT_INSTEAD_OF_DEBRID = 'Por torrent: el debrid no pudo con esta fuente'
/** v0.30: la espera terminó y arranca el video de TorBox. */
export const DEBRID_READY_NOTE = 'Listo: TorBox ya lo bajó'

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
 * "[TB download]": le pide a TorBox que lo baje y arranca por torrent. Sin servidor de torrents (v0.30) espera a
 * que TorBox lo tenga y `onReady` lo reproduce. Si no, `onPlain` sigue con el link de debrid (Torrentio muestra su
 * aviso y salta el cartel de abajo).
 */
export function DebridDownload({ state, resume, onPlain, onReady }: { state: PlayState; resume?: Resume; onPlain: () => void; onReady: () => void }) {
  const go = useGoTorrent()
  const [waiting, setWaiting] = useState(false)
  useEffect(() => {
    const ctrl = new AbortController()
    requestDebridDownload(state.playUrl)
    torrentServerReady()
      .then(async (server) => {
        if (ctrl.signal.aborted) return
        if (!server.url) return setWaiting(true)
        const next = await torrentStateFor(state, server, addonsStore.get(), ctrl.signal)
        if (ctrl.signal.aborted) return
        if (next) go(next, { ...resume, at: resume?.at ?? 0 }, TORRENT_WHILE_DOWNLOADING)
        else onPlain()
      })
      .catch(() => {
        if (!ctrl.signal.aborted) onPlain()
      })
    return () => ctrl.abort()
  }, [])
  if (waiting) return <DebridWait state={state} onReady={onReady} />
  // Sin <video>: `data-no-screensaver` frena el protector mientras se prepara.
  return (
    <div className="player player-native" data-no-screensaver>
      <div className="player-spinner" role="status" aria-label="Preparando el video" />
    </div>
  )
}

/** v0.30: texto cuando se pasó el tope de la espera. */
export const DEBRID_WAIT_GAVE_UP = `TorBox no lo terminó de bajar en ${DEBRID_WAIT_MAX_MS / 60_000} minutos (o no pudo). Probá de nuevo más tarde o elegí otra fuente.`

/**
 * v0.30: "TorBox lo está bajando…". Se mira el link de a ratos con un <video> escondido (ver `lib/debridWait.ts`) y,
 * cuando ya no da el aviso de 30 s, `onReady`. Se deja de mirar al salir; tras el tope, "Probar de nuevo".
 */
export function DebridWait({ state, onReady }: { state: PlayState; onReady: () => void }) {
  const navigate = useNavigate()
  const host = useRef<HTMLDivElement>(null)
  const [round, setRound] = useState(0)
  const [startedAt, setStartedAt] = useState(() => Date.now())
  const [now, setNow] = useState(startedAt)
  const [gaveUp, setGaveUp] = useState(false)

  useEffect(() => {
    if (gaveUp) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [gaveUp])

  useEffect(() => {
    const ctrl = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let wait = startWait(Date.now())
    const look = async () => {
      const result = await probeDebridLink(state.playUrl, { signal: ctrl.signal, host: host.current })
      if (ctrl.signal.aborted) return
      const { state: next, step } = nextWaitStep(wait, result, Date.now())
      wait = next
      if (step.action === 'play') onReady()
      else if (step.action === 'give-up') setGaveUp(true)
      else timer = setTimeout(look, step.delay)
    }
    timer = setTimeout(look, pollDelay(0))
    return () => {
      ctrl.abort()
      clearTimeout(timer)
    }
  }, [round])

  if (gaveUp) {
    const again = () => {
      const t = Date.now()
      setStartedAt(t)
      setNow(t)
      setGaveUp(false)
      setRound((n) => n + 1)
    }
    return <EngineError state={state} message={DEBRID_WAIT_GAVE_UP} action={{ label: 'Probar de nuevo', onClick: again }} />
  }

  const exit = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate(`/detail/${state.meta.type}/${encodeURIComponent(state.meta.id)}`, { replace: true })
  }
  // La espera puede durar minutos sin tocar nada: `data-no-screensaver` para que el protector no tape el video
  // cuando arranque.
  return (
    <div className="player player-native player-prepare player-debrid-wait" data-no-screensaver>
      <div className="player-prepare-box" role="status" aria-live="polite">
        <div className="player-spinner" aria-hidden="true" />
        <strong>TorBox lo está bajando…</strong>
        <span className="player-prepare-note">Todavía no estaba listo. Arranca solo apenas esté: suele tardar unos minutos.</span>
        {/* El tiempo va aparte del aviso: un lector de pantalla no lo repite cada segundo. */}
        <span aria-hidden="true">Esperando hace {formatElapsed(now - startedAt)}</span>
        <button className="btn" onClick={exit} autoFocus data-autofocus>
          Volver
        </button>
      </div>
      {/* Acá va el <video> escondido con el que se mira el link. */}
      <div ref={host} hidden />
    </div>
  )
}

/** El debrid no pudo: el motivo (si se puede saber) y el botón "Reproducir por torrent". */
/** `onRetry`: volver a probar el mismo link (por ejemplo, un rato después de "TorBox lo está bajando"). */
export function DebridError({ state, at = 0, onRetry }: { state: PlayState; at?: number; onRetry?: () => void }) {
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
    const next = await torrentStateFor(state, server, addonsStore.get())
    if (next) go(next, { at }, TORRENT_INSTEAD_OF_DEBRID)
    else setBusy(false)
  }

  const reason = debridFailureText(kind)
  const canTorrent = !!server?.url
  // v0.30: sin servidor de torrents no se ofrece el torrent (no hay con qué): solo volver a probar el link.
  const message = server && !canTorrent && kind !== 'access' ? `${reason} Probá de nuevo en un rato o elegí otra fuente.` : reason
  const action = canTorrent
    ? { label: busy ? 'Preparando…' : 'Reproducir por torrent', onClick: play, busy }
    : server && onRetry
      ? { label: 'Probar de nuevo', onClick: onRetry }
      : undefined
  return <EngineError state={state} message={message} at={at} onRetry={onRetry} action={action} />
}
