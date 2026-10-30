import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

const segmentsProxy = {
  '/api/segments': {
    target: 'https://api.introdb.app',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/segments/, '/segments'),
  },
}

// En local no existen las Pages Functions de TMDB ni de subtítulos (functions/api/tmdb, functions/api/subs):
// la app pregunta /api/…/_status y recibía un 404 en cada carga. Acá se contesta "no está activado".
const tmdbStatusStub: Plugin = {
  name: 'tmdb-status-stub',
  configureServer: (server) => {
    server.middlewares.use('/api/tmdb/_status', tmdbStatus)
    server.middlewares.use('/api/subs/_status', tmdbStatus)
  },
  configurePreviewServer: (server) => {
    server.middlewares.use('/api/tmdb/_status', tmdbStatus)
    server.middlewares.use('/api/subs/_status', tmdbStatus)
  },
}
const tmdbStatus: Connect.SimpleHandleFunction = (_req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify({ enabled: false }))
}

// Lo mismo para los informes de errores (functions/api/report): en local no hay KV, así que _status dice
// "no está activado" y un POST contesta 503 como lo haría la función sin el binding.
const reportStub: Plugin = {
  name: 'report-stub',
  configureServer: (server) => {
    server.middlewares.use('/api/report', reportStatus)
  },
  configurePreviewServer: (server) => {
    server.middlewares.use('/api/report', reportStatus)
  },
}
const reportStatus: Connect.SimpleHandleFunction = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  // Connect ya sacó el prefijo /api/report de req.url.
  if (((req as { url?: string }).url ?? '').split('?')[0] === '/_status') {
    res.end(JSON.stringify({ enabled: false }))
    return
  }
  res.statusCode = 503
  res.end(JSON.stringify({ ok: false, reason: 'disabled' }))
}

// Chunks del reproductor (src/pages/Player + hls.js): ver `workbox.globIgnores` más abajo.
const PLAYER_CHUNKS_GLOB = ['**/hls-*.js', '**/Player-*.{js,css}']

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tmdbStatusStub,
    reportStub,
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Flix',
        short_name: 'Flix',
        description: 'Tus pelis y series con tus addons de Stremio',
        lang: 'es-AR',
        start_url: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b0b10',
        theme_color: '#0b0b10',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Sin conexión, cualquier ruta de la app abre desde la caché; /api/* no es una página.
        navigateFallbackDenylist: [/^\/api\//],
        // v0.36 (sistema-12): hls.js y el Player (~660 KB, ~215 KB comprimidos) son de carga diferida a propósito y
        // en la primera visita se bajaban igual a la caché, compitiendo con los pósters. Se guardan al primer play
        // (runtimeCaching de abajo) y desde ahí andan sin conexión como antes.
        globIgnores: PLAYER_CHUNKS_GLOB,
        runtimeCaching: [
          {
            // La función se copia tal cual al service worker: sin variables de afuera (el regex va adentro).
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/assets\/(hls|Player)-[^/]+\.(js|css)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'player-chunks',
              // Con nombre hasheado: solo sobreviven las dos versiones más recientes de cada uno.
              expiration: { maxEntries: 6, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Fuentes del Tema 2 (empaquetadas): se guardan la primera vez que se usan y después andan sin conexión.
            urlPattern: ({ request, sameOrigin }) => sameOrigin && request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Avatares de los perfiles (v0.24, public/avatars): fijos, se guardan la primera vez que se ven.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/avatars/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'avatars',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Pósters, fondos, logos y miniaturas de episodios: casi nunca cambian.
            urlPattern: ({ url }) => /(^|\.)metahub\.space$/.test(url.hostname) || url.hostname === 'image.tmdb.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
              // Solo respuestas CORS (200). Las opacas (status 0, las de un <img> común) Chrome las cuenta
              // como ~7 MB cada una: llenaban la cuota y dejaban de guardarse ajustes y progreso.
              // Esas quedan en la caché HTTP normal del navegador.
              cacheableResponse: { statuses: [200] },
            },
          },
          // Catálogos y fichas de Cinemeta (*.strem.io) NO van acá (auditoría #6): la app ya tiene su propia
          // caché con fecha (src/lib/cache.ts: pinta al instante, refresca al vencer y sirve sin conexión).
          // Con un StaleWhileRevalidate del SW encima, al vencer la de la app el SW contestaba la copia de
          // hace días y la app la guardaba como nueva: los episodios de anoche tardaban dos visitas en
          // aparecer. La caché vieja `cinemeta` se borra al arrancar (dropLegacySwCaches en cache.ts).
        ],
      },
    }),
  ],
  build: { target: 'es2020', chunkSizeWarningLimit: 700 },
  // En producción /api/segments es una Pages Function (functions/api/segments.ts); en local, un proxy.
  server: { host: true, proxy: segmentsProxy },
  preview: { host: true, proxy: segmentsProxy },
})
