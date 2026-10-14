// Calidad según la conexión: lee lo que informa el navegador (Network Information API) y
// devuelve hasta qué resolución conviene elegir. Solo Chrome/Android la implementan; en Firefox,
// Safari y la mayoría de las TVs `navigator.connection` no existe y no hay tope.

/** Tope de calidad que impone la conexión. Sin tope = conexión buena o desconocida. */
export type QualityCap = '720p' | '480p'

export interface ConnectionInfo {
  /** 'slow-2g' | '2g' | '3g' | '4g' (el navegador lo estima con el ancho de banda y la latencia). */
  effectiveType?: string
  /** El usuario pidió ahorrar datos ("Modo ligero" de Chrome o Android). */
  saveData?: boolean
  /** Ancho de banda estimado en Mbps (Chrome lo redondea y lo limita a 10). */
  downlink?: number
}

/** Por debajo de esto (Mbps) un 1080p de debrid (5–10 Mbps) va a cortarse: tope en 720p. */
const DOWNLINK_720_MBPS = 2
/** Por debajo de esto ni el 720p (~3 Mbps) llega: tope en 480p. */
const DOWNLINK_480_MBPS = 0.8

/** `navigator.connection` con guardas: en las TVs viejas no existe. */
export function connectionInfo(): ConnectionInfo | undefined {
  if (typeof navigator === 'undefined' || !('connection' in navigator)) return undefined
  const conn = (navigator as Navigator & { connection?: ConnectionInfo | null }).connection
  if (!conn || typeof conn !== 'object') return undefined
  return {
    effectiveType: typeof conn.effectiveType === 'string' ? conn.effectiveType : undefined,
    saveData: conn.saveData === true,
    downlink: typeof conn.downlink === 'number' && Number.isFinite(conn.downlink) ? conn.downlink : undefined,
  }
}

/** Tope de calidad para una conexión dada (función pura, para probar sin navegador). */
export function qualityCapFor(info: ConnectionInfo | undefined): QualityCap | undefined {
  if (!info) return undefined
  const type = info.effectiveType
  if (type === 'slow-2g' || type === '2g') return '480p'
  if (info.downlink !== undefined && info.downlink > 0 && info.downlink < DOWNLINK_480_MBPS) return '480p'
  if (type === '3g' || info.saveData) return '720p'
  if (info.downlink !== undefined && info.downlink > 0 && info.downlink < DOWNLINK_720_MBPS) return '720p'
  return undefined
}

/**
 * Hasta qué calidad conviene elegir con la conexión actual: '720p' con 3G o ahorro de datos,
 * '480p' con 2G, sin tope con 4G o si el navegador no informa nada.
 */
export function effectiveQualityCap(): QualityCap | undefined {
  return qualityCapFor(connectionInfo())
}
