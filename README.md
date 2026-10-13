# Series-Pelis

Tu plataforma personal para ver pelis y series con **tus addons de Stremio**, el **puntaje de IMDb** a la vista
y un **historial** de todo lo que viste. Funciona en la PC, el celular y el navegador de la TV (se puede instalar como app).

## Qué hace (v0.9.0)

- **Más sólida en la TV (v0.9)**: texto más grande a tres metros, el foco se centra y se recuerda al volver,
  selectores que andan con el control remoto, aviso de versión nueva, "Continuar" / "Ver desde el principio" y
  "Marcar temporada como vista" en las series, y 40 bugs arreglados (reproductor, fechas, Descubrir, copia de seguridad).
- **TV en vivo (v0.7)**: canales gratis de Argentina (aire, noticias, deportes y música) de la lista abierta de
  [iptv-org](https://github.com/iptv-org/iptv). Zapping con CH+/CH− o con los números del control, favoritos y
  pantalla completa. Se ocultan los canales de cable pago.
- **Dos temas (v0.6)**: el clásico y el **Tema 2** (riel lateral, tarjetas redondeadas, barra abajo en el celular),
  en Ajustes → Apariencia.
- **Addons (v0.6)**: explorar los oficiales, activar o desactivar, gestor de catálogos (renombrar, ocultar,
  ordenar, fusionar) e **importar desde tu cuenta de Stremio**.
- **TV (v0.6)**: protector de pantalla, teclado en pantalla, más reproductores externos, modo sin conexión,
  asistente inicial y Ajustes esencial/avanzado.
- **Descubrir (v0.5)**: búsqueda al escribir, búsquedas recientes, personas y "juntos", filtros y orden,
  listas curadas (Oscar, mejor puntaje IMDb, sagas) y etiquetas clickeables en la ficha.
- **Pósters (v0.5)**: puntaje sobre el póster, etiquetas (episodio nuevo, Top 10…) y tráiler al pasar por encima.
- **Biblioteca (v0.5)**: tu puntaje con estrellas, "Para vos" con el porqué, "Ya no me interesa", modo sin spoilers,
  diario, Tu año animado para compartir y metas y logros. "¿Sabías que?" con datos de Wikipedia.
- **Reproductor (v0.4)**: vista previa al adelantar, sinopsis al pausar, aviso de escena post-créditos,
  "¿Ver el resumen?" si hace días que no ves la serie y **cambiar de fuente** sin perder el minuto.
- **Subtítulos (v0.4)**: cargar un archivo propio (o arrastrarlo), más estilo (letra, altura, contorno), ocultar SDH,
  forzados automáticos e idioma recordado por serie o peli.
- **Fuentes (v0.4)**: filtros por tamaño, códec, HDR/Dolby Vision y repetidos. Los clips cortos no cuentan en el historial.
- **TMDB (opcional)**: ficha en español con logo, reparto y páginas de actores, sagas, "Más como esto" y
  dónde verla en Argentina. En Inicio: portada con tráiler sin sonido, Top 10 de hoy, "Porque viste…" y tendencias.
  Al pausar muestra quién actúa en el episodio.
- **Catálogo** de Cinemeta (populares, nuevas y mejor puntuadas) y de cualquier addon que agregues.
- **Puntaje de IMDb** en pósters, portada y ficha.
- **Addons de Stremio**: pegás la URL del manifest y listo. Si tu addon (por ejemplo Torrentio) está configurado
  con Real-Debrid o TorBox, los streams llegan como enlaces directos y arrancan rápido.
- **Reproductor** propio: MP4/WebM directos y HLS (`hls.js`, se descarga solo si hace falta), subtítulos de los
  addons (convierte SRT a VTT), pistas de audio, siguiente episodio automático con la misma fuente.
- **Saltar intro / resumen / créditos** (tiempos de IntroDB), **siguiente episodio con cuenta regresiva**,
  "¿Seguís viendo?" y **temporizador para dormir**.
- **Subtítulos y audio** en tu idioma preferido, con estilo y retraso ajustables. Botón **Abrir en VLC**.
- **Elección automática de fuente** según calidad y palabras clave, y recuerda la fuente que usaste en cada serie.
- **Seguir viendo** (con opción de quitar) y **reanudar** donde quedaste. Fila con el siguiente episodio de tus series.
- **Calendario** de estrenos de tus series y resumen **Tu año**.
- **Historial** por día, con filtros y estadísticas. Marcar episodios o pelis como vistas.
- **Mi lista** para guardar lo que querés ver.
- **Control remoto**: se navega con las flechas, Enter y Atrás (Fire TV / Android TV / navegador de la TV).
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

### Opción B — a mano desde la PC

```bash
npx wrangler login
npm run build && npx wrangler pages deploy
```

### Después

Abrí `https://series-pelis.pages.dev` en la PC, el celular y la TV. En el celular: menú del navegador →
*Instalar app* / *Agregar a pantalla de inicio*. Tus addons, tu key de TMDB (si cargaste una) y el historial quedan en cada navegador
(hasta que llegue la cuenta con código de vinculación).

En Fire TV podés abrirla desde el navegador Silk mientras tanto; el empaquetado como app nativa queda para más adelante.

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
