// @ts-check
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { desktopUserAgent, engineOrigins, externalAction, originCheck, SITE_URL, startUrl } from './origins.js'
import { findPlayer, parsePlayerLink, playerArgs, playerCandidates } from './players.js'
import { updateErrorText } from './update-errors.js'

test('startUrl: FLIX_URL solo si es http/https', () => {
  assert.equal(startUrl(undefined), SITE_URL)
  assert.equal(startUrl(''), SITE_URL)
  assert.equal(startUrl('http://localhost:5173'), 'http://localhost:5173/')
  assert.equal(startUrl('file:///C:/x.html'), SITE_URL)
  assert.equal(startUrl('javascript:alert(1)'), SITE_URL)
  assert.equal(startUrl('no es una url'), SITE_URL)
})

test('originCheck: sitio, previews y FLIX_URL', () => {
  const ok = originCheck(SITE_URL)
  assert.ok(ok('https://series-pelis.pages.dev/detail/movie/tt1'))
  assert.ok(ok('https://abc123.series-pelis.pages.dev/'))
  assert.ok(ok('https://ccr-rama.series-pelis.pages.dev/x'))
  assert.ok(!ok('http://series-pelis.pages.dev/'))
  assert.ok(!ok('https://series-pelis.pages.dev.evil.com/'))
  assert.ok(!ok('https://evil.com/?https://series-pelis.pages.dev'))
  assert.ok(!ok('https://a.b.series-pelis.pages.dev/'))
  assert.ok(!ok('http://localhost:5173/'))
  assert.ok(!ok('file:///C:/offline.html'))
  assert.ok(!ok(undefined))
  assert.ok(!ok('about:blank'))
  const dev = originCheck('http://localhost:5173/')
  assert.ok(dev('http://localhost:5173/settings'))
  assert.ok(dev('https://series-pelis.pages.dev/'))
  assert.ok(!dev('http://localhost:5174/'))
})

test('engineOrigins: sin repetidos', () => {
  assert.deepEqual(engineOrigins(SITE_URL), ['https://series-pelis.pages.dev', 'https://*.series-pelis.pages.dev'])
  assert.deepEqual(engineOrigins('http://localhost:5173/'), [
    'https://series-pelis.pages.dev',
    'https://*.series-pelis.pages.dev',
    'http://localhost:5173',
  ])
})

test('externalAction: solo http/https van al navegador', () => {
  assert.equal(externalAction('https://www.imdb.com/title/tt1'), 'external')
  assert.equal(externalAction('http://example.com'), 'external')
  assert.equal(externalAction('intent://x#Intent;end'), 'deny')
  assert.equal(externalAction('vlc://https://x'), 'deny')
  assert.equal(externalAction('file:///C:/Windows'), 'deny')
  assert.equal(externalAction('javascript:alert(1)'), 'deny')
})

test('desktopUserAgent: sin Electron ni el nombre de la app, con FlixPC', () => {
  const base =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) flix-desktop/0.30.0 Chrome/146.0.0.0 Electron/44.6.0 Safari/537.36'
  const ua = desktopUserAgent(base, ['flix-desktop', 'Flix'], '0.30.0')
  assert.equal(
    ua,
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 FlixPC/0.30.0',
  )
  assert.ok(!ua.includes('FlixApp/'))
  assert.ok(!desktopUserAgent(base.replace('flix-desktop', 'Flix') + ' FlixApp/1', ['Flix'], '1').includes('FlixApp/'))
})

test('updateErrorText: frases cortas en español', () => {
  const coded = (/** @type {string} */ code, msg = 'x') => Object.assign(new Error(msg), { code })
  assert.equal(
    updateErrorText(coded('ERR_UPDATER_CHANNEL_FILE_NOT_FOUND', 'Cannot find latest.yml (https://…): HttpError: 404')),
    'Todavía no hay una versión publicada para la PC.',
  )
  assert.equal(updateErrorText(new Error('net::ERR_INTERNET_DISCONNECTED')), 'Sin conexión con GitHub. Probá de nuevo más tarde.')
  assert.equal(updateErrorText(coded('ENOTFOUND')), 'Sin conexión con GitHub. Probá de nuevo más tarde.')
  assert.equal(updateErrorText(coded('ERR_CHECKSUM_MISMATCH')), 'La descarga no coincide con la publicada. Probá de nuevo.')
  assert.equal(updateErrorText(coded('ENOSPC')), 'No hay lugar en el disco para bajar la actualización.')
  assert.equal(updateErrorText(coded('EPERM')), 'Windows no dejó guardar la actualización.')
  assert.equal(updateErrorText(Object.assign(new Error('x'), { statusCode: 503 })), 'GitHub no responde. Probá de nuevo más tarde.')
  assert.equal(updateErrorText(new Error('HttpError: 403 Forbidden')), 'GitHub está limitando los pedidos. Probá de nuevo más tarde.')
  assert.equal(updateErrorText(undefined), 'No se pudo actualizar la app.')
  assert.equal(updateErrorText('algo'), 'No se pudo actualizar la app.')
})

test('offline.html: la CSP tiene el sha256 del script', () => {
  const html = readFileSync(new URL('./offline.html', import.meta.url), 'utf8')
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''
  const hash = createHash('sha256').update(script).digest('base64')
  assert.ok(html.includes(`'sha256-${hash}'`), `falta 'sha256-${hash}' en la CSP`)
})

test('parsePlayerLink: solo vlc/mpv/potplayer con un video http/https', () => {
  assert.deepEqual(parsePlayerLink('vlc://https://x.example/a.mkv'), { player: 'vlc', url: 'https://x.example/a.mkv' })
  assert.deepEqual(parsePlayerLink('MPV://http://127.0.0.1:5000/abc/def/0'), { player: 'mpv', url: 'http://127.0.0.1:5000/abc/def/0' })
  assert.deepEqual(parsePlayerLink('potplayer://https://x.example/v.m3u8'), { player: 'potplayer', url: 'https://x.example/v.m3u8' })
  assert.equal(parsePlayerLink('vlc://file:///C:/Windows/x'), undefined)
  assert.equal(parsePlayerLink('vlc://--extraintf=lua'), undefined)
  assert.equal(parsePlayerLink('vlc://https://x.example/a b'), undefined)
  assert.equal(parsePlayerLink('vlc://https://x.example/"a'), undefined)
  assert.equal(parsePlayerLink('iina://weblink?url=https%3A%2F%2Fx'), undefined)
  assert.equal(parsePlayerLink('https://x.example/a.mkv'), undefined)
  assert.equal(parsePlayerLink(42), undefined)
})

test('playerCandidates / findPlayer: carpetas de siempre y después el PATH', () => {
  const env = {
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local',
    USERPROFILE: 'C:\\Users\\a',
    PATH: 'C:\\Windows;"D:\\Tools\\mpv";relativa',
  }
  assert.deepEqual(playerCandidates('vlc', env).slice(0, 2), [
    'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
    'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
  ])
  assert.ok(playerCandidates('potplayer', env).includes('C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe'))
  assert.ok(!playerCandidates('mpv', env).some((p) => p.startsWith('relativa')))
  assert.equal(findPlayer('mpv', env, (p) => p === 'D:\\Tools\\mpv\\mpv.exe'), 'D:\\Tools\\mpv\\mpv.exe')
  assert.equal(findPlayer('vlc', env, () => false), undefined)
  assert.deepEqual(playerArgs('mpv', 'https://x'), ['--', 'https://x'])
  assert.deepEqual(playerArgs('vlc', 'https://x'), ['https://x'])
})
