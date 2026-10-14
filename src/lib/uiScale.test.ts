import { describe, expect, it } from 'vitest'
import { applyUiScale, normalizeUiScale, UI_SCALES } from './tv'

function fakeRoot() {
  const props: Record<string, string> = {}
  return {
    dataset: {} as Record<string, string | undefined>,
    style: {
      setProperty: (k: string, v: string) => {
        props[k] = v
      },
      removeProperty: (k: string) => {
        delete props[k]
        return ''
      },
    },
    props,
  }
}

describe('tamaño de la interfaz', () => {
  it('ofrece 90, 100, 115 y 130 %', () => {
    expect([...UI_SCALES]).toEqual([90, 100, 115, 130])
  })

  it('normaliza valores raros a 100', () => {
    expect(normalizeUiScale(115)).toBe(115)
    expect(normalizeUiScale(undefined)).toBe(100)
    expect(normalizeUiScale('130')).toBe(100)
    expect(normalizeUiScale(200)).toBe(100)
  })

  it('pone y saca el zoom en <html>', () => {
    const root = fakeRoot()
    applyUiScale(root as unknown as HTMLElement, 130)
    expect(root.dataset.uiScale).toBe('130')
    expect(root.props['--ui-zoom']).toBe('1.3')
    applyUiScale(root as unknown as HTMLElement, 100)
    expect(root.dataset.uiScale).toBeUndefined()
    expect(root.props['--ui-zoom']).toBeUndefined()
  })
})
