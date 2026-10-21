import { afterEach, describe, expect, it, vi } from 'vitest'
import { desktopEngineBase, desktopTorrentBase, isDesktopApp } from './desktop'

describe('desktop', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('solo un motor en 127.0.0.1 con token', () => {
    const base = 'http://127.0.0.1:52311/0123456789abcdef0123456789abcdef'
    expect(desktopEngineBase(`${base}/`)).toBe(base)
    expect(desktopEngineBase('http://127.0.0.1:52311')).toBeUndefined()
    expect(desktopEngineBase('http://localhost:52311/0123456789abcdef0123456789abcdef')).toBeUndefined()
    expect(desktopEngineBase('https://evil.example/0123456789abcdef0123456789abcdef')).toBeUndefined()
    expect(desktopEngineBase('http://127.0.0.1.evil.example:1/0123456789abcdef0123456789abcdef')).toBeUndefined()
    expect(desktopEngineBase(42)).toBeUndefined()
  })

  it('lee window.flixDesktop', () => {
    vi.stubGlobal('window', {})
    expect(isDesktopApp()).toBe(false)
    expect(desktopTorrentBase()).toBeUndefined()
    vi.stubGlobal('window', { flixDesktop: { version: '0.30.0', torrent: 'http://127.0.0.1:4000/0123456789abcdef0123456789abcdef' } })
    expect(isDesktopApp()).toBe(true)
    expect(desktopTorrentBase()).toBe('http://127.0.0.1:4000/0123456789abcdef0123456789abcdef')
  })
})
