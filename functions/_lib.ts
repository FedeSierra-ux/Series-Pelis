// Ayudas compartidas por las Pages Functions (functions/api/*). Cloudflare no enruta los archivos que
// empiezan con "_": este solo se importa.

export function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  })
}

/**
 * Rechaza pedidos de otros sitios (que la función no se use como proxy abierto ni se la llene de basura).
 * Sin Origin ni Sec-Fetch-Site (curl, navegadores viejos) se deja pasar.
 */
export function crossSite(request: Request): boolean {
  const site = request.headers.get('Sec-Fetch-Site')
  if (site && site !== 'same-origin' && site !== 'none') return true
  const origin = request.headers.get('Origin')
  return !!origin && origin !== new URL(request.url).origin
}

/**
 * Prueba positiva de que el pedido sale de una página de este mismo sitio (auditoría #17). `crossSite`
 * deja pasar lo que no trae ni `Origin` ni `Sec-Fetch-Site` (curl); esto no: pide `Sec-Fetch-Site:
 * same-origin` (Chromium 76+, Firefox 90+, Safari 16.4+) o, en navegadores más viejos, un `Origin` o un
 * `Referer` del mismo origen (el sitio usa `Referrer-Policy: strict-origin-when-cross-origin`, así que
 * los pedidos de la app siempre lo mandan). No es un candado (curl puede inventar las cabeceras),
 * pero saca de encima el uso casual del proxy como si fuera propio.
 */
export function fromOwnSite(request: Request): boolean {
  const own = new URL(request.url).origin
  const site = request.headers.get('Sec-Fetch-Site')
  if (site) return site === 'same-origin'
  const origin = request.headers.get('Origin')
  if (origin) return origin === own
  const referer = request.headers.get('Referer')
  if (!referer) return false
  try {
    return new URL(referer).origin === own
  } catch {
    return false
  }
}

/**
 * Tope de pedidos por IP en la memoria de cada instancia del Worker. No es global (Cloudflare reparte
 * entre instancias), pero corta un bucle de curl sin gastar escrituras de KV, que en el plan gratis
 * son 1000 por día y se irían en un rato con los pedidos normales de la app.
 */
export function memoryRateLimit(limit: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>()
  return {
    /** `true` si esta IP ya pasó el tope en la ventana actual (y cuenta el pedido si no). */
    over(ip: string, now = Date.now()): boolean {
      if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k)
      const cur = hits.get(ip)
      if (!cur || cur.reset <= now) {
        hits.set(ip, { n: 1, reset: now + windowMs })
        return false
      }
      if (cur.n >= limit) return true
      cur.n++
      return false
    },
    reset() {
      hits.clear()
    },
  }
}

/** IP del que pide, según Cloudflare (o "?" en local). */
export const clientIp = (request: Request) => request.headers.get('CF-Connecting-IP') ?? '?'
