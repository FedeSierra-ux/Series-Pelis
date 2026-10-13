import { defineConfig } from 'vite'
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

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
        runtimeCaching: [
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
              cacheableResponse: { statuses: [0, 200] },
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
