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
