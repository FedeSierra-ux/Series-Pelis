// Cloudflare Pages Function: /api/segments → IntroDB (intro, resumen y créditos).
// IntroDB solo permite CORS desde introdb.app, por eso pasamos por acá.

import { crossSite, json } from '../_lib'

const UPSTREAM = 'https://api.introdb.app/segments'
const INT = /^\d{1,4}$/

export const onRequestGet = async (context: { request: Request }): Promise<Response> => {
  if (crossSite(context.request)) return json({ error: 'Solo desde la app' }, 403)
  const query = new URL(context.request.url).searchParams
  const imdbId = query.get('imdb_id') ?? ''
  if (!/^tt\d+$/.test(imdbId)) return json({ error: 'imdb_id inválido' }, 400)

  const params = new URLSearchParams({ imdb_id: imdbId })
  const season = query.get('season')
  const episode = query.get('episode')
  if (season !== null || episode !== null) {
    if (!season || !episode || !INT.test(season) || !INT.test(episode)) return json({ error: 'season/episode inválidos' }, 400)
    params.set('season', season)
    params.set('episode', episode)
  } else {
    // Sin temporada ni episodio es una peli: IntroDB lo pide explícito.
    params.set('is_movie', 'true')
  }

  try {
    const res = await fetch(`${UPSTREAM}?${params}`, { headers: { Accept: 'application/json' } })
    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': res.ok ? 'public, max-age=86400' : 'no-store',
      },
    })
  } catch {
    return json({ error: 'IntroDB no responde' }, 502)
  }
}
