import { describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => ({
  createStore: () => ({}),
  get: async () => undefined,
  set: async () => undefined,
  del: async () => undefined,
  clear: async () => undefined,
}))

import { today } from './discoverApi'

describe('today', () => {
  it('usa la fecha local, no la de UTC (de noche en Argentina todavía es hoy)', () => {
    // 23:30 hora local del 13/10: en UTC-3 ya es 14/10 en UTC.
    const night = new Date(2026, 9, 13, 23, 30)
    expect(today(night)).toBe('2026-10-13')
    expect(today(new Date(2026, 0, 5, 0, 10))).toBe('2026-01-05')
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
