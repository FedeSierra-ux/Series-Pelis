import { describe, expect, it } from 'vitest'
import { langLabel } from './i18n'
import { subLangName, subMenuLabels, type SubOption } from './subtitlePrefs'

// Auditoría de uso #6: el menú CC mostraba ids internos ("Español · 4026007") y códigos sin traducir ("tur").

const name = (c: string | undefined) => subLangName(c, langLabel)

describe('subLangName', () => {
  it('usa la tabla de la app primero', () => {
    expect(name('spa')).toBe('Español')
    expect(name('pob')).toBe('Portugués (Brasil)')
  })
  it('traduce con Intl los que no están en la tabla', () => {
    expect(name('tur')).toBe('Turco')
    expect(name('ara')).toBe('Árabe')
    expect(name('dut')).toBe('Neerlandés')
  })
  it('códigos propios de OpenSubtitles', () => {
    expect(name('spn')).toBe('Español (España)')
    expect(name('zht')).toBe('Chino tradicional')
  })
  it('sin idioma o desconocido', () => {
    expect(name('')).toBe('Sin idioma')
    expect(name('qqq')).toBe('QQQ')
  })
})

describe('subMenuLabels', () => {
  const sub = (id: string, lang: string, extra: Partial<SubOption> = {}): SubOption => ({ id, lang, url: `https://s/${id}`, ...extra })

  it('no muestra los ids internos y numera los repetidos', () => {
    const labels = subMenuLabels([sub('4026007', 'spa'), sub('4026008', 'spa'), sub('5299652', 'tur')], name)
    expect(labels).toEqual([
      { main: 'Español', extra: 'Opción 1' },
      { main: 'Español', extra: 'Opción 2' },
      { main: 'Turco', extra: '' },
    ])
    expect(JSON.stringify(labels)).not.toMatch(/4026007|5299652/)
  })

  it('marca forzados y SDH si el nombre no lo dice', () => {
    const labels = subMenuLabels([sub('1', 'eng', { forced: true }), sub('2', 'eng', { sdh: true, label: 'Inglés SDH' })], name)
    expect(labels[0]).toEqual({ main: 'Inglés', extra: 'Forzados' })
    expect(labels[1]).toEqual({ main: 'Inglés SDH', extra: '' })
  })
})
