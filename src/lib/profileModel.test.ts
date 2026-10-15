import { describe, expect, it } from 'vitest'
import {
  cleanProfile,
  DEFAULT_MAIN,
  initialOf,
  isProfileId,
  listProfiles,
  MAIN_PROFILE,
  newProfileId,
  nextColor,
  PROFILE_COLORS,
  profileStorageKey,
  type Profile,
} from './profileModel'

const p = (id: string, at: number, color: string = PROFILE_COLORS[1]): Profile => ({ id, name: id, color, at })

describe('profileModel', () => {
  it('valida ids: main o 6 a 32 letras/números en minúscula', () => {
    expect(isProfileId('main')).toBe(true)
    expect(isProfileId('abc123')).toBe(true)
    expect(isProfileId(newProfileId())).toBe(true)
    expect(isProfileId('abc')).toBe(false)
    expect(isProfileId('ABC123')).toBe(false)
    expect(isProfileId('a:b:cdef')).toBe(false)
    expect(isProfileId(undefined)).toBe(false)
  })

  it('el principal usa las claves de siempre (no hay que migrar)', () => {
    expect(profileStorageKey('progress', MAIN_PROFILE)).toBe('progress')
    expect(profileStorageKey('progress', 'abc123')).toBe('p:abc123:progress')
  })

  it('limpia lo que llega de otro aparato', () => {
    expect(cleanProfile('abc123', { name: '  Ana   María ', color: PROFILE_COLORS[2], at: 5 })).toEqual({ id: 'abc123', name: 'Ana María', color: PROFILE_COLORS[2], at: 5 })
    // Color fuera de la paleta → el primero; arte que no es https → afuera.
    expect(cleanProfile('abc123', { name: 'Ana', color: 'red', art: 'javascript:alert(1)', at: 1 })).toEqual({ id: 'abc123', name: 'Ana', color: PROFILE_COLORS[0], at: 1 })
    expect(cleanProfile('abc123', { name: 'Ana', color: PROFILE_COLORS[0], art: 'https://img/x.jpg', at: 1 })?.art).toBe('https://img/x.jpg')
    expect(cleanProfile('abc123', { name: 'x'.repeat(50), at: 1 })?.name).toHaveLength(20)
    expect(cleanProfile('abc123', { name: '   ' })).toBeUndefined()
    expect(cleanProfile('mal id', { name: 'Ana' })).toBeUndefined()
    expect(cleanProfile('abc123', 'Ana')).toBeUndefined()
  })

  it('lista el principal primero (aunque no esté guardado) y después por creación', () => {
    expect(listProfiles({})).toEqual([DEFAULT_MAIN])
    const list = listProfiles({ zzz999: p('zzz999', 2), aaa111: p('aaa111', 3), bbb222: p('bbb222', 2) })
    expect(list.map((x) => x.id)).toEqual(['main', 'bbb222', 'zzz999', 'aaa111'])
  })

  it('elige un color libre y la inicial', () => {
    expect(nextColor([DEFAULT_MAIN])).toBe(PROFILE_COLORS[1])
    expect(nextColor(PROFILE_COLORS.map((c, i) => p(`id${i}xxxx`, i, c)))).toBe(PROFILE_COLORS[0])
    expect(initialOf(' ñandú')).toBe('Ñ')
    expect(initialOf('')).toBe('?')
  })
})
