import { describe, expect, it } from 'vitest'
import { posterAriaLabel, ratingText } from './posterAria'

describe('ratingText', () => {
  it('pone la coma decimal y el nombre del servicio', () => {
    expect(ratingText('7.8')).toBe('IMDb 7,8')
    expect(ratingText('10')).toBe('IMDb 10')
  })
  it('sin puntaje (o en cero) no dice nada', () => {
    expect(ratingText(undefined)).toBeUndefined()
    expect(ratingText('')).toBeUndefined()
    expect(ratingText('0')).toBeUndefined()
    expect(ratingText('0.0')).toBeUndefined()
  })
})

describe('posterAriaLabel (a11y-10)', () => {
  it('arranca con el título y dice si es película o serie', () => {
    expect(posterAriaLabel({ name: 'Carrie', type: 'movie', info: '2026', rating: '7.8', label: 'Estreno', rank: 2 })).toBe(
      'Carrie, película, 2026, IMDb 7,8, Estreno, Puesto 2',
    )
    expect(posterAriaLabel({ name: 'Dark', type: 'series', info: '2017–2020', rating: '8.7' })).toBe('Dark, serie, 2017–2020, IMDb 8,7')
  })
  it('lo que falta no deja comas sueltas', () => {
    expect(posterAriaLabel({ name: 'Algo' })).toBe('Algo')
    expect(posterAriaLabel({ name: 'Algo', type: 'movie', info: '' })).toBe('Algo, película')
  })
  it('los tipos que no son película ni serie no se nombran', () => {
    expect(posterAriaLabel({ name: 'Canal 7', type: 'tv', info: '2020' })).toBe('Canal 7, 2020')
  })
  it('lo visto se dice y el título nunca queda en el medio', () => {
    const label = posterAriaLabel({ name: 'Matrix', type: 'movie', info: '1999', rating: '8.7', watched: true, label: 'Top 10', rank: 1 })
    expect(label.startsWith('Matrix, ')).toBe(true)
    expect(label).toContain('Vista')
    expect(label.endsWith('Puesto 1')).toBe(true)
  })
})
