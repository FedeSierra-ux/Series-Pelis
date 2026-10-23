import { describe, expect, it } from 'vitest'
import { formatWatchTime } from './watchStats'
import { yearTotal } from './yearTotal'

describe('yearTotal', () => {
  it('redondea los minutos como el Historial (329 s → 5 min en los dos lados)', () => {
    expect(yearTotal(329)).toEqual({ big: '5', unit: 'minutos' })
    expect(formatWatchTime(329)).toBe('5 min')
    // 5 min 31 s redondea para arriba en los dos.
    expect(yearTotal(331)).toEqual({ big: '6', unit: 'minutos' })
    expect(formatWatchTime(331)).toBe('6 min')
  })

  it('singular: "1 minuto", "1 hora"', () => {
    expect(yearTotal(60)).toEqual({ big: '1', unit: 'minuto' })
    expect(yearTotal(80)).toEqual({ big: '1', unit: 'minuto' })
    expect(yearTotal(3600)).toEqual({ big: '1', unit: 'hora' })
    expect(yearTotal(5000)).toEqual({ big: '1', unit: 'hora' })
  })

  it('con menos de medio minuto no dice "0 minutos"', () => {
    expect(yearTotal(20)).toEqual({ big: '<1', unit: 'minuto' })
    expect(yearTotal(0)).toEqual({ big: '<1', unit: 'minuto' })
    expect(yearTotal(NaN)).toEqual({ big: '<1', unit: 'minuto' })
  })

  it('59 min 40 s ya es "1 hora", como el Historial', () => {
    expect(yearTotal(3580)).toEqual({ big: '1', unit: 'hora' })
    expect(formatWatchTime(3580)).toBe('1 h')
    expect(yearTotal(12 * 3600 + 600)).toEqual({ big: '12', unit: 'horas' })
  })
})
