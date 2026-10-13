import { describe, expect, it } from 'vitest'
import { CHORD_TIMEOUT_MS, GOTO_TARGETS, SHORTCUT_GROUPS, createChordMatcher, isTypingTarget } from './shortcuts'

describe('SHORTCUT_GROUPS', () => {
  it('tiene los tres grupos', () => {
    expect(SHORTCUT_GROUPS.map((g) => g.id)).toEqual(['global', 'player', 'remote'])
    for (const g of SHORTCUT_GROUPS) expect(g.shortcuts.length).toBeGreaterThan(0)
  })

  it('no repite teclas dentro de un grupo', () => {
    for (const g of SHORTCUT_GROUPS) {
      const keys = g.shortcuts.flatMap((s) => s.keys)
      expect(new Set(keys).size, `grupo ${g.id}`).toBe(keys.length)
    }
  })

  it('cada entrada tiene teclas y descripción', () => {
    for (const g of SHORTCUT_GROUPS) {
      for (const s of g.shortcuts) {
        expect(s.keys.length).toBeGreaterThan(0)
        for (const k of s.keys) expect(k.trim().length).toBeGreaterThan(0)
        expect(s.description.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('la ayuda lista todos los destinos de "G + letra"', () => {
    const global = SHORTCUT_GROUPS.find((g) => g.id === 'global')!
    for (const letter of Object.keys(GOTO_TARGETS)) {
      expect(global.shortcuts.some((s) => s.keys.includes(`G ${letter.toUpperCase()}`))).toBe(true)
    }
  })
})

describe('createChordMatcher', () => {
  const make = () => createChordMatcher({ leader: 'g', targets: GOTO_TARGETS })

  it('G y después H dentro del tiempo navega a Inicio', () => {
    const m = make()
    expect(m.feed('g', 1000)).toEqual({ type: 'pending' })
    expect(m.isPending(1500)).toBe(true)
    expect(m.feed('h', 1000 + CHORD_TIMEOUT_MS)).toEqual({ type: 'match', value: GOTO_TARGETS.h })
    expect(m.isPending(2600)).toBe(false)
  })

  it('la segunda tecla tarde no cuenta', () => {
    const m = make()
    m.feed('g', 1000)
    expect(m.feed('h', 1000 + CHORD_TIMEOUT_MS + 1)).toEqual({ type: 'none' })
    // Y tampoco quedó armado para la siguiente.
    expect(m.feed('h', 2600)).toEqual({ type: 'none' })
  })

  it('una letra sola no hace nada', () => {
    const m = make()
    expect(m.feed('h', 1000)).toEqual({ type: 'none' })
    expect(m.feed('a', 1001)).toEqual({ type: 'none' })
  })

  it('una tecla que no es destino cancela la espera', () => {
    const m = make()
    m.feed('g', 1000)
    expect(m.feed('x', 1100)).toEqual({ type: 'none' })
    expect(m.feed('h', 1200)).toEqual({ type: 'none' })
  })

  it('apretar G de nuevo reinicia la espera y no distingue mayúsculas', () => {
    const m = make()
    m.feed('G', 1000)
    expect(m.feed('G', 2400)).toEqual({ type: 'pending' })
    expect(m.feed('D', 3800)).toEqual({ type: 'match', value: GOTO_TARGETS.d })
  })

  it('reset() olvida la primera tecla', () => {
    const m = make()
    m.feed('g', 1000)
    m.reset()
    expect(m.feed('h', 1100)).toEqual({ type: 'none' })
  })
})

describe('isTypingTarget', () => {
  const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, ...extra }) as unknown as Element
  it('campos de texto, textarea, select y contenteditable', () => {
    expect(isTypingTarget(el('INPUT', { type: 'text' }))).toBe(true)
    expect(isTypingTarget(el('INPUT', { type: 'search' }))).toBe(true)
    expect(isTypingTarget(el('TEXTAREA'))).toBe(true)
    expect(isTypingTarget(el('SELECT'))).toBe(true)
    expect(isTypingTarget(el('DIV', { isContentEditable: true }))).toBe(true)
  })
  it('botones, checkboxes y el resto no', () => {
    expect(isTypingTarget(el('INPUT', { type: 'checkbox' }))).toBe(false)
    expect(isTypingTarget(el('INPUT', { type: 'range' }))).toBe(false)
    expect(isTypingTarget(el('BUTTON'))).toBe(false)
    expect(isTypingTarget(el('A', { isContentEditable: false }))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
