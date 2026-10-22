import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEBRID_FIRST_POLL_MS,
  DEBRID_POLL_MS,
  DEBRID_PROBE_TIMEOUT_MS,
  DEBRID_WAIT_MAX_MS,
  UNREADABLE_TO_PLAY,
  debridTwinOf,
  formatElapsed,
  nextWaitStep,
  pollDelay,
  probeDebridLink,
  probeVerdict,
  startWait,
  type ProbeResult,
  type ProbeVideo,
  type WaitState,
} from './debridWait'
import type { AddonStreams, InstalledAddon, Stream } from './types'

const HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const link = (idx: string, hash = HASH) => `https://torrentio.strem.fun/resolve/torbox/K/${hash}/x.mkv/${idx}/x.mkv`
const addon = (name: string): InstalledAddon => ({
  transportUrl: `https://${name}.example/manifest.json`,
  manifest: { id: name, version: '1', name, resources: ['stream'], types: ['movie'], catalogs: [] },
})
const group = (a: InstalledAddon, streams: Stream[]): AddonStreams => ({ addon: a, streams, loading: false })

describe('probeVerdict', () => {
  it('30 s es el aviso de Torrentio; más largo, el video', () => {
    expect(probeVerdict({ kind: 'duration', duration: 30 })).toBe('status')
    expect(probeVerdict({ kind: 'duration', duration: 2700 })).toBe('ready')
    // Sin largo en la cabecera tampoco es el aviso (el aviso siempre lo trae).
    expect(probeVerdict({ kind: 'duration', duration: Infinity })).toBe('ready')
    expect(probeVerdict({ kind: 'duration', duration: 0 })).toBe('unknown')
    expect(probeVerdict({ kind: 'timeout' })).toBe('unknown')
    expect(probeVerdict({ kind: 'unreadable' })).toBe('unknown')
  })
})

describe('nextWaitStep', () => {
  const T0 = 1_000_000
  const run = (results: ProbeResult[], gap = DEBRID_POLL_MS) => {
    let state: WaitState = startWait(T0)
    let now = T0
    const steps = results.map((r) => {
      now += gap
      const out = nextWaitStep(state, r, now)
      state = out.state
      return out.step
    })
    return { steps, state }
  }

  it('el primer vistazo va enseguida y después cada tanto', () => {
    expect(pollDelay(0)).toBe(DEBRID_FIRST_POLL_MS)
    expect(pollDelay(1)).toBe(DEBRID_POLL_MS)
    expect(DEBRID_FIRST_POLL_MS).toBeLessThan(DEBRID_POLL_MS)
    const { steps } = run([{ kind: 'duration', duration: 30 }])
    expect(steps[0]).toEqual({ action: 'wait', delay: DEBRID_POLL_MS })
  })

  it('mientras da el aviso espera; cuando da el video, a reproducir', () => {
    const { steps } = run([{ kind: 'duration', duration: 30 }, { kind: 'timeout' }, { kind: 'duration', duration: 5400 }])
    expect(steps.map((s) => s.action)).toEqual(['wait', 'wait', 'play'])
  })

  it('un archivo que el navegador no puede leer dos veces seguidas cuenta como listo', () => {
    expect(UNREADABLE_TO_PLAY).toBe(2)
    expect(run([{ kind: 'unreadable' }, { kind: 'unreadable' }]).steps.map((s) => s.action)).toEqual(['wait', 'play'])
    // Con el aviso en el medio vuelve a contar desde cero; sin conexión no cuenta ni corta la cuenta.
    expect(run([{ kind: 'unreadable' }, { kind: 'duration', duration: 30 }, { kind: 'unreadable' }]).steps.map((s) => s.action)).toEqual(['wait', 'wait', 'wait'])
    expect(run([{ kind: 'unreadable' }, { kind: 'offline' }, { kind: 'unreadable' }]).steps.map((s) => s.action)).toEqual(['wait', 'wait', 'play'])
  })

  it('pasado el tope se rinde (nunca espera más de la cuenta)', () => {
    const rounds = Math.ceil(DEBRID_WAIT_MAX_MS / DEBRID_POLL_MS) + 2
    const { steps, state } = run(Array.from({ length: rounds }, () => ({ kind: 'duration', duration: 30 }) as ProbeResult))
    const gaveUp = steps.findIndex((s) => s.action === 'give-up')
    expect(gaveUp).toBeGreaterThan(0)
    expect(steps.slice(0, gaveUp).every((s) => s.action === 'wait')).toBe(true)
    // El último vistazo programado no pasa del tope.
    expect((gaveUp + 1) * DEBRID_POLL_MS).toBeGreaterThan(DEBRID_WAIT_MAX_MS - DEBRID_POLL_MS)
    expect(state.probes).toBe(rounds)
  })

  it('aunque esté por rendirse, si ya está listo reproduce', () => {
    const late = nextWaitStep(startWait(0), { kind: 'duration', duration: 3000 }, DEBRID_WAIT_MAX_MS + 1)
    expect(late.step).toEqual({ action: 'play' })
  })
})

describe('formatElapsed', () => {
  it('minutos y segundos; con horas, también', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(65_400)).toBe('1:05')
    expect(formatElapsed(3_723_000)).toBe('1:02:03')
    expect(formatElapsed(-5)).toBe('0:00')
  })
})

describe('probeDebridLink', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** Un <video> de mentira: dispara lo que se le diga al poner `src`. */
  function fakeVideo(onSrc: (v: ProbeVideo & EventTarget & { fire: (type: string) => void }) => void) {
    const t = new EventTarget() as ProbeVideo & EventTarget & { fire: (type: string) => void; released: boolean }
    let src = ''
    Object.assign(t, {
      duration: NaN,
      readyState: 0,
      error: null,
      muted: false,
      preload: 'auto',
      playsInline: false,
      released: false,
      pause: () => {},
      play: async () => {},
      load: () => {},
      removeAttribute: (name: string) => {
        if (name === 'src') {
          src = ''
          t.released = true
        }
      },
      fire: (type: string) => t.dispatchEvent(new Event(type)),
    })
    Object.defineProperty(t, 'src', {
      get: () => src,
      set: (value: string) => {
        src = value
        queueMicrotask(() => onSrc(t))
      },
    })
    return t
  }

  it('lee el largo del video y lo suelta (mudo, solo metadatos)', async () => {
    const v = fakeVideo((el) => {
      ;(el as { duration: number }).duration = 30
      el.fire('loadedmetadata')
    })
    expect(await probeDebridLink(link('0'), { make: () => v, online: () => true })).toEqual({ kind: 'duration', duration: 30 })
    expect(v.muted).toBe(true)
    expect(v.preload).toBe('metadata')
    expect((v as unknown as { released: boolean }).released).toBe(true)
  })

  it('un error del video es "no se pudo leer" (o "sin conexión" si no hay red)', async () => {
    const failing = () => fakeVideo((el) => el.fire('error'))
    expect(await probeDebridLink(link('0'), { make: failing, online: () => true })).toEqual({ kind: 'unreadable' })
    let online = true
    const v = fakeVideo((el) => {
      online = false
      el.fire('error')
    })
    expect(await probeDebridLink(link('0'), { make: () => v, online: () => online })).toEqual({ kind: 'offline' })
  })

  it('sin respuesta a tiempo, o al cancelarlo, no dice nada', async () => {
    vi.useFakeTimers()
    const silent = fakeVideo(() => {})
    const pending = probeDebridLink(link('0'), { make: () => silent, online: () => true })
    await vi.advanceTimersByTimeAsync(DEBRID_PROBE_TIMEOUT_MS)
    expect(await pending).toEqual({ kind: 'timeout' })
    const ctrl = new AbortController()
    const cut = probeDebridLink(link('0'), { make: () => fakeVideo(() => {}), online: () => true, signal: ctrl.signal })
    ctrl.abort()
    expect(await cut).toEqual({ kind: 'timeout' })
  })

  it('sin conexión ni siquiera abre el link', async () => {
    const make = vi.fn()
    expect(await probeDebridLink(link('0'), { make, online: () => false })).toEqual({ kind: 'offline' })
    expect(make).not.toHaveBeenCalled()
  })
})

describe('debridTwinOf', () => {
  const TB = addon('torrentio-tb')
  const OTHER = addon('otro')
  const torrent: Stream = { name: 'Otro\n1080p', infoHash: HASH.toUpperCase(), fileIdx: 2 }

  it('encuentra el link de TorBox del mismo hash y archivo', () => {
    const cached = { name: '[TB+] Torrentio\n1080p', url: link('2') }
    const twin = debridTwinOf(torrent, [group(OTHER, [torrent]), group(TB, [{ name: '[TB+] Torrentio', url: link('5') }, cached])])
    expect(twin?.stream).toBe(cached)
    expect(twin?.addon).toBe(TB)
  })

  it('otro archivo del mismo torrent u otro hash no sirven', () => {
    expect(debridTwinOf(torrent, [group(TB, [{ name: '[TB+] Torrentio', url: link('5') }])])).toBeUndefined()
    expect(debridTwinOf(torrent, [group(TB, [{ name: '[TB+] Torrentio', url: link('2', 'f'.repeat(40)) }])])).toBeUndefined()
    // Un link cualquiera (no de Torrentio) tampoco.
    expect(debridTwinOf(torrent, [group(TB, [{ name: 'Directo', url: 'https://cdn.example/x.mkv' }])])).toBeUndefined()
  })

  it('si uno de los dos no sabe el índice alcanza el hash; con el índice exacto, gana ese', () => {
    const loose = { name: '[TB+] Torrentio', url: link('undefined') }
    expect(debridTwinOf(torrent, [group(TB, [loose])])?.stream).toBe(loose)
    expect(debridTwinOf({ infoHash: HASH }, [group(TB, [{ name: '[TB+] Torrentio', url: link('7') }])])?.stream.url).toBe(link('7'))
    const exact = { name: '[TB download] Torrentio', url: link('2') }
    expect(debridTwinOf(torrent, [group(TB, [loose, exact])])?.stream).toBe(exact)
  })

  it('entre iguales, lo que TorBox ya tiene antes que lo que tiene que bajar', () => {
    const download = { name: '[TB download] Torrentio\n1080p', url: link('2') }
    const cached = { name: '[TB+] Torrentio\n1080p', url: link('2') }
    expect(debridTwinOf(torrent, [group(TB, [download, cached])])?.stream).toBe(cached)
    expect(debridTwinOf(torrent, [group(TB, [download])])?.stream).toBe(download)
  })

  it('solo para torrents sin url; un grupo roto no molesta', () => {
    expect(debridTwinOf({ ...torrent, url: 'https://x.example/a.mkv' }, [group(TB, [{ name: '[TB+]', url: link('2') }])])).toBeUndefined()
    expect(debridTwinOf({ name: 'Nada' }, [group(TB, [{ name: '[TB+]', url: link('2') }])])).toBeUndefined()
    const broken = { addon: TB, streams: null as unknown as Stream[], loading: false }
    expect(debridTwinOf(torrent, [broken, group(TB, [{ name: '[TB+]', url: link('2') }])])?.stream.url).toBe(link('2'))
  })
})
