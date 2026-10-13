# Series-Pelis

Tu plataforma personal para ver pelis y series con **tus addons de Stremio**, el **puntaje de IMDb** a la vista
y un **historial** de todo lo que viste. Funciona en la PC, el celular y el navegador de la TV (se puede instalar como app).

## Qué hace (v0.2.0)

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

## Publicarla en Cloudflare Pages (gratis)

1. Creá una cuenta en Cloudflare.
2. `npx wrangler login`
3. `npm run build && npx wrangler pages deploy dist --project-name series-pelis`
4. Abrí la URL `https://series-pelis.pages.dev` en la PC, el celular y la TV. En el celular: menú del navegador →
   *Instalar app* / *Agregar a pantalla de inicio*.

`wrangler pages deploy` también sube la carpeta `functions/` (el proxy `/api/segments` para saltar intros).

En Fire TV podés abrirla desde el navegador Silk mientras tanto; el empaquetado como app nativa queda para más adelante.

## Herramientas para Claude Code

- `.claude/agents/`: agentes de [agency-agents](https://github.com/msitarzewski/agency-agents) elegidos para este proyecto
  (frontend, streaming de video, UI/UX, performance, accesibilidad, etc.).
- `.claude/skills/reverse-engineer-anything` + `.mcp.json`: [rea](https://github.com/morluto/rea) para analizar apps y binarios.
- `scripts/install-claude-tools.sh`: instala todo **global** en tu Claude Code (todos los agentes + rea).
  Corrélo una vez en tu PC. Con `--project` actualiza solo lo de este repo.

## Roadmap

- **Próximo**: metadatos de TMDB (sinopsis en español, reparto, colecciones).
- Cuenta con código de vinculación (como Netflix) y sincronización del historial en Cloudflare (Workers + D1).
- Importar addons desde la cuenta de Stremio.
- App para Fire TV / Android TV.
