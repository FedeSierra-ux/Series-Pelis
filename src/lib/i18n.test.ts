import { describe, expect, it } from 'vitest'
import { RESOURCE_LABEL, resourceLabel } from './i18n'

describe('RESOURCE_LABEL', () => {
  it('todas las etiquetas de los recursos de un addon empiezan con mayúscula (visual-pc-20)', () => {
    for (const label of Object.values(RESOURCE_LABEL)) expect(label[0]).toBe(label[0].toUpperCase())
  })

  it('un recurso que no conocemos queda como viene', () => {
    expect(resourceLabel('catalog')).toBe('Catálogos')
    expect(resourceLabel('raro')).toBe('raro')
  })
})
