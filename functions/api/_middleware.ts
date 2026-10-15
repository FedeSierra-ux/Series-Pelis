// Middleware de /api/*: con el login activo (binding `DB`), TMDB y los subtítulos del sitio son solo para
// aparatos que entraron con su casa (usan las keys del sitio). `_status` sigue abierto: la app lo pregunta
// antes de entrar. /api/segments (IntroDB, sin key) y /api/report quedan como estaban.

import { authEnabled, getSession, unauthorized, type AuthEnv } from '../_auth'
import { json } from '../_lib'

const GATED = /^\/api\/(tmdb|subs)\//

export const onRequest = async (context: { request: Request; env: AuthEnv; next: () => Promise<Response> }): Promise<Response> => {
  const { request, env } = context
  const path = new URL(request.url).pathname
  if (!GATED.test(path) || path.endsWith('/_status') || !authEnabled(env)) return context.next()
  try {
    if (!(await getSession(env.DB, request))) return unauthorized()
  } catch {
    return json({ error: 'La base no responde. Probá en un rato.' }, 503)
  }
  return context.next()
}
