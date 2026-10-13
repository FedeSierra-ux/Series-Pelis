/** Puntaje de IMDb con el amarillo característico. */
export function ImdbRating({ value, size = 'md' }: { value?: string; size?: 'sm' | 'md' }) {
  if (!value || value === '0' || value === '0.0') return null
  return (
    <span className={`imdb imdb-${size}`} title="Puntaje de IMDb">
      <b>IMDb</b>
      {value}
    </span>
  )
}
