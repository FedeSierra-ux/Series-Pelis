/**
 * Indicador de carga con aviso para lectores de pantalla (a11y-20): un `aria-label` en un <div> o <span> sin rol
 * no se anuncia, así que lleva `role="status"` y el texto adentro, solo para el lector (`sp-sr-only`).
 * `as="span"` para los que van dentro de un renglón (el título de un grupo de fuentes, la cabecera del Calendario).
 */
export function Spinner({ label = 'Cargando…', as: Tag = 'div' }: { label?: string; as?: 'div' | 'span' }) {
  return (
    <Tag className="spinner" role="status">
      <span className="sp-sr-only">{label}</span>
    </Tag>
  )
}
