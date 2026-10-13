import type { ReactNode } from 'react'

/**
 * Opciones avanzadas de Ajustes: se ocultan hasta que se activa "Mostrar opciones avanzadas".
 * Es solo el atributo `data-advanced` (lo esconde el CSS de `.settings:not(.show-advanced)`), así que
 * también sirve ponerlo directo en cualquier elemento: `<section className="settings-section" data-advanced>`.
 * Este envoltorio usa `display: contents`: no cambia el espaciado de la sección.
 */
export function Advanced({ children }: { children: ReactNode }) {
  return (
    <div className="adv-group" data-advanced>
      {children}
    </div>
  )
}
