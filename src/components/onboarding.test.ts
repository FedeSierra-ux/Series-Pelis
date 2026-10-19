import { describe, expect, it } from 'vitest'
import type { AuthState } from '../lib/auth'
import type { SyncStatus } from '../lib/cloudSync'
import { houseChoseLangs, houseSynced, houseSyncFailed, houseWaitNow, onboardingSkip } from './Onboarding'

const house = { id: 'h1', name: 'Casa', isAdmin: false } as unknown as Extract<AuthState, { status: 'in' }>['house']
const device = { id: 'd1', name: 'TV' } as unknown as Extract<AuthState, { status: 'in' }>['device']
const inHouse = (offline?: boolean): AuthState => ({ status: 'in', house, device, ...(offline ? { offline } : {}) })
const sync = (patch: Partial<SyncStatus> = {}): SyncStatus => ({ phase: 'off', pending: 0, ...patch })

describe('houseSynced (el asistente espera la primera sincronización)', () => {
  it('sin casas (local, sin la base) no espera nada', () => {
    expect(houseSynced({ status: 'disabled' }, sync())).toBe(true)
  })

  it('con casa espera hasta que termina la primera vuelta', () => {
    expect(houseSynced(inHouse(), sync())).toBe(false)
    expect(houseSynced(inHouse(), sync({ phase: 'syncing' }))).toBe(false)
    expect(houseSynced(inHouse(), sync({ phase: 'ok', lastSync: 1 }))).toBe(true)
  })

  it('con la sesión guardada (offline hasta que responde /me) también espera', () => {
    expect(houseSynced(inHouse(true), sync())).toBe(false)
    expect(houseSynced(inHouse(true), sync({ phase: 'ok', lastSync: 1 }))).toBe(true)
  })

  it('un error no cuenta como sincronizada', () => {
    expect(houseSynced(inHouse(true), sync({ phase: 'error', error: 'x' }))).toBe(false)
    expect(houseSynced(inHouse(), sync({ phase: 'error', error: 'x' }))).toBe(false)
  })

  it('un error después de una vuelta buena sigue contando como sincronizada', () => {
    expect(houseSynced(inHouse(), sync({ phase: 'error', error: 'x', lastSync: 1 }))).toBe(true)
  })
})

describe('houseSyncFailed / houseWaitNow (la primera sincronización falló)', () => {
  it('con casa, un error antes de la primera vuelta es una falla', () => {
    expect(houseSyncFailed(inHouse(true), sync({ phase: 'error', error: 'x' }))).toBe(true)
    expect(houseWaitNow(inHouse(true), sync({ phase: 'error', error: 'x' }))).toBe('error')
  })

  it('si ya hubo una vuelta buena, no es falla', () => {
    expect(houseSyncFailed(inHouse(), sync({ phase: 'error', error: 'x', lastSync: 1 }))).toBe(false)
    expect(houseWaitNow(inHouse(), sync({ phase: 'error', error: 'x', lastSync: 1 }))).toBe('synced')
  })

  it('sin login nunca falla ni espera', () => {
    expect(houseSyncFailed({ status: 'disabled' }, sync({ phase: 'error', error: 'x' }))).toBe(false)
    expect(houseWaitNow({ status: 'disabled' }, sync({ phase: 'error', error: 'x' }))).toBe('synced')
    expect(houseWaitNow({ status: 'out', needsSetup: false }, sync())).toBe('synced')
  })

  it('esperando, todavía no decide', () => {
    expect(houseWaitNow(inHouse(), sync({ phase: 'syncing' }))).toBe('wait')
  })
})

describe('houseChoseLangs (v0.26.2: la casa ya eligió idiomas)', () => {
  it('con casa y la marca puesta, el asistente no aparece', () => {
    expect(houseChoseLangs(inHouse(), true)).toBe(true)
    expect(houseChoseLangs(inHouse(true), true)).toBe(true)
  })

  it('con casa y sin la marca, aparece', () => {
    expect(houseChoseLangs(inHouse(), false)).toBe(false)
  })

  it('sin login queda como antes (no mira la marca)', () => {
    expect(houseChoseLangs({ status: 'disabled' }, true)).toBe(false)
    expect(houseChoseLangs({ status: 'out', needsSetup: false }, true)).toBe(false)
  })
})

describe('onboardingSkip (v0.26.3: sin sincronización a tiempo no se abre)', () => {
  it('esperando la sincronización todavía no decide', () => {
    expect(onboardingSkip('wait', inHouse(), true)).toBeUndefined()
  })

  it('sincronizada: se saltea solo si la casa ya eligió', () => {
    expect(onboardingSkip('synced', inHouse(), true)).toBe('chosen')
    expect(onboardingSkip('synced', inHouse(), false)).toBeUndefined()
  })

  it('si la sincronización no llegó a tiempo no se abre, sin marcar que la casa eligió', () => {
    expect(onboardingSkip('timeout', inHouse(), false)).toBe('unknown')
    expect(onboardingSkip('timeout', inHouse(true), true)).toBe('unknown')
  })

  it('si la sincronización falló tampoco se abre, sin marcar nada', () => {
    expect(onboardingSkip('error', inHouse(), false)).toBe('unknown')
    expect(onboardingSkip('error', inHouse(true), true)).toBe('unknown')
  })

  it('sin login se muestra como antes', () => {
    expect(onboardingSkip('synced', { status: 'disabled' }, true)).toBeUndefined()
  })
})
