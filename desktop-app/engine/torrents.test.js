// @ts-check
// v0.31.1: si webtorrent destruye su cliente (falla la DHT o el puerto TCP), el motor arma otro en vez de quedar
// muerto hasta cerrar la app, y la pantalla de carga se entera por `engineError`.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { Torrents } from './torrents.js'

const HASH = 'c'.repeat(40)

test('cliente caído: stats lo avisa y el próximo pedido arma uno nuevo', async () => {
  const cacheDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'flix-torrents-'))
  /** @type {string[]} */
  const logs = []
  const torrents = new Torrents({ cacheDir, log: (m) => logs.push(m), dht: false })
  try {
    // Abre el torrent sin esperar la metadata (no hay nadie que lo comparta).
    torrents.open(HASH).catch(() => {})
    await new Promise((res) => setTimeout(res, 200))
    const first = torrents.client
    assert.ok(first)
    assert.equal(torrents.stats(HASH)?.engineError, null)

    // Lo que hace webtorrent cuando falla el puerto: emite el error y se destruye entero.
    first.emit('error', new Error('listen EACCES'))
    await new Promise((res) => first.destroy(() => res(undefined)))
    assert.equal(torrents.stats(HASH)?.engineError, 'listen EACCES')

    torrents.open(HASH).catch(() => {})
    await new Promise((res) => setTimeout(res, 200))
    assert.ok(torrents.client && torrents.client !== first, 'no armó un cliente nuevo')
    assert.equal(torrents.client.destroyed, false)
    assert.equal(torrents.stats(HASH)?.engineError, null)
    assert.ok(logs.some((m) => /se arma de nuevo/.test(m)))
  } finally {
    await torrents.close?.()
    await fs.promises.rm(cacheDir, { recursive: true, force: true })
  }
})
