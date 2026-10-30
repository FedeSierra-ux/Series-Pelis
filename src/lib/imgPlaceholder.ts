// Imagen de relleno cuando un póster o una miniatura no carga (404, CDN caído): un rectángulo oscuro con la
// inicial del título (o un ícono si no hay título). Es un SVG en una data URI, así que sigue siendo un <img>
// y respeta el tamaño y el `object-fit` que cada pantalla ya le da (la CSP permite `data:` en `img-src`).

export type PlaceholderShape = 'poster' | 'wide'

const SIZE: Record<PlaceholderShape, { w: number; h: number }> = {
  poster: { w: 200, h: 300 },
  wide: { w: 320, h: 180 },
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Primera letra o número del título en mayúscula (vacío si no hay ninguna). */
export function initialOf(label?: string): string {
  const m = (label ?? '').match(/[\p{L}\p{N}]/u)
  return m ? m[0].toLocaleUpperCase('es') : ''
}

export function placeholderSvg(shape: PlaceholderShape, label?: string): string {
  const { w, h } = SIZE[shape]
  const initial = initialOf(label)
  const cx = w / 2
  const cy = h / 2
  const glyph = initial
    ? `<text x="${cx}" y="${cy}" dy="0.35em" text-anchor="middle" font-family="Sora,DM Sans,Arial,sans-serif" font-weight="700" font-size="${Math.round(Math.min(w, h) * 0.34)}" fill="#a8a3b3" fill-opacity="0.75">${esc(initial)}</text>`
    : `<g fill="none" stroke="#a8a3b3" stroke-opacity="0.6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><rect x="${cx - 30}" y="${cy - 22}" width="60" height="44" rx="6"/><path d="M${cx - 30} ${cy + 10}l16-16 14 14 10-8 20 18"/></g>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2732"/><stop offset="0.7" stop-color="#1c1a22"/></linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>${glyph}</svg>`
  )
}

export const placeholderSrc = (shape: PlaceholderShape, label?: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(placeholderSvg(shape, label))}`
