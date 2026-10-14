import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectionInfo, effectiveQualityCap, qualityCapFor } from './network'

afterEach(() => vi.unstubAllGlobals())

const withConnection = (connection: unknown) => vi.stubGlobal('navigator', { userAgent: 'test', connection })

describe('qualityCapFor', () => {
  it('con 2G el tope es 480p', () => {
    expect(qualityCapFor({ effectiveType: '2g' })).toBe('480p')
    expect(qualityCapFor({ effectiveType: 'slow-2g', downlink: 0.05 })).toBe('480p')
  })

  it('con 3G o ahorro de datos el tope es 720p', () => {
    expect(qualityCapFor({ effectiveType: '3g' })).toBe('720p')
    expect(qualityCapFor({ effectiveType: '4g', saveData: true })).toBe('720p')
    expect(qualityCapFor({ saveData: true })).toBe('720p')
  })

  it('con 4G y buen ancho de banda no hay tope', () => {
    expect(qualityCapFor({ effectiveType: '4g', downlink: 10, saveData: false })).toBeUndefined()
    expect(qualityCapFor({ effectiveType: '4g' })).toBeUndefined()
  })

  it('un 4G muy lento también baja la calidad', () => {
    expect(qualityCapFor({ effectiveType: '4g', downlink: 1.2 })).toBe('720p')
    expect(qualityCapFor({ effectiveType: '4g', downlink: 0.5 })).toBe('480p')
    // Sin tipo, solo con ancho de banda.
    expect(qualityCapFor({ downlink: 1.5 })).toBe('720p')
  })

  it('sin datos no hay tope', () => {
    expect(qualityCapFor(undefined)).toBeUndefined()
    expect(qualityCapFor({})).toBeUndefined()
    expect(qualityCapFor({ effectiveType: 'otra-cosa' })).toBeUndefined()
  })
})

describe('connectionInfo / effectiveQualityCap', () => {
  it('lee navigator.connection', () => {
    withConnection({ effectiveType: '3g', saveData: false, downlink: 1.4 })
    expect(connectionInfo()).toEqual({ effectiveType: '3g', saveData: false, downlink: 1.4 })
    expect(effectiveQualityCap()).toBe('720p')
    withConnection({ effectiveType: '2g', downlink: 0.07 })
    expect(effectiveQualityCap()).toBe('480p')
    withConnection({ effectiveType: '4g', saveData: true })
    expect(effectiveQualityCap()).toBe('720p')
    withConnection({ effectiveType: '4g', downlink: 10 })
    expect(effectiveQualityCap()).toBeUndefined()
  })

  it('sin la API (Firefox, Safari, TVs viejas) no hay tope', () => {
    vi.stubGlobal('navigator', { userAgent: 'test' })
    expect(connectionInfo()).toBeUndefined()
    expect(effectiveQualityCap()).toBeUndefined()
    withConnection(null)
    expect(effectiveQualityCap()).toBeUndefined()
    vi.stubGlobal('navigator', undefined)
    expect(effectiveQualityCap()).toBeUndefined()
  })

  it('ignora valores raros', () => {
    withConnection({ effectiveType: 42, downlink: Infinity, saveData: 'sí' })
    expect(connectionInfo()).toEqual({ effectiveType: undefined, saveData: false, downlink: undefined })
    expect(effectiveQualityCap()).toBeUndefined()
  })
})
