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
- v0.4.0 hecha: reproductor, subtítulos y fuentes. `pages/player/` (SeekPreview, SourcesMenu, RecapOffer,
  CreditsNotice, SubtitleMenu, `useSubtitles.ts`), `lib/credits.ts`, `lib/subtitlePrefs.ts`, `lib/dataSaver.ts`.
  Idioma por título en `trackPrefsStore`. Cambiar de fuente = `navigate` con `replace` + `resume` en `location.state`.
- v0.5.0 hecha: `lib/` searchHistory, discoverFilters, curated, discoverApi, posterLabels, hoverTrailer, wikiTrivia,
  stars, recommend, spoilers, ratings, diary, goals, yearStory. Páginas Lists, Together, Diary, Goals.
  Las listas "Top IMDb" son una aproximación (Cinemeta no tiene el Top 250). Wikipedia limita pedidos (429).
  La caché de imágenes del SW solo guarda respuestas CORS (las opacas llenaban la cuota de Chrome).
- v0.6.0 hecha: Tema 1 / Tema 2 (`lib/theme.ts`, `theme2.css`, `components/Theme2Layout.tsx`; `data-theme="2"`
  en `<html>`, espejo en localStorage `sp-theme`). Lo nuevo tiene que usar las variables CSS (`--bg-2`, `--accent`,
  `--on-accent`, `--radius`…) para heredar el Tema 2; ítems de menú nuevos van también en `RAIL`/`TABS`.
  Addons: `catalogPrefs`/`catalogRows` (Inicio y Descubrir usan `useCatalogRows`), `stremioApi` (api.strem.io con CORS).
  TV: `platform`, `externalPlayers`, `idle`, `screensaver`, `osk`, `online`; en Ajustes `data-advanced` / `<Advanced>`
  marca lo avanzado. El asistente inicial tapa la pantalla en un perfil nuevo: los tests de Playwright lo saltean
  con `.ob-skip`.
- v0.7.0 hecha: **TV en vivo** (`lib/liveTv.ts`, `pages/LiveTv.tsx`, `liveTvStore` en store). Lista
  `iptv-org` de Argentina; el usuario eligió solo Aire, Noticias, Deportes y Música, con canales como botones
  seleccionables en la TV. Se filtran los de cable pago (`PAY_TV`), los que piden `http-referrer` (no falseamos
  cabeceras) y los `http://` cuando la app corre en https.
- v0.8.0 hecha: arreglos de la auditoría visual (10) y de la prueba de addons (11), y **TMDB desde el sitio**:
  `functions/api/tmdb/[[path]].ts` usa el secreto de Cloudflare `TMDB_KEY` (lista blanca de rutas, solo mismo
  sitio, `_status` dice si está activo). En el cliente `probeServerTmdb()` (en `main.tsx`) prende la marca
  `sp-tmdb-server`; `tmdbKey()` / `useTmdbKey()` devuelven la key propia o `SERVER_KEY` → `tmdbFetch` va por
  `/api/tmdb`. **No leer `settingsStore.tmdbKey` directo**: usar `useTmdbKey()` / `hasTmdb()`.
  Nuevos: `lib/errors.ts` (`errorText`: errores en español), `lib/returnVideo.ts` ("Volver" tras el autoplay deja la
  ficha en el último episodio visto), `components/AddonUrlForm.tsx`, `pages/player/PlayerIcons.tsx`, `LandscapeCard` (en `ContinueCard`),
  prop `errorNotice` de `Row`, parámetro `clear` de `placeCue`, `data-autofocus` para la primera flecha de la TV.
  Quedó afuera la grilla de Buscar del punto 6 (saltos al cargar). El usuario NO quiere títulos en español:
  solo sinopsis y datos; el badge de IMDb va arriba a la derecha.
- v0.9.1 hecha: pantalla en negro al navegar en Chrome 150+ (`scrollTo` devuelve una promesa; la v0.8 la devolvía
  como limpieza del efecto). **Un efecto nunca devuelve el resultado de una llamada** (`useEffect(() => algo())`):
  siempre con llaves, salvo que devuelva la función de limpieza a propósito. `lib/effects.test.ts` lo vigila para las
  APIs del navegador que dan promesas. El `ErrorBoundary` de afuera (App) va con `keepMounted`: al navegar solo saca
  el error, no remonta Layout/menú. Los de adentro (alrededor del `Outlet` y del Player) remontan por `pathname`.
  El usuario NO quiere sumar otro puntaje cuando falta el de IMDb (se deja como está).
- Debrid: el usuario va a pagar **un TorBox (Standard)** para 3-4 casas cercanas; el resto de las ~10 casas usa su
  propio debrid. Real-Debrid no sirve para compartir (una IP a la vez). Todavía no quiere login/perfiles ni asistente.
- v0.9.0 hecha: auditoría de la v0.8 (43 bugs, 16 ítems visuales), modo TV con `html[data-tv]` (`syncTvAttr()` en
  `lib/tv.ts`), `UpdateToast` (SW con `registerType: 'prompt'`), `lib/focusMemory.ts` + `ScrollMemory`, `EmptyState`,
  `setWatchedMany`, identidad de addons por URL (`addonKey`), `refreshManifests` con TTL de 24 h, CI en GitHub Actions.
  El acento del Tema 1 como texto chico queda en 4,33:1: el usuario decidió **dejarlo así**; `--accent-fill` es para
  rellenos con texto blanco.
- v0.10.0 hecha: reproductor (`pages/player/useMediaSession.ts`: Media Session, Wake Lock, PiP; `SpeedMenu.tsx`,
  velocidad en sessionStorage `sp-rate`; botones de menús con `data-menu` para los atajos), `lib/network.ts` +
  `sourceRules.adaptQuality` (tope de calidad por `navigator.connection`), `lib/shortcuts.ts` (tabla única de
  atajos; `ShortcutsHelp` con `?`, `TvHints` con `settings.hintsSeen`), informes de errores opt-in
  (`lib/diagnostics.ts`, `components/ReportButton.tsx`, `functions/api/report/[[path]].ts` con KV `REPORTS` y
  secreto `REPORT_ADMIN_KEY`; marca `sp-report-server`; `settings.sendReports`), `functions/_lib.ts` (`crossSite`),
  CSP en `public/_headers` (desde la v0.11 no hay scripts inline y `script-src` es solo `'self'`; lo vigila
  `lib/securityHeaders.test.ts`), Ajustes con `SECTIONS` en `pages/Settings.tsx` +
  `settings/SettingsLayout.tsx` (una sección nueva = una línea en `SECTIONS`), barra inferior del Tema 1 con
  "Más" (`BAR`/`MORE` en `Layout.tsx`, se fue con el Tema 1 en la v0.11), menú ⋯ en `CatalogManager`.
- v0.11.0 hecha: **se sacó el Tema 1**. `data-theme="2"` va fijo en `index.html`; `Layout.tsx`, Apariencia y el campo
  `theme` del store ya no existen; `lib/theme.ts` solo tiene `loadThemeFonts`. Los estilos nuevos siguen en
  `theme2.css` con `[data-theme='2']`. Portada estilo Stremio (`pages/home/TmdbHero.tsx`, variantes `compact` y
  `full`): logo, IMDb, `formatRuntime`, géneros y reparto. Inicio = `compact` con `getNowPlaying`/`useNowPlaying`
  (estrenos, región AR); Películas = `pages/discover/MoviesHero.tsx` (`full`, `useTrendingMovies`, con `Top10Row`
  y su prop `title` encimado). Tráileres sin interfaz de YouTube: `ytPlayerState` (`lib/hoverTrailer.ts`) y el
  iframe se muestra recién con estado 1 (reproduciendo). Click/OK en `.hero-pause` pausa; `.hero-actions` tiene un
  `onKeyDown` que manda ↑ a la pausa (si no, ganaba el riel). En Chromium headless el tráiler no llega a reproducir.
  Con el Tema 1 se fueron el atajo `T` y la barra inferior con "Más" (`BAR`/`MORE`); `diagnostics` manda `theme: '2'`
  fijo porque el servidor espera el campo. Pendiente preguntar si Series lleva la misma portada grande y si el
  celular del Tema 2 quiere la hoja "Más".
- Función 137 (temas OLED / acento / color del póster): el usuario pidió **ver el preview antes/después primero**
  (v0.10, página en el scratchpad de la sesión); después decide. Perfiles locales (109): **todavía no**.
- **Cuestionario de funciones (140)** — decisiones del usuario y plan por versiones:
  - v0.4: 9, 16, 17, 20, 27, 28, 30, 31, 33, 37, 103 (hecha).
  - v0.5 (descubrir/ficha/biblioteca, hecha): 51, 52, 56, 58, 60, 62, 66, 67, 77, 80, 89 (puntaje con **estrellas**),
    92, 97, 101, 106, 107 y la nueva 141 (al pasar por un póster, a los segundos, tráiler con subs en español).
  - v0.6 (addons/apariencia/TV, hecha): 41, 43, 44, 47, 125, 130, 131, 134, 137, 139 + rediseño.
    **Antes de implementar 137 (Temas) mostrar preview antes/después.**
  - Más adelante: 109 perfiles (con el login/D1), 25 subtítulos online y 57 más puntajes (cuando exista el Worker
    para las keys), 128 modo TV automático.
  - Descartadas: 68, nube del debrid (45), Trakt por ahora.
- **Diseño**: el usuario eligió mezclar los estilos 1 (Sala oscura), 8 (Tonal) y 9 (TV): riel lateral, portada
  redondeada con logo, tarjetas apaisadas, acento `#c4b0ff`, Sora + DM Sans. Preview antes/después en el canvas
  "Mezcla elegida"; se implementa en v0.6.
- Login con código de vinculación + sincronización en Cloudflare D1 + Worker de caché.
- Importar addons directo desde la cuenta de Stremio.
- Empaquetar para Fire TV / Android TV.
- Integración opcional con Trakt (por ahora no).
