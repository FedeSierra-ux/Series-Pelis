import type { ReactNode } from 'react'

// Base de todos los íconos de línea de la app (`Theme2Icons`, `PlayerIcons`, `DetailIcons`, `FilterIcons` y los
// de la portada en `HeroInfo`): el <svg> con el trazo común y los glifos que se repetían igual en varios sets.
// Cada set conserva su registro, su tamaño y su grosor de trazo (los del reproductor, la portada y el riel
// son a propósito distintos: `strokeWidth`), pero el marco vive acá.

/** Glifos que estaban copiados idénticos en más de un set: un ícono por significado. */
export const GLYPHS = {
  close: <path d="M6 6l12 12M18 6L6 18" />,
  /** Flecha hacia la izquierda (volver, página anterior). */
  back: <path d="M15 5l-7 7 7 7" />,
  /** Flecha hacia la derecha (página siguiente). */
  next: <path d="M9 5l7 7-7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </>
  ),
} as const

export type GlyphName = keyof typeof GLYPHS

interface IconSvgProps {
  size: number
  /** Grosor del trazo: 2 salvo donde el diseño pide otro (la portada 2,2; las flechas de las filas 2,6). */
  strokeWidth?: number | string
  className?: string
  children: ReactNode
}

/** El <svg> de 24×24 con trazo `currentColor` y puntas redondas, oculto para el lector de pantalla. */
export function IconSvg({ size, strokeWidth = 2, className, children }: IconSvgProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** Un glifo compartido suelto (flechas de las filas, "i" de Seguir viendo…), con su tamaño y su trazo. */
export function GlyphIcon({ name, size = 22, strokeWidth, className }: { name: GlyphName; size?: number; strokeWidth?: number | string; className?: string }) {
  return (
    <IconSvg size={size} strokeWidth={strokeWidth} className={className}>
      {GLYPHS[name]}
    </IconSvg>
  )
}
