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

// En local no existe la Pages Function de TMDB (functions/api/tmdb): `probeServerTmdb()` pregunta
// /api/tmdb/_status al arrancar y recibía un 404 en cada carga. Acá se contesta "no está activado".
const tmdbStatusStub: Plugin = {
  name: 'tmdb-status-stub',
  configureServer: (server) => {
    server.middlewares.use('/api/tmdb/_status', tmdbStatus)
  },
  configurePreviewServer: (server) => {
    server.middlewares.use('/api/tmdb/_status', tmdbStatus)
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
        name: 'Series-Pelis',
        short_name: 'Series-Pelis',
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
        runtimeCaching: [
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
          {
            // Catálogos y metadatos de Cinemeta: se muestran al instante y se refrescan en segundo plano.
            urlPattern: ({ url }) => /strem\.io$/.test(url.hostname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'cinemeta',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 7 },
              // Solo respuestas CORS (200): una opaca (status 0) no se puede leer y ocupa muchísimo lugar.
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  build: { target: 'es2020', chunkSizeWarningLimit: 700 },
  // En producción /api/segments es una Pages Function (functions/api/segments.ts); en local, un proxy.
  server: { host: true, proxy: segmentsProxy },
  preview: { host: true, proxy: segmentsProxy },
})
