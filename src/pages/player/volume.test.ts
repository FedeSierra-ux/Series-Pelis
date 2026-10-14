import { describe, expect, it } from 'vitest'
import { VOLUME_KEY, WHEEL_STEP, clampVolume, readVolume, storeVolume, volumeIcon, wheelVolumeDelta } from './volume'

const memory = () => {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data }
}

describe('volumen', () => {
  it('la rueda hacia arriba sube y hacia abajo baja; los temblores del touchpad no cuentan', () => {
    expect(wheelVolumeDelta(-100)).toBe(WHEEL_STEP)
    expect(wheelVolumeDelta(53)).toBe(-WHEEL_STEP)
    expect(wheelVolumeDelta(2)).toBe(0)
    expect(wheelVolumeDelta(Number.NaN)).toBe(0)
  })

  it('se recuerda en la sesión', () => {
    const s = memory()
    expect(readVolume(s)).toBeUndefined()
    storeVolume({ volume: 0.456, muted: true }, s)
    expect(JSON.parse(s.data.get(VOLUME_KEY)!)).toEqual({ volume: 0.46, muted: true })
    expect(readVolume(s)).toEqual({ volume: 0.46, muted: true })
  })

  it('valores rotos no rompen nada', () => {
    const s = memory()
    s.setItem(VOLUME_KEY, '{nope')
    expect(readVolume(s)).toBeUndefined()
    s.setItem(VOLUME_KEY, JSON.stringify({ volume: 7 }))
    expect(readVolume(s)).toEqual({ volume: 1, muted: false })
    expect(clampVolume(-1)).toBe(0)
  })

  it('ícono según el nivel', () => {
    expect(volumeIcon({ volume: 1, muted: true })).toBe('volumeOff')
    expect(volumeIcon({ volume: 0, muted: false })).toBe('volumeOff')
    expect(volumeIcon({ volume: 0.3, muted: false })).toBe('volumeLow')
    expect(volumeIcon({ volume: 0.8, muted: false })).toBe('volumeHigh')
  })
})
