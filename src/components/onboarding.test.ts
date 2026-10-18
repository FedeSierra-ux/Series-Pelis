import { describe, expect, it } from 'vitest'
import type { AuthState } from '../lib/auth'
import type { SyncStatus } from '../lib/cloudSync'
import { houseSynced } from './Onboarding'

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

  it('si la sincronización falla (sin conexión) no se queda esperando', () => {
    expect(houseSynced(inHouse(true), sync({ phase: 'error', error: 'x' }))).toBe(true)
  })
})
