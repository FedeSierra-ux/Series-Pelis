/**
 * El número grande de "Tu año" ("5 minutos", "1 hora", "12 horas") con el mismo redondeo que el Historial
 * (`formatWatchTime`: minutos redondeados, nada de "0 minutos") y el plural bien (pc-07 / visual-04).
 */
export interface YearTotal {
  /** Lo que va en grande: "5", "1", "<1". */
  big: string
  /** La unidad: "minuto", "minutos", "hora", "horas". */
  unit: string
}

export function yearTotal(seconds: number): YearTotal {
  const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const totalMin = Math.round(s / 60)
  const hours = Math.floor(totalMin / 60)
  if (hours >= 1) return { big: hours.toLocaleString('es-AR'), unit: hours === 1 ? 'hora' : 'horas' }
  if (totalMin >= 1) return { big: String(totalMin), unit: totalMin === 1 ? 'minuto' : 'minutos' }
  // Menos de medio minuto: "<1 minuto" en vez de "0 minutos".
  return { big: '<1', unit: 'minuto' }
}
