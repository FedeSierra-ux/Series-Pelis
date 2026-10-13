// Textos de las tarjetas apaisadas de "Seguir viendo" (Tema 2): "T1 E3 · quedan 24 min".

/** "quedan 24 min" / "quedan 1 h 12 min"; vacío si no se sabe la duración. */
export function remainingLabel(position: number, duration: number): string {
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return ''
  const left = Math.max(0, duration - Math.max(0, position))
  const min = Math.max(1, Math.round(left / 60))
  if (min < 60) return `quedan ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `quedan ${h} h ${m} min` : `quedan ${h} h`
}

export function continueSubtitle(e: { season?: number; episode?: number; position: number; duration: number }): string {
  const ep = e.season !== undefined && e.episode !== undefined ? `T${e.season} E${e.episode}` : ''
  const left = remainingLabel(e.position, e.duration)
  return [ep, left].filter(Boolean).join(' · ') || 'Continuar'
}
