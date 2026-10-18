# Flix (ex Series-Pelis) — memoria del proyecto

**Flix** (se llamaba Series-Pelis hasta la v0.21) es una app web personal (PWA) para ver pelis y series usando **addons de Stremio**, con puntaje de IMDb,
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
- `src/pages/` — Inicio, Películas/Series (`discover/BrowsePage`, filas) y Descubrir (grilla), Buscar, Detalle, Reproductor, Historial, Tu año, Calendario, Vos (con Mi lista), Ajustes
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
  Las listas "Top IMDb" se sacaron en la v0.13 (pedido del usuario). Wikipedia limita pedidos (429).
  La caché de imágenes del SW solo guarda respuestas CORS (las opacas llenaban la cuota de Chrome).
- v0.6.0 hecha: Tema 1 / Tema 2 (`lib/theme.ts`, `theme2.css`, `components/Theme2Layout.tsx`; `data-theme="2"`
  en `<html>`, espejo en localStorage `sp-theme`). Lo nuevo tiene que usar las variables CSS (`--bg-2`, `--accent`,
  `--on-accent`, `--radius`…) para heredar el Tema 2; ítems de menú nuevos van también en `RAIL`/`TABS`.
  Addons: `catalogPrefs`/`catalogRows` (Inicio y Descubrir usan `useCatalogRows`), `stremioApi` (api.strem.io con CORS).
  TV: `platform`, `externalPlayers`, `idle`, `screensaver`, `osk`, `online`; en Ajustes `data-advanced` / `<Advanced>`
  marca lo avanzado. El asistente inicial tapa la pantalla en un perfil nuevo: los tests de Playwright lo saltean
  con `.ob-skip`.
- v0.7.0 hecha (se sacó en la v0.24): **TV en vivo** (`lib/liveTv.ts`, `pages/LiveTv.tsx`, `liveTvStore` en store). Lista
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
  El usuario NO quiere títulos en español: solo sinopsis y datos; el badge de IMDb va arriba a la derecha.
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
  `sourceRules.adaptQuality` (tope de calidad por `navigator.connection`; **se sacó en la v0.14.1**: el usuario usa
  siempre 1080p y no quiere que se baje a 720p), `lib/shortcuts.ts` (tabla única de
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
  (estrenos, región AR); Películas = `pages/discover/MoviesHero.tsx` (desde la v0.12 `DiscoverHero.tsx`; `full`, con `Top10Row`
  y su prop `title` encimado). Tráileres sin interfaz de YouTube: `ytPlayerState` (`lib/hoverTrailer.ts`) y el
  iframe se muestra recién con estado 1 (reproduciendo). Click/OK en `.hero-pause` pausa; `.hero-actions` tiene un
  `onKeyDown` que manda ↑ a la pausa (si no, ganaba el riel). En Chromium headless el tráiler no llega a reproducir.
  Con el Tema 1 se fueron el atajo `T` y la barra inferior con "Más" (`BAR`/`MORE`); `diagnostics` manda `theme: '2'`
  fijo porque el servidor espera el campo. Pendiente preguntar si el celular del Tema 2 quiere la hoja "Más".
- v0.12.0 hecha: **Series con la portada grande** igual que Películas. `MoviesHero` pasó a
  `pages/discover/DiscoverHero.tsx` (prop `type`: `movie` | `tv`, con `key` para que reinicie al cambiar de menú) y
  `useTrendingMovies` a `useTrendingOf(type, …)`. Desde la v0.22.1 las series no muestran duración. A las series muy nuevas a veces les falta el IMDb en Cinemeta: se deja así.
- v0.12.1 hecha: **Buscar sin saltos**. Cada grupo conserva los resultados anteriores mientras carga (`.is-stale`,
  atenuado, `aria-busy`); esqueletos solo en la primera búsqueda (`SKELETONS = 12`). `usePeople` devuelve `stale` y
  `PeopleRow` tiene su propio esqueleto redondo (`CastSkeleton`, mismo alto que `.cast-card`); `Row` acepta `stale`.
  Queda un solo corrimiento inevitable: cuando la búsqueda nueva no tiene personas, la fila se cierra.
- v0.12.2 hecha: **subtítulos automáticos prendidos de fábrica** (`autoSubtitles: true`). Migración de una sola vez
  en `hydrateStores` con la marca `settings.autoSubsMigrated` (si el usuario los apaga después, se respeta).
- v0.13.0 hecha: **portada sin tráiler** (el usuario lo quiere solo al pasar por los pósters) estilo Netflix/Disney+:
  `pages/home/HeroCarousel.tsx` + `HeroInfo.tsx`, estilos en `pages/home/hero.css` (clase `.portada`). Inicio =
  banner redondeado tipo Disney+; Películas/Series = billboard a todo el ancho con el Top 10 encimado. Avanza cada
  8 s (reloj = animación CSS del indicador), se frena con hover/foco/pausa/reduced-motion. Logo de la portada en idioma
  original. Se fue el ajuste `heroTrailer`. **Filtros** nuevos: `pages/discover/FilterBar.tsx` (barra pegajosa,
  géneros en chips, chips activos), `FilterPanel.tsx` (panel lateral / hoja en celular, `role="dialog"`, `#root`
  inert), `filters.css`; helpers `panelFilters`/`withoutFilter`/`clearAll` en `lib/discoverFilters.ts` (misma URL).
  Se sacaron las listas curadas "Mejor puntaje IMDb" (`isRemovedList` limpia filas viejas de Inicio).
- v0.14.0 hecha: mejoras de UX de `research/ux-funciones.md` (en el scratchpad de la sesión) y arreglos de las
  auditorías. **Paleta: se queda la actual** (el usuario no quiso ninguna de las 5). Hechas U1–U8, U10, U12–U17,
  U20, U23–U26, U29–U31, U34, U35, F5, F13 y F17.
  - U11 (Películas/Series como página de filas) queda para más adelante.
  - Descartadas: U9, U18, U19, U21, U22, U27, U28, U32, U33 y el resto de las F. En la ficha (U16) **sin
    "Compartir"**. Los actores quedan donde estaban (U15 solo pasa a pestañas el resto).
  - Ficha: `pages/detail/` (DetailTabs con `?tab=`, DetailActions + MoreMenu, EpisodesPanel, HeroTrailer +
    `useYtPlayer`, TrailerPlayer). Las pelis abren en la pestaña "Fuentes". El tráiler de fondo usa el ajuste
    `hoverTrailer` y solo se muestra con estado real de YouTube.
  - Reproductor: `pages/player/` (VolumeControl, SeekPreview/`scrub`, NextCard con imagen, QuickSettings,
    `videoFit` con la tecla Z, PostPlay "Más como esto", `useTouchGestures`, `fullscreen`).
  - Inicio/TV: `home/useDirectPlay` (play directo), `FocusBillboard`, `layout-v14.css`, `rows.css`. U26 = hub "Vos"
    (`pages/Me.tsx`, `me.css`) con historial, Tu año, Diario, Metas y Calendario.
  - Buscar: `search/` (sugerencias, BestResult) y `lib/voice`, `lib/searchResults`.
  - Interfaz: `lib/viewTransition`, y `uiScale` (zoom de CSS; no se aplica al reproductor).
  - Datos: `lib/storeSync` (pestañas), `lib/abort`, `lib/watchStats`, `lib/addonKey`.
  - **Filas apaisadas (U10)**: `catalogPrefs.shapes` (`rowShape`/`setRowShape`, solo se guarda lo que difiere de
    fábrica; las de TMDB `tmdb:foryou`/`tmdb:because`/`tmdb:trending-week` son apaisadas de fábrica), `useRowShape`,
    `PosterCard landscape`, `components/landscape-card.css`, `lib/titleArt.ts` (logo de metahub, `useNearOnce`).
    Se cambia en Ajustes → Catálogos (botón "Apaisada").
  - Filtros (U12): en PC el orden no va como chip (solo el botón "Ordenar"; `keepSort` en el panel); en el
    celular sí, porque ahí el botón no está.
  - **Typecheck con `npx tsc --noEmit`, nunca `tsc -b`**: emitía `.js` al lado de los `.tsx` y Vite/vitest los
    tomaban primero. Ahora `tsconfig.json` tiene `noEmit`.
- v0.14.1 hecha: se sacó "Calidad según la conexión" (`lib/network.ts`, `adaptQuality`, aviso `player-net-note`):
  siempre se recomienda la calidad preferida (el usuario usa siempre 1080p). No volver a agregar un tope por conexión.
- v0.15.0 hecha: **U11, Películas/Series como página de filas** (Inicio sigue con los catálogos de los addons).
  `pages/Discover.tsx`: sin parámetros en la URL → `discover/BrowsePage.tsx`; con cualquiera (`wantsGrid`) →
  `DiscoverGrid` (la grilla con filtros; "Explorar todo" = `?all=1`, y limpiar filtros también deja `all=1`).
  Lógica pura en `lib/browseRows.ts` (+ test), pedidos en `discover/browseData.ts`. Filas en este orden:
  Top 10 en Argentina (TMDB `discover` con `watch_region=AR` + plataformas `AR_PROVIDERS`, por popularidad;
  sin TMDB, "Popular" de Cinemeta y el título cambia a "Top 10 … populares"), Bien calificadas (IMDb ≥ 7, dos
  páginas de Cinemeta), Drama/Suspenso/Ciencia ficción/Comedias (**Cinemeta**, por el badge de IMDb) y
  Argentinas (TMDB `with_origin_country=AR`, solo con TMDB). Ningún servicio sabe qué se mira por país: el Top 10
  es aproximado. `discover/BrowseHero.tsx` + `browse.css`: portada fija (`data-focus-billboard`) que sigue al
  póster (mouse/foco, reusa `Layer`/`cardTarget` de `FocusBillboard`) y a los 3 s pone el **tráiler con sonido**
  (pedido del usuario); si el navegador lo bloquea, sigue mudo y el botón / tecla M lo activa
  (localStorage `sp-browse-muted`). `suppressHoverTrailer()` (`lib/hoverTrailer.ts`) apaga el tráiler chico de
  los pósters mientras está la página. Se borró `DiscoverHero.tsx`; `TmdbHero` variante `full` quedó sin uso.
- v0.15.1 hecha: `.dev.vars` / `.env` en `.gitignore` (keys locales de wrangler).
- v0.16.0 hecha: **subtítulos online en latino (25)**. `functions/api/subs/[[path]].ts` (rutas `_status`,
  `search?imdb&type[&s&e]`, `sd/<id>` y `os/<id>`; devuelve el archivo crudo y el cliente lo pasa a VTT con
  `loadSubtitle`), `functions/_zip.ts` (lector de zip con tope contra zip bomba). SubDL primero (el código `ES` no
  distingue latino: `spanishVariant` mira release/comentario/autor → `spl`/`spa`/`spn`; packs de temporada con
  `pickEntry`); los archivos se piden primero sin key (300/día por IP) y con key si da 429/403. OpenSubtitles solo si
  SubDL no trae nada (`ea` = latino). Caché de Cloudflare: búsquedas 12 h, archivos 30 días. Cliente:
  `lib/onlineSubs.ts` (`fetchOnlineSubs`, `ONLINE_MAX = 4`, `releaseScore`), efecto en `useSubtitles.ts` solo si
  el español está en los idiomas. `SubOption.latino` + `isLatino`/`latinoBonus` en `subtitlePrefs.ts`: el latino
  gana la elección automática; el de España (`spn`) nunca se elige solo. Secretos: `SUBDL_KEY` (ya cargado) y
  opcionales `OPENSUBTITLES_KEY`/`_USER`/`_PASS`. Las keys nunca en el código ni en el chat.
- v0.16.1 hecha: binding D1 `DB` (base `series-pelis`) en `wrangler.toml`. **Los bindings van en `wrangler.toml`**:
  con ese archivo el panel de Pages desactiva "Add" en Bindings. Los secretos sí van en el panel. El KV `REPORTS`
  nunca se enlazó (está comentado). Secreto `ADMIN_KEY` para arrancar el login (lo carga el usuario).
- v0.16.2 hecha: SubDL devuelve `url: "/subtitle/<id>.zip?api_key=…"` (con la key): el id se saca con
  `\.zip(?:[?#]|$)`, nunca se reenvía la url. `status: false` = error (`SourceError`, 502 con `detail`, sin caché).
  `_status` va antes de `crossSite`. Descarga sin key anda (200); el reintento con key usa `?api_key=`.
- v0.17.0 hecha: **login "Código de casa" + sincronización en D1**. Servidor: `functions/_auth.ts` (tablas que crea
  la app con `ensureSchema`, sesiones con hash en la cookie `__Host-sp_s`, `sameSecret`, topes `overLimit`),
  `functions/api/auth/[[path]].ts` (setup del admin con `ADMIN_KEY`, invitaciones, emparejamiento de 6 dígitos,
  casas y aparatos), `functions/api/sync.ts` (GET con cursor, POST de hasta 300 filas, gana el `u` más nuevo;
  alcance `global` solo para el admin) y `functions/api/_middleware.ts` (sesión obligatoria en `/api/tmdb` y
  `/api/subs` salvo `_status`). Cliente: `lib/auth.ts` (`useAuth`, estado inicial desde la caché `sp-auth`;
  404 o respuesta no JSON en `/me` = `disabled`, así anda `npm run dev`), `lib/syncCore.ts` (lógica pura: sombra +
  pendientes, `enforceReadOnly` vuelve los addons de un no-admin a lo del servidor), `lib/cloudSync.ts`
  (`ADAPTERS`: qué se sincroniza y con qué alcance; `flushCloudSync` antes de salir), `components/AuthGate.tsx`,
  `pages/auth/` (Login, JoinPage `/unirse#código`, LinkDevice `/vincular`), Ajustes → Casa (`HouseSettings`,
  primera sección) y Casas (`HousesSettings`, solo admin). Tests con un D1 falso de `node:sqlite`
  (`lib/d1.testutil.ts`, `authFunction.test.ts`, `syncCore.test.ts`). Una tienda nueva que se sincronice = una
  línea en `ADAPTERS` (y su `store` en `SYNC_STORES` del servidor).
  Arreglos de la revisión de seguridad: **admin por aparato** (`sessions.is_admin`, solo lo pone `setup`; la casa
  principal sola no alcanza), vincular en dos pasos (`pair/info` con ciudad/país de `request.cf`, después
  `pair/approve` atómico con `UPDATE … RETURNING`), sesión de 2 años como máximo (`MAX_SESSION_AGE_MS`), entrar de
  nuevo borra la sesión vieja, topes de sync (`MAX_VALUE`, `PUSH_LIMIT`, `HOUSE_MAX_ROWS/BYTES`, 507), `readText`
  con tope de bytes, IPv6 por /64 en `clientIp`, `gatePath` en el middleware. Columnas nuevas en tablas que ya
  existen = `ADDED_COLUMNS` (ALTER que ignora "duplicate column"). Los previews de Pages usan la misma D1.
- v0.17.1 hecha: un aparato **que no es del admin** que sale de la casa o lo sacan (paso de `in` a `out`) pierde los
  addons: `forgetAddonData()` en `store.ts` (addons → Cinemeta, `lastSource`, `catalogPrefs`, `sp-manifest-checked` y
  `clearCache()`), llamado desde `onAuth` de `cloudSync.ts` después de frenar el motor (`shouldForgetAddons`). Las
  **invitaciones no vencen** (decisión del usuario: se dejan como están). Base D1 aparte para las previews: sí
  (falta el id de la base `series-pelis-preview`).
- v0.18.0 hecha (rama `claude/perfiles-v0.18`): **perfiles** variante D. `lib/profileModel.ts` (puro: `MAIN_PROFILE`,
  `MAX_PROFILES = 6`, `PROFILE_COLORS`, `cleanProfile`, `profileStorageKey` → `p:<id>:<store>`; el principal usa
  las claves de siempre), `lib/profiles.ts` (perfil activo en localStorage `sp-profile`, fijo durante la página;
  `sp-profile-picked` en sessionStorage; `openProfilePicker`), `lib/profileSwitch.ts` (`switchProfile` = flush →
  `stopCloudSync` → recarga; `initProfileWatch` borra los datos de un perfil que desaparece). Stores con
  `perProfile: true`: progress, watchlist, ratings, notInterested, diary, goals. `profilesStore` es de la casa.
  Sync: dos estados en IndexedDB (`state` compartido y `profile:<id>`; `splitState` migra el de la v0.17),
  GET `?part=shared|profile&profile=`, POST `?profile=`; una lápida en `profiles` borra `profile:H:K` en el
  servidor y rechaza lo que suba después. UI: `pages/profiles/` (ProfileGate, WhoIsWatching con
  `AUTO_ENTER_S = 10`, ProfileEditor, `profiles.css`), `components/ProfileAvatar.tsx`, cabecera de Vos, avatar
  en el riel. El protector avisa al cerrarse con `SCREENSAVER_CLOSED`. Sin PIN, sin perfil de chicos ni invitado.
- v0.18.1 hecha: arreglos de la revisión de seguridad de perfiles. El tope de la casa en `sync.ts` usa un rango
  (`scope >= 'profile:H:' AND scope < 'profile:H;'`), **nunca `LIKE`** (no usa el índice y recorre la tabla).
  Tras el INSERT se repite el DELETE del perfil subido si tiene lápida (carrera con un borrado). Cliente: para
  cambiar de perfil va `persistProfileChoice` (solo localStorage) + recargar; `setActiveProfileId` es solo para
  `hydrateStores`. `freezeProfileWrites()` frena las escrituras de los stores por perfil mientras se borra el activo.
- v0.18.2 hecha: **tope de 6 perfiles también en el servidor** (`MAX_PROFILES` y `overProfileCap` en `sync.ts`,
  igual al de `profileModel.ts`; un test vigila que coincidan). La imagen del avatar **no se limita** a ciertos
  sitios (decisión del usuario: cualquier https).
- v0.19.0 hecha (rama `claude/android-tv-v0.19`): **app de Android TV / Fire TV** en `tv-app/` (Capacitor 8 con
  `server.url` = el sitio; `package.json` propio, así el build de Cloudflare no cambia). La versión del APK sale de
  `tv-app/package.json` (0.19.0 → versionCode 19000): **subirla junto con la raíz**. Nativo:
  `MainActivity.java` (config en `load()`, User-Agent `SeriesPelisApp/<v>` + ` AndroidTV` en televisores,
  Atrás → `window.__spNativeBack()`, si devuelve falso la app va al fondo; `CookieManager.flush()` en `onPause`) y
  `SpNativePlugin.java` (`keepAwake`, `exitApp`, y traduce los enlaces `intent:` de `externalPlayers.ts`: solo
  http/https, sin componentes). Web: `src/lib/native.ts` (`initNative` en `main.tsx`, `nativeExit` en Inicio,
  `nativeKeepAwake` en `useWakeLock`). Íconos/banner/splash generados del favicon. `android/.gitignore` deja afuera
  `assets/public` y `capacitor.config.json`: antes de gradle va `npx cap sync android`. APK: workflow
  `android-tv.yml` (artifact; etiqueta `tv-v*` → Release `series-pelis-tv.apk` para Downloader). Firma con los
  secretos `ANDROID_KEYSTORE_BASE64` / `_PASSWORD` / `ANDROID_KEY_ALIAS`; **nunca commitear la llave**.
- v0.20.0 hecha (rama `claude/android-tv-v0.20`): **reproductor nativo** Media3 1.10.1 en la app de TV, como
  vista encima del WebView en `MainActivity` (no otra Activity: el JS sigue corriendo). **La web decide, Android
  reproduce**: contrato en `src/lib/nativePlayer.ts` (`playerOpen` / `playerUpdate` / `playerSubtitleData` /
  `playerClose` + evento `player`: ready, progress, tracks, audioPicked, subPicked, next, ended, closed, error).
  `getInfo().player` dice si el APK lo trae (`probeNativePlayer`; la v0.19 no → reproductor de la web).
  Web: `pages/player/NativePlayer.tsx` (`NativePlayerView`, sin interfaz propia: subtítulo automático, segmentos,
  `creditsPlan`, progreso, siguiente episodio) y `nativeHelpers.ts` (+ test); `Player()` → `PlayerChoice`.
  Al pasar de episodio la vista se remonta y Android **no se cierra** (`closeTimer`: el cierre se posterga y la
  vista nueva lo cancela); los eventos se ignoran hasta el `ready` del video nuevo. Subtítulos externos: la web los
  baja con `loadSubtitleText` (con la cookie de sesión, sin SDH) y manda el VTT; los del video son `emb:<g>:<t>`.
  Si Android da `error`, sigue `PlayerView` desde esa posición (prop `notice`). Ajuste `nativePlayer` (por aparato,
  prendido de fábrica, solo se ve en la app). Constantes compartidas y el contador del "¿Seguís viendo?" en
  `pages/player/autoNext.ts`.
  Android (`tv-app/android/…/tv/`): `NativePlayer.java` (vista encima del WebView; `playerOpen` con uno abierto
  cambia el video y **borra lo del episodio**: intro, resumen, `nextAt`, `nextLabel`, subtítulos; por eso la web
  manda todo recién con el `ready`), `VttParser.java`, `SubtitleTextView.java`, `SpNativePlugin` (`player: true` en
  `getInfo`, métodos `player*`, evento `player`), `MainActivity` (las teclas y Atrás van primero al reproductor),
  `res/layout/sp_player*.xml`. Sin cabeceras falsas; un `.m3u8` va como HLS. Sin probar todavía en una TV real.
- v0.21.0 hecha (rama `claude/android-tv-v0.21`): **actualizador + filas del inicio de Android TV**. Contrato en
  `src/lib/native.ts` (`getInfo` suma `update`, `home`, `fireTv`; `updateCheck`/`updateInstall` + evento `update`;
  `homeSync`; `takeLaunch` + evento `open`). Web: `lib/appUpdate.ts` (estado, "Después" = 24 h por versión en
  `sp-app-update-later`), `components/AppUpdateToast.tsx`, Ajustes → App de TV (`settings/AppSettings.tsx`, solo
  `isNativeApp()`), `lib/nativeHome.ts` + `components/NativeHomeSync.tsx` (Seguir viendo/siguiente/nuevo del perfil
  activo, cada 5 s como mucho; solo https en imágenes), `lib/nativeLaunch.ts` +
  `components/NativeLaunch.tsx` (solo rutas `/detail/<movie|series>/<id>`; `play=1` = reproducir; si el perfil
  del enlace es otro, `sp-pending-launch` en sessionStorage + `switchProfile`; `PROFILE_FROM_LAUNCH` cierra el
  "¿Quién está mirando?"). Android: `AppUpdater.java` (GitHub `releases/latest` sin token, etiqueta `tv-vX.Y.Z`,
  asset `series-pelis-tv.apk`, solo hosts de GitHub por https, tope 200 MB, verifica paquete, versionCode y **misma
  firma**; 6 h de caché, 15 min si falló; instalador clásico ACTION_VIEW + FileProvider `updates/`),
  `HomeRows.java` (tvprovider 1.1.0: Watch Next CONTINUE/NEXT/NEW; lo que el usuario saca de la
  fila no vuelve salvo que avance >30 s o cambie), `DeepLink.java` (`seriespelis://open?path=&profile=`, sin
  BROWSABLE, sin `..` ni `%2e`/`%2f`). El workflow exige etiqueta = versión de `tv-app/package.json`.
  **Fire TV**: sin filas (el "Continuar viendo" de Amazon pide integración de catálogo con Amazon); `home` es falso.
  **Sin canal "Mi lista"** en el inicio de la TV (el usuario lo sacó): solo "A continuación". El repo era privado: el usuario eligió **hacerlo público** para
  que el actualizador y Downloader lean Releases. Sin probar todavía en una TV real.
- v0.22.0 hecha (rama `claude/flix-v0.22`): **la app pasa a llamarse Flix** (pedido del usuario) con el ícono **2B**
  (F de neón lavanda `#c4b0ff` sobre violeta oscuro, con brillo y estrellitas). Los íconos (favicon, PWA, mipmaps,
  banner, splash) salen de `scratchpad/flix-assets/gen.py` (Chromium headless + PIL; si se pierde el scratchpad, el
  dibujo está en `public/favicon.svg`). Android: paquete **`ar.flix.tv`** (antes `ar.seriespelis.tv`; se cambió
  porque todavía no había nada instalado), esquema `flix://`, User-Agent `FlixApp/<v>`, APK **`flix-tv.apk`**
  (Release con etiqueta **`flix-v0.22.0`**: desde la v0.22 las etiquetas son `flix-vX.Y.Z`, pedido del usuario; el
  workflow y `TAG_RE` de `AppUpdater.java` las exigen así). El logo del riel usa `/favicon.svg`. **Se quedan con el nombre viejo**: el
  sitio `series-pelis.pages.dev`, el repo, el proyecto de Cloudflare y la D1, los nombres de IndexedDB
  (`series-pelis-*`), las claves de localStorage, el campo `app: 'series-pelis'` de las copias exportadas (así se
  importan las viejas) y `OS_AGENT` de OpenSubtitles. Las notas de v0.19–v0.21 con `ar.seriespelis.tv`,
  `SeriesPelisApp`, `seriespelis://` y `series-pelis-tv.apk` son de antes del cambio.
- v0.22.1 hecha (rama `claude/onboarding-v0.22.1`): **asistente de una sola pantalla** (`components/Onboarding.tsx`):
  idioma del audio, subtítulos y "Activarlos solos", botón "Empezar" (lleva la clase `ob-skip` para Playwright). Sin
  pasos de addons/TMDB/Listo (pedido del usuario: TMDB viene del sitio, addons los pone el admin). Los idiomas siguen
  **por casa** (decisión del usuario). Con login espera la primera sincronización (`useHouseReady`: `lastSync`, error o
  10 s) para no mostrar los de fábrica ni que el servidor pise lo elegido; mientras, deja `.ob-pending` para que
  `TvHints` no se adelante. **Series**: sin duración en minutos (ficha, `buildInfo`, `TmdbHero`; las pelis sí) y
  `seriesYear`/`seasonCount` (`lib/format.ts`): con una sola temporada "2026–" → "2026". Los pósters, Buscar y la
  portada de Inicio (catálogo de Cinemeta) no saben las temporadas y siguen con el guion.
- v0.22.2 hecha (rama `claude/anio-series-v0.22.2`): donde no se saben las temporadas (`PosterCard`, Buscar,
  portada de Inicio, `HoverTrailer`, `PostPlay`, protector) `seriesYear(x)` saca el guion si la serie **arrancó este
  año** (el usuario aceptó que a veces una serie con dos temporadas en el mismo año quede sin guion). Con las
  temporadas conocidas (ficha, `buildInfo` con TMDB) manda el conteo real.
- v0.22.3 hecha (rama `claude/sin-spoilers-v0.22.3`): **`spoilerFree: true` de fábrica** (solo ese; `spoilerUnstarted`
  sigue apagado). Migración **una vez por casa** con la marca `spoilerDefaulted` (está en `HOUSE_SETTINGS`, se
  sincroniza): `applyHouseDefaults()` (`store.ts`) corre en `run()` tras bajar lo de la casa, o en `onAuth` sin
  login. Si la apagan, se respeta. Arreglos de sync: `fieldsAdapter` tiene `newKeysAreDefaults` (un campo que el
  aparato nunca anotó sube con `u = 0`, así gana el servidor) y `upgradeSchema` + `HOUSE_SCHEMA` en `cloudSync.ts`
  (resetea una vez el cursor compartido: las versiones viejas tiran las filas de campos que no conocen).
  **Al sumar un campo a `HOUSE_SETTINGS`, subir `HOUSE_SCHEMA`.**
- v0.22.4 hecha (rama `claude/atras-ficha-v0.22.4`): **botón de atrás** (`DetailBack` en `Detail.tsx`, `.detail-back`
  en `detail-v14.css`) arriba a la izquierda de la portada de la ficha, **solo en la ficha** y **no en la TV**
  (`html[data-tv]` lo oculta; decisión del usuario). `useGoBack`: sin historial va a `/`. En PC la portada tiene
  `padding-top: 68px` para que no tape el título cuando no hay póster.
- v0.22.5 hecha (rama `claude/inicio-orden-v0.22.5`): **Inicio** = portada → Seguir viendo → **Top 10 de hoy** →
  Para vos → Porque viste → Tendencias → listas → catálogos (pedido del usuario). **Sin fila "Mi lista"** (ya está en
  el riel): `HOME_VIRTUAL_ROWS` quedó vacío (el mecanismo de filas propias sigue, con su test), se fueron
  `WatchlistRow`, `VirtualRow` y `unstartedWatchlist`.
- v0.22.6 hecha (rama `claude/canales-tv-v0.22.6`): **TV en vivo con lista fija** (`LIVE_CHANNELS` en `lib/liveTv.ts`;
  ya no se baja el M3U de iptv-org). Pedido del usuario: TN, C5N, Crónica, Canal 26, LN+, A24, TV Pública, Encuentro,
  Cine.AR, DeporTV, Telefe, El Trece, El Nueve, América y Music Top. **Solo señales oficiales**: HLS del canal
  (Canal 26 y Music Top de Telecentro, América de qaotic) o el vivo de su **canal oficial de YouTube**
  (`youtube` = id `UC…`, embed `live_stream?channel=` en youtube-nocookie con `useYtPlayer`; componente `YoutubeLive`
  en `LiveTv.tsx`, sin eventos del mouse para que las teclas queden en la página). Telefe, El Trece y El Nueve en las
  listas de IPTV son restreams de IPs sueltas por http: **no se usan**. El YouTube de la TV Pública ahora se llama
  "Canal Siete" (@TVPublicaArgentina). LN+ y la TV Pública tienen varios vivos y YouTube a veces no elige uno para el
  embed ("Video no disponible"); Encuentro, Cine.AR, Telefe y El Trece no transmiten siempre (`notAlways`).
  **DeporTV quedó afuera**: el stream de cont.ar (streamlock) no anda y no tiene vivo en YouTube. Categorías:
  Noticias, Públicos, Aire, Música. En Chromium headless ni YouTube ni H.264 reproducen: probar en un navegador real.
- v0.23.0 hecha (rama `claude/vos-historial-v0.23.0`): **Vos** = accesos Historial → Calendario → Tu año (en ese
  orden; sin Diario ni Metas) y **Mi lista completa en grilla** (`MyListSection` en `pages/MyList.tsx`) como lo
  principal. **Mi lista fuera del riel y de las pestañas**; `/list` → `/me`, sin atajo G+L, la escalera de Atrás vale
  en `/me`. **Historial + Diario unificados**: `HistoryFeed` usa el formato del Diario (`groupHistory` en
  `lib/historyGroups.ts`, clases `diary-*`; prop `monthHeading`), datos del progreso como siempre; se borró
  `pages/Diary.tsx` y `/history/diary` → `/history` (el `diaryStore` sigue: lo usan Metas y la importación).
  **Tu año** sin mapa de actividad, racha, día favorito, "De punta a punta", tarjeta de películas ni modo historia
  (se borraron `year/YearStory.tsx`, `year/shareCard.ts` y `lib/yearStory.ts`). El Calendario queda como estaba.
- v0.24.0 hecha (rama `claude/perfiles-avatares-v0.24.0`): **se sacó TV en vivo** entera (`lib/liveTv.ts`,
  `pages/LiveTv.tsx`, `liveTvStore`, menú y atajos; `/tv` → Inicio). **Perfil arriba del riel** (`ProfileButton` en
  `Theme2Layout.tsx`, en lugar de la sigla; en el celular, en la cabecera): abre `openProfilePicker()`. Perfiles ya no
  está en Vos. **Avatares fijos**: `lib/avatars.ts` (80, grupos Animales/Personajes/Criaturas, `isAvatarId`,
  `avatarUrl`, `randomAvatar`) + `public/avatars/<id>.webp` (Fluent Emoji 3D de Microsoft, licencia MIT, 160 px;
  un test vigila que coincidan); el SW los guarda con CacheFirst (`avatars`). `Profile.avatar` reemplaza a `art`
  (`cleanProfile` descarta `art`); el usuario NO quiere el fondo de una peli como avatar. **Top 10 = tendencias
  de la semana de TMDB** (`trendingPath`/`cleanTrending`, clave de caché `top10w|…`): JustWatch no tiene API
  pública. **Ficha**: se fueron las pestañas Extras y Detalles (`DetailPanels.tsx`, `WikiTrivia`, `lib/wikiTrivia`,
  `KeywordChips`, `getKeywords`, `extrasFromTmdb`); en las pelis el reparto va arriba de las pestañas (en las series
  sigue abajo). **Tráiler**: `pickTrailer(videos, original_language)` con `trailerLangScore` en `lib/tmdb.ts`:
  latino subtitulado > latino doblado > España subtitulado > original (`ORIGINAL_TRAILER`) > España doblado; si la
  peli es en español, gana el de audio latino. `hoverTrailer` usa el de TMDB si supera al original.
- **Decisiones para la v0.17 (reemplazan el reparto del plan de abajo)**: addons y TorBox **iguales para todas las
  casas**, solo los cambia el admin (opción A). Ajustes generales (subtítulos, idiomas, autoplay, saltar intro, sin
  spoilers, reglas de fuentes) **iguales en toda la casa**; lo físico (modo TV, tamaño de la interfaz, protector,
  reproductor externo, servidor local de Stremio, búsquedas recientes) queda **por aparato** (confirmado). Por perfil (en la v0.17,
  un perfil "principal" por casa): historial, seguir viendo, mi lista, estrellas, diario y metas. Datos locales:
  se mezclan solos (gana el más nuevo). Login obligatorio con D1, también para `/api/tmdb` y `/api/subs`. Casas e
  invitaciones se manejan desde la app (Ajustes → Casas).
- **Plan acordado (pedido "1, 2 y 3")**: v0.17.0 login "Código de casa" (opción A) + sincronización en D1
  (investigación en `scratchpad/v15/login.md`); v0.18.0 perfiles variante D (investigación en
  `scratchpad/v15/perfiles.md`): en la TV "¿Quién está mirando?" al abrir y tras el protector (entra solo a los 10 s),
  en PC/celular recuerda el último; con un solo perfil, igual que hoy; avatar = inicial + color o fondo de una peli.
  Compartido por casa: addons, debrid y demás. Por perfil: historial, seguir viendo, lista, estrellas, no me interesa.
  Por aparato: idiomas, subtítulos, autoplay, sin spoilers, búsquedas, favoritos de TV en vivo, reglas de fuentes,
  filas de Inicio. Sin perfil de chicos ni invitado.
- Modo TV automático (128): ya existe desde v0.6/v0.9 (`detectPlatform`, `tvMode: 'auto'`). Pendiente que el
  usuario diga si su TV muestra "Este dispositivo parece una TV" y qué TV/navegador usa antes de tocar nada.
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
- Integración opcional con Trakt (por ahora no).
