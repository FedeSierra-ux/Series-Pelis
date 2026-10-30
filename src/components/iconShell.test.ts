import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DetailIcon } from '../pages/detail/DetailIcons'
import { FilterIcon } from '../pages/discover/FilterIcons'
import { HeroIcon } from '../pages/home/HeroInfo'
import { PlayerIcon } from '../pages/player/PlayerIcons'
import { GLYPHS, GlyphIcon, type GlyphName } from './Icon'
import { NoticeCard } from './NoticeCard'
import { Theme2Icon } from './Theme2Icons'

// El marco del <svg> y los glifos compartidos viven en `Icon.tsx`: los cinco sets lo usan con su propio tamaño,
// clase y grosor de trazo. Estos tests fijan que ninguno cambió de aspecto al unificarlos.

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el)

describe('íconos: marco compartido', () => {
  it('cada set conserva su clase, su tamaño por defecto y su grosor', () => {
    expect(html(createElement(Theme2Icon, { name: 'search' }))).toContain('width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"')
    expect(html(createElement(PlayerIcon, { name: 'play' }))).toContain('class="player-icon" width="24" height="24"')
    expect(html(createElement(DetailIcon, { name: 'plus' }))).toContain('class="d-icon" width="22" height="22"')
    expect(html(createElement(FilterIcon, { name: 'sort' }))).toContain('class="fb-icon" width="20" height="20"')
    // La portada va con trazo de 2,2 (a propósito, más fino que el de las filas y más grueso que el del reproductor).
    expect(html(createElement(HeroIcon, { name: 'plus' }))).toContain('stroke-width="2.2"')
    for (const el of [createElement(Theme2Icon, { name: 'home' }), createElement(PlayerIcon, { name: 'pause' }), createElement(DetailIcon, { name: 'eye' }), createElement(FilterIcon, { name: 'grid' })]) {
      expect(html(el)).toContain('stroke-width="2"')
    }
  })

  it('todos son decorativos: aria-hidden y sin foco', () => {
    for (const el of [
      createElement(Theme2Icon, { name: 'close' }),
      createElement(PlayerIcon, { name: 'cc' }),
      createElement(DetailIcon, { name: 'back' }),
      createElement(FilterIcon, { name: 'prev' }),
      createElement(HeroIcon, { name: 'info' }),
      createElement(GlyphIcon, { name: 'next' }),
    ]) {
      expect(html(el)).toContain('aria-hidden="true" focusable="false"')
    }
  })

  it('un glifo repetido es el mismo en todos los sets', () => {
    const inner = (el: Parameters<typeof renderToStaticMarkup>[0]) => html(el).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
    const glyph = (name: GlyphName) => inner(createElement(GlyphIcon, { name }))
    expect(inner(createElement(Theme2Icon, { name: 'close' }))).toBe(glyph('close'))
    expect(inner(createElement(DetailIcon, { name: 'close' }))).toBe(glyph('close'))
    expect(inner(createElement(FilterIcon, { name: 'close' }))).toBe(glyph('close'))
    expect(inner(createElement(DetailIcon, { name: 'back' }))).toBe(glyph('back'))
    expect(inner(createElement(FilterIcon, { name: 'prev' }))).toBe(glyph('back'))
    expect(inner(createElement(HeroIcon, { name: 'prev' }))).toBe(glyph('back'))
    expect(inner(createElement(FilterIcon, { name: 'next' }))).toBe(glyph('next'))
    expect(inner(createElement(HeroIcon, { name: 'next' }))).toBe(glyph('next'))
    expect(inner(createElement(DetailIcon, { name: 'plus' }))).toBe(glyph('plus'))
    expect(inner(createElement(HeroIcon, { name: 'check' }))).toBe(glyph('check'))
    expect(inner(createElement(HeroIcon, { name: 'info' }))).toBe(glyph('info'))
  })

  it('los trazos de las flechas de las filas y de Seguir viendo se pasan por parámetro', () => {
    expect(html(createElement(GlyphIcon, { name: 'back', size: 30, strokeWidth: 2.6 }))).toContain('width="30" height="30"')
    expect(html(createElement(GlyphIcon, { name: 'info', size: 16, strokeWidth: 2.4 }))).toContain('stroke-width="2.4"')
    expect(Object.keys(GLYPHS).sort()).toEqual(['back', 'check', 'close', 'info', 'next', 'plus'])
  })
})

describe('NoticeCard (aviso abajo y al centro)', () => {
  const card = (props: Partial<ComponentProps<typeof NoticeCard>>) => html(createElement(NoticeCard, { text: 'Hola', children: createElement('button', null, 'OK'), ...props }))

  it('mismo marco que los cuatro avisos de antes', () => {
    expect(card({ polite: true })).toBe('<div class="update-toast" role="status" aria-live="polite"><span class="update-toast-text">Hola</span><div class="update-toast-actions"><button>OK</button></div></div>')
    expect(card({ role: 'alert' })).toBe('<div class="update-toast" role="alert"><span class="update-toast-text">Hola</span><div class="update-toast-actions"><button>OK</button></div></div>')
  })

  it('la barra de avance va entre el texto y los botones', () => {
    const out = card({ progress: createElement('progress', { className: 'update-toast-progress' }) })
    expect(out.indexOf('update-toast-text')).toBeLessThan(out.indexOf('<progress'))
    expect(out.indexOf('<progress')).toBeLessThan(out.indexOf('update-toast-actions'))
  })
})
