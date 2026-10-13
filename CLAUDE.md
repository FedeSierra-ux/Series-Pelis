# Series-Pelis — memoria del proyecto

App web personal (PWA) para ver pelis y series usando **addons de Stremio**, con puntaje de IMDb,
historial, "Seguir viendo" y "Mi lista". Interfaz en **español latino (es-AR)**.

## Cómo trabajar con el usuario

- **Preguntar antes de suponer** o de hacer cambios que no pidió.
- Cada cambio: subir la versión (`package.json` + `CHANGELOG.md`) y abrir **un PR nuevo**.
- Responder en español rioplatense.

## Decisiones tomadas (v0.1.0)

| Tema | Decisión |
|---|---|
| Plataforma | PWA (PC, celular, navegador de la TV). Pensada para llevarla después a Fire TV / Android TV (TWA o Capacitor). |
| Metadatos | **Cinemeta** (`v3-cinemeta.strem.io`): sin API key, incluye `imdbRating`. Desde v0.3, **TMDB opcional** para español, reparto, sagas y tendencias. |
| Streams | Protocolo de addons de Stremio. El usuario pega las URLs de manifest de sus addons; el debrid (Real-Debrid / TorBox) va configurado dentro del addon, la app no lo maneja. |
| Torrents sin debrid | Solo vía servidor local de Stremio (`http://127.0.0.1:11470`, opcional/experimental, solo PC). |
| Datos del usuario | v0.1: IndexedDB en el navegador + exportar/importar JSON. |
| Backend (v0.2) | **Cloudflare**: Pages (web) + Workers (API/caché) + D1 (base). No usar Supabase. |
| Login (v0.2) | **Código de vinculación** estilo Netflix: usuario/contraseña en PC o celular y código de 6 dígitos en la TV. |

## Límite que NO se cruza

No escribir scrapers, descifradores ni proxys que saquen streams de sitios piratas (lo que hace
framextv.xyz: descifra URLs ofuscadas con WASM y falsea `Referer`/`Origin` con Workers para
vidlink/videasy/etc.). La app es un cliente genérico de addons, igual que Stremio.

## Comandos

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build a dist/
npm run preview    # sirve dist/ en http://localhost:4173
```

## Estructura

- `src/lib/addons.ts` — cliente del protocolo de addons (catálogos, meta, streams, subtítulos).
- `src/lib/cache.ts` — caché stale-while-revalidate en memoria + IndexedDB (lo que hace que cargue rápido).
- `src/lib/store.ts` — addons instalados, progreso/historial, mi lista, ajustes. Todo pasa por acá (en v0.2 se sincroniza con D1).
- `src/lib/spatialNav.ts` — navegación con flechas del control remoto.
- `src/lib/streamPicker.ts` — puntaje de streams y elección automática. `src/lib/nextEpisode.ts` — siguiente episodio y precarga.
- `src/lib/segments.ts` + `functions/api/segments.ts` — saltar intro (IntroDB vía Pages Function; en dev, proxy de Vite).
- `src/lib/upNext.ts`, `src/lib/stats.ts` — siguiente episodio de tus series / calendario, y estadísticas de "Tu año".
- `src/pages/` — Inicio, Descubrir, Buscar, Detalle, Reproductor, Historial, Tu año, Calendario, Mi lista, Ajustes
  (`settings/PlayerSettings.tsx`, `settings/SourceSettings.tsx`).
- `vite.config.ts` — PWA (Workbox): pósters CacheFirst, Cinemeta StaleWhileRevalidate.
- `.claude/agents/` — agentes de agency-agents útiles para este proyecto. `.claude/skills/` + `.mcp.json` — rea.

## Pendiente / ideas

- v0.2.0 hecha: "tanda 1" del análisis de mercado (reproductor, elección de fuente, biblioteca/calendario/Tu año).
  El usuario no quiere la estadística "la que más volviste a ver".
- v0.3.0 hecha: TMDB ("tanda 2"). `src/lib/tmdb.ts` (cliente, es-MX / región AR), `components/TmdbExtras.tsx`,
  `pages/Person.tsx`, `pages/home/` (portada con tráiler, Top 10, Porque viste, tendencias), `components/PauseCast.tsx`.
  La key va en Ajustes → TMDB (IndexedDB). **Nunca** commitearla; al publicar en Cloudflare puede ir como secreto.
  Ids `tmdb:movie:603` / `tmdb:tv:1396` en rutas: la ficha los traduce a IMDb.
  El usuario NO quiere reconocimiento de caras (X-Ray solo con el reparto del episodio).
- Pendiente de respuesta: ¿Mi lista / historial deberían guardar el título en español en vez del de Cinemeta?
- Login con código de vinculación + sincronización en Cloudflare D1 + Worker de caché.
- Importar addons directo desde la cuenta de Stremio.
- Empaquetar para Fire TV / Android TV.
- Integración opcional con Trakt.
