import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getStreams } from '../../lib/addons'
import { isDebridDownload, prefetchTorrentTwins } from '../../lib/debrid'
import { debridTwinOf } from '../../lib/debridWait'
import { useAddons } from '../../lib/hooks'
import { desktopTorrentBase } from '../../lib/desktop'
import { isNativeApp } from '../../lib/native'
import { isOnline } from '../../lib/online'
import { lastSourceStore, settingsStore, useStore } from '../../lib/store'
import { sourceCounts, streamFacts } from '../../lib/streamFacts'
import { analyzeStreams, lastSourceOf, playable, streamKey, type RankedStream } from '../../lib/streamPicker'
import { ensureLocalStremio, useLocalStremio } from '../../lib/stremioServer'
import { TORRENT_LOADING, useTorrentServer } from '../../lib/torrentServer'
import type { AddonStreams, InstalledAddon, Meta, Stream, Video } from '../../lib/types'
import { createRecentSet } from './autoPlayed'
import { episodeNumber } from './episodes'
import { pendingNames, safeGroups } from './safeData'
import { streamOrder } from './streamOrder'

export interface PlayState {
  stream: Stream
  playUrl: string
  meta: Pick<Meta, 'id' | 'type' | 'name' | 'poster' | 'background' | 'logo'>
  video?: Pick<Video, 'id' | 'season' | 'episode' | 'title' | 'name'>
  /** Siguiente episodio, para el botón del reproductor. */
  nextVideoId?: string
  addonName: string
  /** transportUrl del addon (para recordar la fuente y buscar la misma en el siguiente episodio). */
  addonUrl?: string
}

/** Lo que la ficha deja en `location.state` al elegir un episodio. */
export interface DetailLocationState {
  /** Al volver del reproductor: no arrancar sola la cuenta regresiva del modo automático. */
  noAuto?: boolean
  /** "Ver desde el principio": el reproductor arranca en 0 aunque haya progreso guardado. */
  fromStart?: boolean
}

/** v0.29: ¿a este stream le sirve Stremio Service en la PC? */
function benefitsFromServer(s: Stream): boolean {
  return (!!s.infoHash && !s.url) || isDebridDownload(s) || !!s.behaviorHints?.notWebReady
}

export function streamLabel(s: Stream) {
  const lines = (s.title ?? s.description ?? '').split('\n').filter(Boolean)
  return { name: (s.name ?? '').replace(/\n/g, ' '), lines }
}

/** Espera a los addons lentos una vez que ya hay algo reproducible, antes de recomendar o reproducir solo. */
const GRACE_MS = 4000
const COUNTDOWN = 3
/**
 * Entradas del historial (location.key + video) que ya se reprodujeron solas: al volver atrás
 * desde el reproductor no arranca sola de nuevo, así nadie queda atrapado. Con tope, por sesión.
 */
const autoPlayed = createRecentSet(50)

/** Lo que cuenta como "el usuario tocó algo" mientras la lista espera para tomar el foco (`claimFocus`). */
const CLAIM_CANCEL_EVENTS = ['keydown', 'pointerdown'] as const

interface StreamListProps {
  meta: Meta
  video?: Video
  nextVideoId?: string
  /**
   * tv-01 / tv-02: la ficha pide que el foco vaya a la fuente recomendada apenas la lista está lista (después de
   * "Reproducir" de una serie o de elegir un episodio con el control remoto). Si el usuario toca una tecla o el
   * puntero antes de que llegue, se suelta; con la cuenta regresiva del modo automático tampoco se toma.
   */
  claimFocus?: boolean
  /** La ficha deja de pedir el foco (ya se tomó, o ya no corresponde). */
  onClaimDone?: () => void
}

export function StreamList({ meta, video, nextVideoId, claimFocus, onClaimDone }: StreamListProps) {
  const addons = useAddons()
  const settings = useStore(settingsStore)
  // Con qué se abren los torrents: el servidor de Stremio de Ajustes o el motor de la app de Android.
  const server = useTorrentServer()
  const lastSources = useStore(lastSourceStore)
  const navigate = useNavigate()
  const location = useLocation()
  const { noAuto, fromStart } = (location.state ?? {}) as DetailLocationState
  const videoId = video?.id ?? meta.id
  const fetchKey = `${meta.type}|${videoId}`
  // Los resultados van con su video, para no mezclar los de otro episodio mientras llegan los nuevos.
  const [result, setResult] = useState<{ key: string; groups: AddonStreams[] }>()
  const [graceFor, setGraceFor] = useState<string>()
  const [countdown, setCountdown] = useState<{ key: string; pick: RankedStream; left: number }>()
  const [showHidden, setShowHidden] = useState(false)
  const [openTorrents, setOpenTorrents] = useState<Set<string>>(() => new Set())
  const listRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  // La fuente de la lista que tenía el foco (control remoto o teclado), para pasarlo a la recomendada
  // cuando la lista se reordena (ver abajo).
  const focusedItem = useRef<HTMLElement | null>(null)

  useEffect(
    () => getStreams(addons, meta.type, videoId, (groups) => setResult({ key: fetchKey, groups })),
    [addons, meta.type, videoId, fetchKey],
  )

  const fetched = result?.key === fetchKey
  // Una respuesta malformada de un addon (`streams` que no es una lista) cuenta como error de ese addon.
  const groups = useMemo(() => (fetched && result ? safeGroups(result.groups) : []), [fetched, result])
  const rules = settings.sourceRules
  const last = rules.rememberLast ? lastSources[meta.id] : undefined
  const { ranked, hidden } = useMemo(() => analyzeStreams(groups, rules, last, server), [groups, rules, last, server])
  const loading = !fetched || groups.some((g) => g.loading)
  const hasPlayable = ranked.length > 0

  // v0.27: si hay algo que TorBox todavía no tiene y hay con qué abrir torrents, se precarga el Torrentio sin
  // debrid (trackers e índice del archivo) para arrancar por torrent sin esperar.
  const twinAddons = useMemo(
    () => (server.url ? groups.filter((g) => !g.loading && g.streams.some(isDebridDownload)).map((g) => g.addon) : []),
    [groups, server.url],
  )
  useEffect(() => {
    for (const addon of twinAddons) prefetchTorrentTwins(addon, meta.type, videoId)
  }, [twinAddons, meta.type, videoId])

  // v0.29: en la PC se busca Stremio Service recién cuando la lista trae algo que lo aprovecha (torrents, lo que
  // TorBox todavía no tiene o links que el navegador quizás no abre), así el permiso de Chrome no sale de la nada.
  const local = useLocalStremio()
  const wantsLocal = local !== 'off' && !settings.streamingServerUrl.trim() && groups.some((g) => g.streams.some(benefitsFromServer))
  useEffect(() => {
    if (wantsLocal) void ensureLocalStremio()
  }, [wantsLocal])
  // v0.30: lo que el navegador no puede (MKV/HEVC/AC3) lo convierte el motor de la app de Windows o Stremio Service.
  const converts = !!desktopTorrentBase() || local === 'found'

  useEffect(() => {
    if (!hasPlayable) return
    const t = setTimeout(() => setGraceFor(fetchKey), GRACE_MS)
    return () => clearTimeout(t)
  }, [hasPlayable, fetchKey])

  // Se recomienda recién cuando respondieron todos (o pasó la espera). Si después un addon lento trae algo mejor,
  // la recomendación cambia y la lista se reacomoda otra vez (decisión del usuario, v0.27.1).
  const settled = fetched && (!loading || graceFor === fetchKey)
  const best = settled ? ranked[0] : undefined
  const bestId = best ? `${best.addon.transportUrl}|${best.streamIndex}` : ''
  const autoKey = `${location.key}|${fetchKey}`
  const pending = countdown?.key === autoKey ? countdown : undefined

  const play = (s: Stream, url: string, addon: InstalledAddon) => {
    if (rules.rememberLast) {
      lastSourceStore.set((all) => ({
        ...all,
        [meta.id]: lastSourceOf(addon.transportUrl, s),
      }))
    }
    const state: PlayState & { resume?: { at: number; fromStart?: boolean } } = {
      stream: s,
      playUrl: url,
      meta: { id: meta.id, type: meta.type, name: meta.name, poster: meta.poster, background: meta.background, logo: meta.logo },
      video: video && { id: video.id, season: video.season, episode: episodeNumber(video), title: video.title, name: video.name },
      nextVideoId,
      addonName: addon.manifest.name,
      addonUrl: addon.transportUrl,
    }
    // "Ver desde el principio": `resume` manda sobre el progreso guardado (ver `Player.tsx`).
    if (fromStart) state.resume = { at: 0, fromStart: true }
    navigate(`/watch/${meta.type}/${encodeURIComponent(videoId)}`, { state })
  }

  // Modo automático: una sola vez por entrada del historial, con cuenta regresiva cancelable.
  // Al volver del reproductor (`noAuto`) no arranca: el episodio recién visto no se repite solo.
  useEffect(() => {
    if (rules.mode !== 'auto' || noAuto || !best || autoPlayed.has(autoKey)) return
    autoPlayed.add(autoKey)
    setCountdown({ key: autoKey, pick: best, left: COUNTDOWN })
  }, [rules.mode, noAuto, best, autoKey])

  const pendingLeft = pending?.left
  useEffect(() => {
    if (!pending || pendingLeft === undefined) return
    if (pendingLeft <= 0) {
      setCountdown(undefined)
      play(pending.pick.stream, pending.pick.url, pending.pick.addon)
      return
    }
    const t = setTimeout(() => setCountdown((c) => c && { ...c, left: c.left - 1 }), 1000)
    return () => clearTimeout(t)
  }, [pendingLeft])

  // Con el control remoto: el foco va a "Elegir otro", así se cancela con un solo OK.
  const hasPending = !!pending
  useEffect(() => {
    if (hasPending) cancelRef.current?.focus()
  }, [hasPending])

  // Al llegar la recomendación la lista salta una vez (la recomendada pasa arriba de todo). Si el foco estaba
  // en una fuente va a la recomendada: queda arriba, donde estaba el foco, y OK reproduce lo que se ve marcado.
  // Si la recomendación cambia después (un addon que tardó más que la espera trajo algo mejor), el foco la
  // sigue solo si estaba en la anterior; si estabas en otra fuente, se queda ahí (React puede haber movido
  // ese botón y sacarle el foco: se lo devuelve). Si el foco estaba en otra parte de la ficha, no se toca.
  const prevBest = useRef<{ id: string; el: HTMLElement | null }>({ id: '', el: null })
  // Un clic o toque fuera de las fuentes (sinopsis, espacio vacío) deja el foco en `body` igual que cuando React
  // mueve un botón: se olvida la fuente enfocada, así no se roba el foco ni se mueve la página al llegar la
  // recomendación.
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.stream-item')) focusedItem.current = null
    }
    document.addEventListener('pointerdown', onPointer, true)
    return () => document.removeEventListener('pointerdown', onPointer, true)
  }, [])
  useLayoutEffect(() => {
    const list = listRef.current
    const rec = bestId ? (list?.querySelector<HTMLElement>('.stream-item.recommended') ?? null) : null
    const prev = prevBest.current
    prevBest.current = { id: bestId, el: rec }
    const item = focusedItem.current
    if (!rec || !item) return
    const active = document.activeElement
    const lost = !active || active === document.body
    const onStream = active instanceof HTMLElement && active.classList.contains('stream-item') && !!list?.contains(active)
    if (!lost && !onStream) return
    const target = !prev.id || item === prev.el || !item.isConnected ? rec : item
    if (target === active) return
    target.focus({ preventScroll: true })
    target.scrollIntoView({ block: 'nearest' })
  }, [bestId])

  // tv-01 / tv-02: el foco a la recomendada (o a la primera fuente) cuando la lista está lista. Una tecla o un toque
  // antes de eso suelta el pedido: no se le roba el foco a quien ya se movió.
  useEffect(() => {
    if (!claimFocus) return
    const release = (e: Event) => {
      if (e instanceof KeyboardEvent && e.repeat) return
      onClaimDone?.()
    }
    for (const type of CLAIM_CANCEL_EVENTS) window.addEventListener(type, release, true)
    return () => {
      for (const type of CLAIM_CANCEL_EVENTS) window.removeEventListener(type, release, true)
    }
  }, [claimFocus, onClaimDone])
  useLayoutEffect(() => {
    if (!claimFocus || !settled) return
    onClaimDone?.()
    if (hasPending) return
    const list = listRef.current
    const target = list?.querySelector<HTMLElement>('.stream-item.recommended') ?? list?.querySelector<HTMLElement>('button.stream-item, a.stream-item')
    if (!target) return
    target.focus({ preventScroll: true })
    target.scrollIntoView({ block: 'nearest' })
  }, [claimFocus, settled, bestId, hasPending, onClaimDone])

  const cancelAuto = () => {
    setCountdown(undefined)
    requestAnimationFrame(() => {
      const list = listRef.current
      ;(list?.querySelector<HTMLElement>('.stream-item.recommended') ?? list?.querySelector<HTMLElement>('button.stream-item, a.stream-item'))?.focus()
    })
  }

  if (!fetched) return <div className="streams-status muted">Buscando fuentes…</div>

  if (groups.length === 0) {
    return (
      <div className="streams-empty">
        <p>Ningún addon instalado ofrece fuentes para este título.</p>
        <p className="muted">
          Agregá tus addons de Stremio (por ejemplo uno configurado con tu Real-Debrid o TorBox) en{' '}
          <Link to="/settings">Ajustes</Link>.
        </p>
      </div>
    )
  }

  // v0.30: sin servidor de torrents, un torrent que también está en el Torrentio con TorBox (mismo hash y archivo) se
  // reproduce por TorBox: lo que ya tiene arranca enseguida y lo que no, espera a que lo baje.
  // Mientras arranca el motor de la app de Android no: ahí el torrent va a andar en unos segundos.
  const twinOf = (s: Stream) => (server.url || server.missing === TORRENT_LOADING ? undefined : debridTwinOf(s, groups))
  // Las fuentes de cada addon: las que se pueden abrir y los torrents sin debrid aparte.
  const isDeadTorrent = (s: Stream) => {
    const p = playable(s, server)
    return !p.url && !p.external && !!s.infoHash && !twinOf(s)
  }
  // La recomendada va primera (su addon arriba y ella primera dentro de él; ver `streamOrder`). Los que
  // esconden los filtros van aparte.
  const sorted = streamOrder(
    groups.map((g) => ({ addonUrl: g.addon.transportUrl, count: g.streams.length })),
    best && { addonUrl: best.addon.transportUrl, streamIndex: best.streamIndex },
  )
  const parts = sorted.map(({ addonIndex, bestIndex, order }) => {
    const g = groups[addonIndex]
    const items = order.map((i) => ({ s: g.streams[i], i })).filter(({ i }) => !hidden.has(streamKey(addonIndex, i)))
    // Los torrents que no se pueden abrir (sin debrid ni servidor de Stremio) van plegados, así no tapan los que sí andan.
    const usable = items.filter(({ s }) => !isDeadTorrent(s))
    const torrents = items.filter(({ s }) => isDeadTorrent(s))
    return { g, bestIndex, items, usable, torrents }
  })

  const total = groups.reduce((n, g) => n + g.streams.length, 0)
  const totalLabel = total === 1 ? '1 fuente' : `${total} fuentes`
  const deadTorrents = parts.reduce((n, pt) => n + pt.torrents.length, 0)
  // v0.26 (ficha-10): se cuentan las que se pueden abrir, no todas ("6 listas para ver · 2 torrents sin debrid · 1 oculta…").
  const counts = sourceCounts({
    ready: parts.reduce((n, pt) => n + pt.usable.filter(({ s }) => { const p = playable(s, server); return !!(p.url || p.external || twinOf(s)) }).length, 0),
    torrents: deadTorrents,
    hidden: hidden.size,
  })
  const countsText = (
    <>
      <strong>{counts.lead}</strong>
      {counts.rest.map((t) => ` · ${t}`).join('')}
    </>
  )
  // Un addon lento no deja la lista "buscando" para siempre: se dice cuál falta y, pasada la espera,
  // lo que ya llegó se da por bueno (se recomienda y se puede reproducir) mientras ese termina.
  const waiting = pendingNames(groups)
  const statusText = !loading ? (
    countsText
  ) : settled ? (
    <>
      {countsText} · {waiting} sigue{groups.filter((g) => g.loading).length > 1 ? 'n' : ''} buscando
    </>
  ) : (
    `Buscando fuentes… (${totalLabel} hasta ahora${waiting ? ` · esperando a ${waiting}` : ''})`
  )

  /** `hiddenReason`: está en "Ocultos por tus filtros" (se puede reproducir igual). */
  const renderItem = (s: Stream, i: number, addon: InstalledAddon, recommended: boolean, hiddenReason?: string, key: string | number = i) => {
    const { name, lines } = streamLabel(s)
    const p = playable(s, server)
    const twin = !p.url && !p.external ? twinOf(s) : undefined
    // v0.26 (ficha-03): etiquetas grandes (calidad, HDR, audio, idioma, peso), el servicio en palabras y el
    // archivo chico abajo. El texto crudo del addon queda en el `title` (al pasar el mouse).
    const f = streamFacts(s, addon.manifest.name)
    const chips = [
      f.quality && { k: 'q', t: f.quality, cls: 'sx-q' },
      f.hdr && { k: 'hdr', t: f.hdr },
      f.audio && { k: 'audio', t: f.audio },
      f.lang && { k: 'lang', t: f.lang, cls: f.latino ? 'sx-lat' : undefined },
      f.size && { k: 'size', t: f.size },
      f.seeds !== undefined && { k: 'seeds', t: `${f.seeds.toLocaleString('es-AR')} ${f.seeds === 1 ? 'seed' : 'seeds'}`, cls: f.lowSeeds ? 'sx-low' : undefined },
    ].filter((c): c is { k: string; t: string; cls?: string } => !!c)
    const service = [f.service, f.state, hiddenReason && f.service !== addon.manifest.name ? addon.manifest.name : undefined].filter(Boolean).join(' · ')
    // Sin etiquetas (un tráiler, un enlace suelto): el nombre que manda el addon, y el archivo al lado si hay (pc-05).
    const file = chips.length === 0 && name !== f.service ? [name, f.file !== name ? f.file : undefined].filter(Boolean).join(' · ') : f.file
    const content = (
      <>
        {recommended && <span className="stream-badge">Recomendado</span>}
        {chips.length > 0 && (
          <span className="sx-row">
            {chips.map((c) => (
              <span key={c.k} className={`sx-chip${c.cls ? ` ${c.cls}` : ''}`}>
                {c.t}
              </span>
            ))}
          </span>
        )}
        {service && <span className="sx-src">{service}</span>}
        {file && <span className="sx-file">{file}</span>}
        {hiddenReason && <span className="stream-hidden-reason">{hiddenReason}</span>}
        {f.lowSeeds && <span className="stream-warn">Pocos seeds: puede tardar en arrancar</span>}
        {p.reason && !twin && <span className="stream-warn">{p.reason}</span>}
        {twin && <span className="stream-hidden-reason">{isDebridDownload(twin.stream) ? 'Por TorBox: lo baja y arranca solo' : 'Por TorBox'}</span>}
        {/* Con la app de Windows o Stremio Service se convierte si hace falta (v0.29). */}
        {s.behaviorHints?.notWebReady && p.url && !converts && <span className="stream-warn">Puede no reproducirse en el navegador (formato MKV/HEVC)</span>}
      </>
    )
    const cls = `stream-item sx${recommended ? ' recommended' : ''}`
    const raw = [name, ...lines].filter(Boolean).join('\n') || undefined
    if (p.url)
      return (
        <button key={key} className={cls} title={raw} data-autofocus={recommended || undefined} onClick={() => play(s, p.url!, addon)}>
          {content}
        </button>
      )
    if (twin)
      return (
        <button key={key} className={cls} title={raw} onClick={() => play(twin.stream, twin.stream.url!, twin.addon)}>
          {content}
        </button>
      )
    if (p.external)
      return (
        <a key={key} className={cls} title={raw} data-autofocus={recommended || undefined} href={p.external} target="_blank" rel="noreferrer">
          {content}
        </a>
      )
    return (
      <div key={key} className="stream-item sx disabled" title={raw} tabIndex={-1}>
        {content}
      </div>
    )
  }

  return (
    <div
      className="streams"
      ref={listRef}
      onFocus={(e) => {
        focusedItem.current = e.target.classList.contains('stream-item') ? e.target : null
      }}
      onBlur={(e) => {
        // Sin destino (relatedTarget null) puede ser que React movió el botón: se recuerda igual.
        if (e.relatedTarget) focusedItem.current = null
      }}
    >
      {pending && (
        <div className="auto-play-banner" role="status" aria-live="polite">
          <span>
            Reproduciendo «{streamLabel(pending.pick.stream).name || pending.pick.addon.manifest.name}» de{' '}
            {pending.pick.addon.manifest.name} en {pending.left}…
          </span>
          <div className="auto-play-actions">
            <button ref={cancelRef} className="btn btn-small" onClick={cancelAuto}>
              Elegir otro
            </button>
            <button className="btn btn-small btn-primary" onClick={() => setCountdown((c) => c && { ...c, left: 0 })}>
              Reproducir ya
            </button>
          </div>
        </div>
      )}
      <div className="streams-status muted" aria-live="polite">{statusText}</div>
      {parts.map(({ g, bestIndex, items, usable, torrents }) => {
        const torrentsOpen = openTorrents.has(g.addon.transportUrl)
        const toggleTorrents = () =>
          setOpenTorrents((prev) => {
            const next = new Set(prev)
            if (next.has(g.addon.transportUrl)) next.delete(g.addon.transportUrl)
            else next.add(g.addon.transportUrl)
            return next
          })
        return (
          <section key={g.addon.transportUrl} className="stream-group">
            <h3>
              {g.addon.manifest.name}
              {g.loading && <span className="spinner" aria-label="Cargando" />}
            </h3>
            {g.error && <p className="muted small">{isOnline() ? `No respondió: ${g.error}` : 'Sin conexión: no se pueden buscar fuentes.'}</p>}
            {!g.loading && !g.error && g.streams.length === 0 && <p className="muted small">Sin resultados.</p>}
            {!g.loading && g.streams.length > 0 && items.length === 0 && <p className="muted small">Todos ocultos por tus filtros.</p>}
            {usable.length > 0 && <div className="stream-items">{usable.map(({ s, i }) => renderItem(s, i, g.addon, i === bestIndex))}</div>}
            {torrents.length > 0 && (
              <>
                <button className="stream-hidden-toggle stream-torrents-toggle" aria-expanded={torrentsOpen} onClick={toggleTorrents}>
                  {torrentsOpen ? '▾' : '▸'} {torrents.length === 1 ? '1 torrent sin debrid' : `${torrents.length} torrents sin debrid`}{' '}
                  {isNativeApp() ? '(necesitan el motor de la app)' : '(el navegador no los puede abrir)'}
                </button>
                {torrentsOpen && <div className="stream-items">{torrents.map(({ s, i }) => renderItem(s, i, g.addon, false))}</div>}
              </>
            )}
          </section>
        )
      })}
      {hidden.size > 0 && (
        <section className="stream-group stream-hidden">
          <button className="stream-hidden-toggle" aria-expanded={showHidden} onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? '▾' : '▸'} Ocultos por tus filtros ({hidden.size})
          </button>
          {showHidden && (
            <div className="stream-items">
              {groups.flatMap((g, addonIndex) =>
                g.streams.map((s, i) => {
                  const reason = hidden.get(streamKey(addonIndex, i))
                  return reason ? renderItem(s, i, g.addon, false, reason, `${addonIndex}:${i}`) : null
                }),
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
