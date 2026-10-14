// Cloudflare Pages Function: /api/tmdb/* → api.themoviedb.org/3/*
// La key de TMDB vive como secreto del proyecto (TMDB_KEY), así nadie de la familia tiene que configurarla.
// Solo GET, solo las rutas que usa la app y solo desde el mismo sitio (que no la use cualquiera).

import { crossSite, json } from '../../_lib'

const API = 'https://api.themoviedb.org/3'
const ALLOWED = new Set(['configuration', 'find', 'movie', 'tv', 'person', 'collection', 'trending', 'discover', 'search', 'genre', 'watch', 'keyword'])
const SEGMENT = /^[\w.-]+$/

interface Env {
  TMDB_KEY?: string
}

export const onRequestGet = async (context: { request: Request; env: Env; params: { path?: string | string[] } }): Promise<Response> => {
  const { request, env } = context
  if (crossSite(request)) return json({ error: 'Solo desde la app' }, 403)

  const raw = context.params.path
  const parts = Array.isArray(raw) ? raw : raw ? [raw] : []
  const key = env.TMDB_KEY?.trim()

  // La app pregunta acá si el sitio tiene TMDB activado.
  if (parts.length === 1 && parts[0] === '_status') {
    return new Response(JSON.stringify({ enabled: !!key }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
    })
  }

  if (!key) return json({ error: 'TMDB no está configurado en el sitio' }, 503)
  if (parts.length === 0 || !ALLOWED.has(parts[0]) || parts.some((p) => !SEGMENT.test(p) || p === '.' || p === '..')) {
    return json({ error: 'Ruta no permitida' }, 404)
  }

  const url = new URL(`${API}/${parts.join('/')}`)
  for (const [k, v] of new URL(request.url).searchParams) if (k !== 'api_key') url.searchParams.set(k, v)
  const bearer = key.startsWith('eyJ')
  if (!bearer) url.searchParams.set('api_key', key)

  try {
    const res = await fetch(url, {
      headers: bearer ? { Authorization: `Bearer ${key}`, Accept: 'application/json' } : { Accept: 'application/json' },
    })
    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': res.ok ? 'public, max-age=3600' : 'no-store',
      },
    })
  } catch {
    return json({ error: 'TMDB no responde' }, 502)
  }
}
