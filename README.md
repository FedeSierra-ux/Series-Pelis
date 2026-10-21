# Flix

> Antes se llamaba Series-Pelis: el sitio, el repo y el proyecto de Cloudflare siguen con ese nombre.

Tu plataforma personal para ver pelis y series con **tus addons de Stremio**, el **puntaje de IMDb** a la vista
y un **historial** de todo lo que viste. Funciona en la PC, el celular y el navegador de la TV (se puede instalar como app).

## Qué hace (v0.10.0)

- **Más cómoda y más fácil de operar (v0.10)**: controles del sistema y ventana flotante en el
  reproductor (desde la v0.27.1 sin cambio de velocidad: siempre 1×), atajos de teclado con ayuda (`?`) y guía del control remoto en la TV,
  informes de errores opt-in (sin URLs ni keys) para que el dueño pueda ayudar a distancia, Ajustes con índice
  lateral y cabeceras de seguridad.
- **Más sólida en la TV (v0.9)**: texto más grande a tres metros, el foco se centra y se recuerda al volver,
  selectores que andan con el control remoto, aviso de versión nueva, "Continuar" / "Ver desde el principio" y
  "Marcar temporada como vista" en las series, y 40 bugs arreglados (reproductor, fechas, Descubrir, copia de seguridad).
- **Dos temas (v0.6)**: el clásico y el **Tema 2** (riel lateral, tarjetas redondeadas, barra abajo en el celular),
  en Ajustes → Apariencia.
- **Addons (v0.6)**: explorar los oficiales, activar o desactivar, gestor de catálogos (renombrar, ocultar,
  ordenar, fusionar) e **importar desde tu cuenta de Stremio**.
- **TV (v0.6)**: protector de pantalla, teclado en pantalla, más reproductores externos, modo sin conexión,
  asistente inicial (con login, una sola vez por casa desde la v0.26.2) y Ajustes esencial/avanzado.
- **Descubrir (v0.5)**: búsqueda al escribir, búsquedas recientes, personas y "juntos", filtros y orden,
  listas curadas (Oscar, mejor puntaje IMDb, sagas) y etiquetas clickeables en la ficha.
- **Pósters (v0.5)**: puntaje sobre el póster, etiquetas (episodio nuevo, Top 10…) y tráiler al pasar por encima.
- **Biblioteca (v0.5)**: tu puntaje con estrellas, "Para vos" con el porqué, "Ya no me interesa", modo sin spoilers,
  Tu año y metas y logros.
- **Reproductor (v0.4)**: vista previa al adelantar, sinopsis al pausar, aviso de escena post-créditos,
  "¿Ver el resumen?" si hace días que no ves la serie y **cambiar de fuente** sin perder el minuto.
- **Subtítulos (v0.4)**: cargar un archivo propio (o arrastrarlo), más estilo (letra, altura, contorno), ocultar SDH,
  forzados automáticos e idioma recordado por serie o peli.
- **Fuentes (v0.4)**: filtros por tamaño, códec, HDR/Dolby Vision y repetidos. Los clips cortos no cuentan en el historial.
- **TMDB (opcional)**: ficha en español con logo, reparto y páginas de actores, sagas, "Más como esto" y
  tráiler con subtítulos en latino primero. En Inicio y en Películas/Series: portada, Top 10 de la semana,
  "Porque viste…" y tendencias.
  Al pausar muestra quién actúa en el episodio.
- **Títulos en español latino (v0.28)**: con TMDB, los nombres de pelis y series van como en Netflix Argentina (los
  logos y los episodios, en el idioma original). Buscar encuentra por los dos nombres.
- **Catálogo** de Cinemeta (populares, nuevas y mejor puntuadas) y de cualquier addon que agregues.
- **Puntaje de IMDb** en pósters, portada y ficha.
- **Addons de Stremio**: pegás la URL del manifest y listo. Si tu addon (por ejemplo Torrentio) está configurado
  con Real-Debrid o TorBox, los streams llegan como enlaces directos y arrancan rápido (siempre van primero).
- **TorBox para todas las casas (v0.27)**: con Torrentio configurado con TorBox, lo que TorBox no tiene arranca por
  torrent mientras TorBox lo baja, y si falla aparece "Reproducir por torrent" (ver "TorBox para todas las casas").
- **Torrents sin debrid (v0.25)**: la app de Android (Android 9+) trae su propio motor de torrents, como Stremio. En la
  PC (desde la v0.29), con **Stremio Service** abierto: Flix lo encuentra solo y convierte lo que el navegador no puede
  abrir (MKV con x265, audio AC3/5.1), como Stremio Web (ver "Torrents en la PC").
- **Rediseño (v0.26)**: Inicio, Películas/Series, Buscar, ficha, reproductor y Vos con los ajustes de la auditoría visual
  (filas alineadas bajo la portada, fuentes con idioma y tamaño, episodios vistos atenuados, subtítulo que no tapa "Saltar" ni la tarjeta del siguiente episodio en el celular, desde la v0.26.1).
- **Ficha de las series** con pestaña **Detalles**: reparto, creación, países y dónde verla en Argentina.
- **Reproductor** propio: MP4/WebM directos y HLS (`hls.js`, se descarga solo si hace falta), subtítulos de los
  addons (convierte SRT a VTT), pistas de audio, siguiente episodio automático con la misma fuente.
- **Saltar intro / resumen / créditos** (tiempos de IntroDB), **siguiente episodio con cuenta regresiva**,
  "¿Seguís viendo?" y **temporizador para dormir**.
- **Subtítulos y audio** en tu idioma preferido, con estilo y retraso ajustables. Botón **Abrir en VLC**.
- **Elección automática de fuente** según calidad y palabras clave, y recuerda la fuente que usaste en cada serie.
- **Seguir viendo** (con opción de quitar) y **reanudar** donde quedaste. Fila con el siguiente episodio de tus series.
- **Calendario** de estrenos de tus series y resumen **Tu año**.
- **Historial** por mes y día (con el formato del diario), con filtros, estadísticas y "Deshacer" al quitar algo.
  Marcar episodios o pelis como vistas.
- **Mi lista** para guardar lo que querés ver: es lo principal de **Vos**.
- **Control remoto**: se navega con las flechas, Enter y Atrás (Fire TV / Android TV / navegador de la TV). Al volver
  de una ficha, el foco vuelve a la misma tarjeta y fila.
- **Copia de seguridad**: exportar e importar tus datos en JSON.

## Por qué carga rápido

1. Caché *stale-while-revalidate* en memoria + IndexedDB: al volver a abrir, la portada pinta en ~150 ms con lo
   último que viste y se actualiza sola en segundo plano.
2. Service worker (Workbox): pósters en caché por 30 días y catálogos de Cinemeta servidos al instante.
3. Pósters chicos (`poster/small`), `preconnect` a los servidores de imágenes y metadatos, carga diferida de filas.
4. La ficha se precarga cuando el foco o el mouse pasan por un póster.
5. Los streams se piden a todos los addons en paralelo y se muestran a medida que llegan.
6. El reproductor y `hls.js` se descargan recién al dar play.

## Uso

```bash
npm install
npm run dev       # desarrollo en http://localhost:5173
npm run build     # build de producción en dist/
npm run preview   # probar el build en http://localhost:4173
```

En **Ajustes → Addons de Stremio** pegá la URL de cada addon que uses (termina en `/manifest.json`; también sirve el
enlace `stremio://`).

### Torrents sin debrid

El navegador no puede bajar torrents por su cuenta. Según dónde mires:

- **Navegador (PC o celular)**: los torrents van por **TorBox** (ver abajo). Lo que TorBox ya tiene arranca enseguida;
  lo que no, TorBox lo baja y el video arranca solo cuando está listo ("TorBox lo está bajando…").
- **App de Windows** ([Flix para Windows](https://github.com/FedeSierra-ux/Series-Pelis/releases/latest/download/flix-pc-setup.exe)):
  como Stremio de escritorio. Elegís el torrent y reproduce, sin debrid y sin instalar nada más: trae su propio motor
  de torrents y convierte lo que Chromium no puede (AC3, DTS, 5.1). Ver [App para Windows](#app-para-windows-v030).
- **App de Android TV** (9+): motor de torrents propio (v0.25).
- Si en la compu está abierto **Stremio Service** (o Stremio), Flix lo usa solo, como en la v0.29.

En Ajustes → Reproductor → "Servidor de streaming" se puede poner otro servidor a mano.

### TorBox para todas las casas (Torrentio)

La key de TorBox va **dentro del addon** Torrentio: la carga una sola vez el administrador y llega sola a todas las
casas. La app nunca la guarda aparte.

1. En TorBox, entrá a [torbox.app/settings](https://torbox.app/settings) y copiá tu **API Key**. Para ~10 casas
   conviene el plan con más descargas activas a la vez (Pro); verificá los planes en torbox.app/pricing.
2. Abrí [torrentio.strem.fun/configure](https://torrentio.strem.fun/configure) y elegí:
   - **Providers**: los de fábrica (podés sumar MejorTorrent, Wolfmax4k o Cinecalidad para contenido en español).
   - **Sorting**: el de fábrica (por calidad). **Priority Language**: Latino (y Spanish, si querés).
   - **Exclude Resolutions**: CAM y Screener.
   - **Debrid Provider**: TorBox, y pegá la **API Key**.
   - **Options**: tildá **"Don't show debrid catalog"** (si no, en Inicio aparecen las descargas de la cuenta, que
     es de todas las casas). **No** tildes "Don't show download to debrid links": la app los usa para lo que TorBox
     todavía no tiene.
3. Tocá **Copy Link** y, desde el aparato del administrador, pegalo en **Ajustes → Addons de Stremio**. Si había un
   Torrentio sin debrid, sacalo: la app arma sola el que necesita para los torrents.
4. Ese link **lleva la key**: no lo pegues en chats ni lo muestres en capturas. Si se filtra, reseteá la key en
   TorBox y volvé a cargar el addon.

Cómo se comporta:
- **Listo para ver** (`[TB+]`): reproduce directo desde TorBox.
- **Tiene que descargarse** (`[TB download]`): con motor de torrents (app de Windows, app de Android 9+ o Stremio
  abierto en la PC) arranca por torrent y le pide a TorBox que lo baje para la próxima. En el navegador, TorBox lo baja
  y el video arranca solo cuando está listo (puede tardar unos minutos; Torrentio tarda hasta ~1 min en avisar).
- **Si TorBox falla**: cartel con el motivo y, si hay motor de torrents, el botón "Reproducir por torrent".

Para tener todo en español y las filas de tendencias, sacá una key gratis en
[themoviedb.org → Ajustes → API](https://www.themoviedb.org/settings/api) y pegala en **Ajustes → TMDB**
(sirve la "API Key" o el "API Read Access Token"). Queda guardada solo en tu navegador.
Si el sitio publicado tiene el secreto `TMDB_KEY` (ver abajo), no hace falta: TMDB ya viene activado para todos.

## Publicarla en Cloudflare Pages (gratis)

El repo ya trae todo lo que necesita Cloudflare:

- `wrangler.toml`: nombre del proyecto (`series-pelis`) y carpeta del build (`dist`).
- `functions/api/segments.ts`: el proxy `/api/segments` para saltar intros (se publica solo).
- `functions/api/tmdb/[[path]].ts`: `/api/tmdb/*` pide a TMDB con la key del secreto `TMDB_KEY`, así nadie tiene
  que cargar su propia key. Solo responde a la app (mismo sitio) y a las rutas que usa.
- `functions/api/subs/[[path]].ts`: `/api/subs/*` busca subtítulos en español (latino primero) en SubDL, con
  OpenSubtitles de respaldo, y guarda cada archivo en la caché de Cloudflare para que se baje una sola vez.
- `public/_headers`: los archivos de `/assets` (con hash en el nombre) se guardan un año; el service worker y el
  manifiesto se revisan en cada visita, así las actualizaciones llegan enseguida.
- `.node-version`: Node 22 para el build.
- Las rutas de la app (`/detail/...`, `/settings`…) abren bien aunque entres directo: sin `404.html`, Pages sirve
  `index.html` (modo SPA).

### Opción A — conectada a GitHub (se actualiza sola)

1. Creá una cuenta en Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Elegí el repo `Series-Pelis` y la rama `main`.
3. Framework preset: **None** (o *Vite*). Build command: `npm run build`. Build output directory: `dist`.
4. **Save and Deploy**. Cada push a `main` publica una versión nueva y cada PR tiene su propia URL de prueba.

### TMDB para todos (secreto `TMDB_KEY`)

1. En Cloudflare: **Workers & Pages** → `series-pelis` → **Settings** → **Variables and Secrets** → **Add**.
2. Tipo **Secret**, nombre `TMDB_KEY`, valor: la "API Key" o el "API Read Access Token" de TMDB.
   Cargalo en **Production** (y en **Preview** si querés que las URLs de prueba de los PR también lo tengan).
3. Volvé a publicar (**Deployments** → **Retry deployment**, o un push nuevo) para que la función lo tome.

Desde la PC también se puede con `npx wrangler pages secret put TMDB_KEY` (te pide el valor; no queda en ningún archivo).

La key nunca va en el repo ni llega al navegador. Si alguien carga su propia key en **Ajustes → TMDB**, se usa la suya.

### Subtítulos online en latino (secreto `SUBDL_KEY`)

Igual que `TMDB_KEY`: un secreto `SUBDL_KEY` con la key de https://subdl.com/panel/api. Para probarlo, abrí
`https://<tu-sitio>/api/subs/_status`: tiene que decir `"enabled":true`. Desde ahí, el reproductor suma solo los
subtítulos en español que encuentre (los que dicen "latino" primero; los de España quedan en "Otros idiomas").

Respaldo opcional: `OPENSUBTITLES_KEY` (un "API consumer" de opensubtitles.com) y, para pasar de 5 a 20 descargas
por día, `OPENSUBTITLES_USER` y `OPENSUBTITLES_PASS` de una cuenta aparte para la app.

### Opción B — a mano desde la PC

```bash
npx wrangler login
npm run build && npx wrangler pages deploy
```

### Después

Abrí `https://series-pelis.pages.dev` en la PC, el celular y la TV. En el celular: menú del navegador →
*Instalar app* / *Agregar a pantalla de inicio*. Tus addons, tu key de TMDB (si cargaste una) y el historial quedan en cada navegador
(hasta que llegue la cuenta con código de vinculación).

## App para Android TV / Fire TV (v0.19)

La carpeta `tv-app/` es una app de Android ([Capacitor](https://capacitorjs.com)) que abre
`https://series-pelis.pages.dev` a pantalla completa: aparece en el inicio de la TV con su banner, el botón
Atrás del control funciona como en cualquier app, la pantalla no se apaga mientras mirás y "Abrir en…" manda
el video a otro reproductor (VLC, MX Player, Just Player…). Las novedades de la web llegan solas; el APK solo
hay que reinstalarlo cuando cambia la parte nativa.

**Instalarla en la TV**
1. En la TV instalá **Downloader** (de AFTVnews) desde la tienda.
2. Habilitá "Instalar apps desconocidas" para Downloader (Fire TV: *Configuración → Mi Fire TV → Opciones
   para desarrolladores*; Android TV / Google TV: *Configuración → Apps → Seguridad*).
3. En Downloader escribí:
   `https://github.com/FedeSierra-ux/Series-Pelis/releases/latest/download/flix-tv.apk`
4. Instalá y abrí **Flix**. Vinculala con el código de la casa como cualquier aparato.

**Armar una versión nueva**: el workflow `.github/workflows/android-tv.yml` compila el APK en cada cambio de
`tv-app/` (queda como *artifact* de la corrida) y, al crear una etiqueta `flix-vX.Y.Z` (por ejemplo `flix-v0.22.0`),
lo publica en Releases.
Para que las versiones se instalen encima (sin desinstalar ni perder el login) el APK tiene que firmarse
siempre con la misma llave: secretos `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` y
`ANDROID_KEY_ALIAS` en *Settings → Secrets and variables → Actions*. La llave **nunca** va en el repo.

Compilar en la PC (con el SDK de Android y Java 21): `cd tv-app && npm install && npx cap sync android &&
cd android && ./gradlew assembleDebug`.

## App para Windows (v0.30)

La carpeta `desktop-app/` es una app de [Electron](https://www.electronjs.org) que abre
`https://series-pelis.pages.dev` (mismo login, perfiles e historial) y trae adentro un **motor de torrents**
(webtorrent) y la **conversión de video** (ffmpeg), como Stremio de escritorio: los torrents sin debrid se reproducen
sin instalar nada más.

**Instalarla**: bajá
[`flix-pc-setup.exe`](https://github.com/FedeSierra-ux/Series-Pelis/releases/latest/download/flix-pc-setup.exe)
(Windows 10/11, 64 bits) y abrilo. El instalador no está firmado: Windows SmartScreen avisa que la app "no es
conocida" → **Más información** → **Ejecutar de todos modos**. Se instala para tu usuario, con acceso en el escritorio
y en el menú Inicio, y **se actualiza sola** (Ajustes → App de Windows).

**Abrir en VLC / mpv / PotPlayer** (Ajustes → Reproductor → Reproductor externo): la app abre directo el programa
instalado, también con los torrents. Si no lo encuentra, avisa y deja el enlace copiado.

**Armar una versión nueva**: el workflow `.github/workflows/desktop.yml` arma el instalador en Windows en cada cambio
de `desktop-app/` (queda como *artifact*) y, con la etiqueta `flix-vX.Y.Z`, sube `flix-pc-setup.exe`, su
`.blockmap` y `latest.yml` al mismo Release que el APK de la TV. La etiqueta tiene que coincidir con la versión de
`desktop-app/package.json` (y con la de `tv-app/`): se suben juntas.

Probar en la PC: `cd desktop-app && npm install && npm start` (con `FLIX_URL=http://localhost:5173` usa el
`npm run dev` local). Pruebas: `npm test`. El ffmpeg que viene adentro es GPL (de `ffmpeg-static`).

Para probar localmente igual que en Cloudflare (con la función y los headers): `npm run build && npx wrangler pages dev`.

## Herramientas para Claude Code

- `.claude/agents/`: agentes de [agency-agents](https://github.com/msitarzewski/agency-agents) elegidos para este proyecto
  (frontend, streaming de video, UI/UX, performance, accesibilidad, etc.).
- `.claude/skills/reverse-engineer-anything` + `.mcp.json`: [rea](https://github.com/morluto/rea) para analizar apps y binarios.
- `scripts/install-claude-tools.sh`: instala todo **global** en tu Claude Code (todos los agentes + rea).
  Corrélo una vez en tu PC. Con `--project` actualiza solo lo de este repo.

## Roadmap

- **Pendiente de confirmar**: variantes del Tema 2 (negro OLED, acento a elección, color del póster).
- **Próximo**: cuenta con código de vinculación (como Netflix) y sincronización del historial en Cloudflare (Workers + D1).
- Importar addons desde la cuenta de Stremio.
- App para Fire TV / Android TV.
