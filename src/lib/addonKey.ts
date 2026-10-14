// Identidad de un addon (v0.9): está aparte de store.ts para que la usen también los módulos que
// store.ts importa (stremioLibrary.ts) sin armar un ciclo.

/**
 * Identidad de un addon instalado: su URL (sin mayúsculas en el dominio ni barra final). El mismo addon
 * con otra configuración (Torrentio con TorBox y Torrentio con Real-Debrid) tiene el mismo `manifest.id`
 * pero otra URL, y son dos addons distintos.
 */
export function addonKey(transportUrl: string): string {
  try {
    const u = new URL(transportUrl.trim())
    u.hash = ''
    return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}`
  } catch {
    return transportUrl.trim()
  }
}

export const sameAddon = (a: string, b: string) => addonKey(a) === addonKey(b)
