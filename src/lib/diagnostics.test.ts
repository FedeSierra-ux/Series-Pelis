import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from './cache'
import {
  buildReport,
  flushQueue,
  hostOf,
  installId,
  MAX_REPORT_BYTES,
  probeReportServer,
  queuedCount,
  reportGlobalError,
  reportsEnabled,
  scrubUrls,
  sendReport,
} from './diagnostics'
import { settingsStore } from './store'

const MANIFEST = 'https://torrentio.strem.fun/realdebrid=APIKEY123/manifest.json'
const STREAM = 'https://cdn.debrid.example/dl/SECRETTOKEN/pelicula.mkv'

function fakeStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    data,
  }
}

const statusOk = (enabled: boolean) =>
  new Response(JSON.stringify({ enabled }), { status: 200, headers: { 'Content-Type': 'application/json' } })

let storage: ReturnType<typeof fakeStorage>

beforeEach(() => {
  storage = fakeStorage()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('navigator', { onLine: true, userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7285)' })
  vi.stubGlobal('location', { pathname: '/watch/movie/tt0133093', search: '?stream=' + encodeURIComponent(STREAM) })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Deja el módulo en "el sitio acepta informes" (la marca viene de _status). */
async function enable(value = true) {
  vi.stubGlobal('fetch', async () => statusOk(value))
  await probeReportServer()
}

describe('sanitización', () => {
  it('reduce manifests y streams al host', () => {
    expect(hostOf(MANIFEST)).toBe('torrentio.strem.fun')
    expect(hostOf(STREAM)).toBe('cdn.debrid.example')
    expect(hostOf('http://127.0.0.1:11470/manifest.json')).toBe('127.0.0.1:11470')
    expect(hostOf('v3-cinemeta.strem.io')).toBe('v3-cinemeta.strem.io')
    expect(hostOf('')).toBe('')
    expect(hostOf('esto no es una url')).toBe('')
  })

  it('reemplaza las URLs dentro de un texto', () => {
    expect(scrubUrls(`HTTP 503 en ${MANIFEST}`)).toBe('HTTP 503 en torrentio.strem.fun')
    expect(scrubUrls('sin urls')).toBe('sin urls')
  })

  it('buildReport no deja keys ni URLs completas en ningún lado', () => {
    const report = buildReport('player', new HttpError(503, MANIFEST), {
      addons: [MANIFEST, MANIFEST, 'https://v3-cinemeta.strem.io/manifest.json'],
      stream: { url: STREAM, type: 'mkv' },
      comment: `Se corta. Fuente: ${STREAM}`,
      context: { addon: 'Torrentio', fuente: STREAM, vacio: '' },
    })
    expect(report.addons).toEqual(['torrentio.strem.fun', 'v3-cinemeta.strem.io'])
    expect(report.stream).toEqual({ host: 'cdn.debrid.example', type: 'mkv' })
    expect(report.route).toBe('/watch/movie/tt0133093')
    expect(report.message).toMatch(/problema ahora/)
    expect(report.context).toEqual({ addon: 'Torrentio', fuente: 'cdn.debrid.example' })
    expect(report.platform.os).toBe('android')
    expect(report.platform.tv).toBe(true)
    expect(report.kind).toBe('player')
    const json = JSON.stringify(report)
    expect(json).not.toMatch(/APIKEY123|SECRETTOKEN|manifest\.json|\.mkv/)
    expect(json).not.toContain('https://')
  })

  it('respeta el tope de 16 kB recortando el stack primero', () => {
    const err = new Error('x'.repeat(5000))
    err.stack = 'Error\n' + '    at algo (https://sitio.example/assets/index.js:1:1)\n'.repeat(2000)
    const report = buildReport('app', err, { comment: 'c'.repeat(5000), context: { a: 'z'.repeat(5000) } })
    expect(new TextEncoder().encode(JSON.stringify(report)).length).toBeLessThanOrEqual(MAX_REPORT_BYTES)
    expect(report.comment!.length).toBeLessThanOrEqual(500)
    expect(report.message.length).toBeLessThanOrEqual(1000)
  })

  it('el id de instalación se genera una vez y se guarda', () => {
    const a = installId()
    expect(a).toMatch(/^[a-z0-9-]{8,64}$/)
    expect(installId()).toBe(a)
    expect(storage.getItem('sp-install-id')).toBe(a)
  })
})

describe('envío y cola sin conexión', () => {
  it('sin la marca del sitio no manda nada', async () => {
    await enable(false)
    expect(reportsEnabled()).toBe(false)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await sendReport('manual', undefined)).toBe('disabled')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('manda el informe al sitio con el JSON sanitizado', async () => {
    await enable()
    let body = ''
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      body = String(init.body)
      return new Response('{"ok":true}', { status: 200 })
    })
    expect(await sendReport('addon', new Error('no responde'), { addons: [MANIFEST] })).toBe('sent')
    expect(JSON.parse(body).addons).toEqual(['torrentio.strem.fun'])
    expect(body).not.toContain('APIKEY123')
    expect(queuedCount()).toBe(0)
  })

  it('sin conexión lo deja en cola y lo manda al volver', async () => {
    await enable()
    vi.stubGlobal('navigator', { onLine: false, userAgent: 'x' })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await sendReport('player', new Error('se cortó'))).toBe('queued')
    expect(await sendReport('player', new Error('otra vez'))).toBe('queued')
    expect(queuedCount()).toBe(2)
    expect(fetchSpy).not.toHaveBeenCalled()

    vi.stubGlobal('navigator', { onLine: true, userAgent: 'x' })
    const sent: string[] = []
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      sent.push((JSON.parse(String(init.body)) as { message: string }).message)
      return new Response('{"ok":true}', { status: 200 })
    })
    await flushQueue()
    // Sin conexión el texto en español dice eso; el mensaje original va entre corchetes.
    expect(sent).toHaveLength(2)
    expect(sent[0]).toMatch(/se cortó/)
    expect(sent[1]).toMatch(/otra vez/)
    expect(queuedCount()).toBe(0)
    expect(storage.getItem('sp-report-queue')).toBeNull()
  })

  it('si la red falla con conexión, queda en cola; si el sitio dice 503, se apaga', async () => {
    await enable()
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await sendReport('app', new Error('boom'))).toBe('queued')
    expect(queuedCount()).toBe(1)
    storage.removeItem('sp-report-queue')

    vi.stubGlobal('fetch', async () => new Response('{"ok":false,"reason":"disabled"}', { status: 503 }))
    expect(await sendReport('app', new Error('boom'))).toBe('disabled')
    expect(reportsEnabled()).toBe(false)
    expect(queuedCount()).toBe(0)
  })

  it('los errores globales van una sola vez por mensaje y solo con el ajuste activo', async () => {
    await enable()
    const fetchSpy = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)
    reportGlobalError(new Error('global 1'))
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.spyOn(settingsStore, 'get').mockReturnValue({ ...settingsStore.get(), sendReports: true })
    reportGlobalError(new Error('global 1'))
    reportGlobalError(new Error('global 1'))
    reportGlobalError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Player.js'))
    reportGlobalError('Script error.')
    reportGlobalError(new Error('global 2'))
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
