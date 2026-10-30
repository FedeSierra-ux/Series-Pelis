import { describe, expect, it } from 'vitest'
import { cleanSettings, SETTINGS_KEYS } from './settingsModel'
import { DEFAULT_SETTINGS } from './store'
import { SCREENSAVER_OPTIONS } from './idle'
import { UI_SCALES } from './tv'

const base = DEFAULT_SETTINGS

describe('cleanSettings (uso-01)', () => {
  it('no deja pasar objetos anidados nulos ni de otro tipo', () => {
    const out = cleanSettings({ sourceRules: null, subtitleStyle: 5, audioLangs: 'es' }, base)
    expect(out.sourceRules).toEqual(base.sourceRules)
    expect(out.subtitleStyle).toEqual(base.subtitleStyle)
    expect(out.audioLangs).toEqual(base.audioLangs)
  })

  it('completa campo por campo adentro de los objetos', () => {
    const out = cleanSettings({ subtitleStyle: { size: 'xl', color: 'verde', position: 'x', outline: 1 }, sourceRules: { mode: 'auto', maxSizeGB: -3, hdr: 7 } }, base)
    expect(out.subtitleStyle).toEqual({ ...base.subtitleStyle, size: 'xl' })
    expect(out.sourceRules).toEqual({ ...base.sourceRules, mode: 'auto' })
  })

  it('descarta valores fuera de la lista y tipos equivocados, sin tocar el resto', () => {
    const out = cleanSettings(
      { skipSegments: 'siempre', tvMode: true, screensaverMinutes: 7, uiScale: 'grande', stillWatchingAfter: NaN, externalPlayer: 'zzz', posterRating: 'off', autoplayNext: 'sí' },
      base,
    )
    expect(out.skipSegments).toBe(base.skipSegments)
    expect(out.tvMode).toBe(base.tvMode)
    expect(out.screensaverMinutes).toBe(base.screensaverMinutes)
    expect(out.uiScale).toBe(100)
    expect(out.stillWatchingAfter).toBe(3)
    expect(out.externalPlayer).toBe('system')
    expect(out.autoplayNext).toBe(true)
    expect(out.posterRating).toBe('off')
  })

  it('filtra las listas: deja lo válido y saca lo demás', () => {
    const out = cleanSettings({ subtitleLangs: ['spa', 3, null, 'eng'], sourceRules: { excludeCodecs: ['hevc', 'x264', 5], preferKeywords: ['latino', {}] } }, base)
    expect(out.subtitleLangs).toEqual(['spa', 'eng'])
    expect(out.sourceRules.excludeCodecs).toEqual(['hevc'])
    expect(out.sourceRules.preferKeywords).toEqual(['latino'])
  })

  it('acepta una copia buena y ignora claves desconocidas', () => {
    const good = { ...base, autoplayNext: false, subtitleStyle: { ...base.subtitleStyle, size: 'l' as const, position: 20 as const }, desconocida: 1 }
    const out = cleanSettings(good, base)
    expect(out.autoplayNext).toBe(false)
    expect(out.subtitleStyle.position).toBe(20)
    expect(out).not.toHaveProperty('desconocida')
  })

  it('una copia vieja con pocos campos conserva lo de la base', () => {
    const cur = { ...base, spoilerFree: false }
    expect(cleanSettings({ autoplayNext: false }, cur)).toEqual({ ...cur, autoplayNext: false })
  })

  it('algo que no es un objeto no cambia nada', () => {
    for (const raw of [null, undefined, 5, 'x', [1]]) expect(cleanSettings(raw, base)).toBe(base)
  })

  it('el valor de fábrica pasa tal cual y no falta ningún campo', () => {
    expect(cleanSettings(base, base)).toEqual(base)
    expect([...SETTINGS_KEYS].sort()).toEqual(Object.keys(base).sort())
  })

  it('acepta todas las opciones que ofrece Ajustes', () => {
    for (const m of SCREENSAVER_OPTIONS) expect(cleanSettings({ screensaverMinutes: m }, base).screensaverMinutes).toBe(m)
    for (const u of UI_SCALES) expect(cleanSettings({ uiScale: u }, base).uiScale).toBe(u)
  })
})
