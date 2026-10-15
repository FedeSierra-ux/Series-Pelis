// Middleware de /api/*: con el login activo (binding `DB`), TMDB y los subtítulos del sitio son solo para
// aparatos que entraron con su casa (usan las keys del sitio). `_status` sigue abierto: la app lo pregunta
// antes de entrar. /api/segments (IntroDB, sin key) y /api/report quedan como estaban.

import { authEnabled, getSession, unauthorized, type AuthEnv } from '../_auth'
import { json } from '../_lib'

const GATED = /^\/api\/(tmdb|subs)(\/|$)/i
const OPEN = /^\/api\/(tmdb|subs)\/_status\/?$/i

/** La ruta como la ve el router: sin `%xx` ni barras repetidas (así `/api/%74mdb` o `//api/tmdb` no se escapan). */
export function gatePath(url: string): string {
  let path = new URL(url).pathname
  try {
    path = decodeURIComponent(path)
  } catch {
    // Un `%` suelto: se compara tal cual.
  }
  return path.replace(/\/{2,}/g, '/')
}

export const onRequest = async (context: { request: Request; env: AuthEnv; next: () => Promise<Response> }): Promise<Response> => {
  const { request, env } = context
  const path = gatePath(request.url)
  if (!GATED.test(path) || OPEN.test(path) || !authEnabled(env)) return context.next()
  try {
    if (!(await getSession(env.DB, request))) return unauthorized()
  } catch {
    return json({ error: 'La base no responde. Probá en un rato.' }, 503)
  }
  return context.next()
}
