# Contrato de la app de Windows (v0.30) — interno, para armarla en partes

## Motor (`desktop-app/engine/index.js`, ESM)

```js
import { startEngine } from './engine/index.js'
const engine = await startEngine({
  cacheDir,            // carpeta para los torrents (se borra al arrancar y al cerrar)
  allowedOrigins,      // ['https://series-pelis.pages.dev'] (+ previews *.series-pelis.pages.dev, + http://localhost:5173 en dev)
  ffmpegPath, ffprobePath,
  log,                 // (msg) => void
})
engine.base   // 'http://127.0.0.1:<puerto>/<token>'  (token: 32 hex, 128 bits; escucha solo en 127.0.0.1)
await engine.close()
```

API bajo `engine.base` (la misma que usa `src/pages/player/StremioPrepare.tsx` con Stremio Service):

- `POST /<infoHash>/create` body `{ torrent: { infoHash }, peerSearch: { sources: ['dht:<hash>', 'tracker:<url>'…], min, max }, guessFileIdx: false | { season?, episode? } }`
  → bloquea hasta tener la metadata → `200 { guessedFileIdx, files: [{ name, length }] }`.
- `GET /<infoHash>/stats.json` → `{ peers, downloadSpeed, downloaded, … }` (también antes de la metadata). Desde la
  v0.31.1 suma, para la pantalla de carga: `found` (peers encontrados por trackers y DHT), `seeds` (conectados con el
  torrent entero; 0 sin metadata), `swarmSeeds`/`swarmLeechers` (lo que informan los trackers; `null` si ninguno
  contestó), `trackers`/`trackersOk` (cuántos hay y cuántos contestaron), `dhtNodes` (`null` sin DHT) y `engineError`
  (el cliente de torrents se cayó; `null` si anda). Si el cliente se cae, el próximo `create` arma uno nuevo.
- `GET|HEAD /<infoHash>/<fileIdx>` (fileIdx -1 = el video más grande) con `Range` → bytes del archivo (prioriza lo pedido).
- `GET /hlsv2/probe?mediaURL=<url>` → `{ format: { name, duration }, streams: [{ index, track: 'video'|'audio'|'subtitle', codec, channels, language, title, default, forced, sdh }] }`
  (`format.name` = `format_name` de ffprobe, p. ej. `matroska,webm` / `mov,mp4,m4a,3gp,3g2,mj2`; `index` es el de
  ffprobe; `forced`/`sdh` salen de la `disposition` de los subtítulos).
- `GET /subtitles/<index>/<n>.vtt?mediaURL=<url>` (v0.30.1) → WebVTT con los subtítulos de texto de la pista `index`
  (SRT, ASS/SSA, mov_text, WebVTT) que **empiezan** en el tramo `n` (`[n·120, (n+1)·120)` s, tiempos del archivo).
  Pasado el final, `WEBVTT` vacío. 404 si la pista no existe o es de imagen (PGS, VobSub); 400 sin `mediaURL`.
  La web pide el tramo actual y, a 30 s del final, el siguiente (`src/lib/embeddedSubs.ts`). Solo la app de Windows:
  Stremio Service no tiene esta ruta.
- `GET /hlsv2/<id>/master.m3u8?mediaURL=&videoCodecs=h264&videoCodecs=…&audioCodecs=aac…&maxAudioChannels=2` → HLS VOD
  (playlist completa desde el principio, se puede saltar a cualquier parte) que lee hls.js.
- `mediaURL` puede ser el propio motor (`<base>/<hash>/<idx>`) o un link https de internet (debrid, `notWebReady`).
  Nunca http/https a otras direcciones locales o privadas.
- CORS solo para `allowedOrigins`. Sin token correcto: 404.

## Ventana (`window.flixDesktop`, por `contextBridge` en el preload)

```ts
interface FlixDesktop {
  version: string                 // '0.30.0'
  torrent: string                 // engine.base
  openPlayer(href: string): Promise<'opened' | 'missing'>  // 'vlc://<url>' | 'mpv://<url>' | 'potplayer://<url>' (url http/https)
  update: {
    check(force?: boolean): Promise<{ available: boolean; current: string; latest?: string; notes?: string; size?: number; error?: string }>
    install(): Promise<void>      // baja y, al terminar, cierra e instala (avance por onEvent)
    onEvent(fn: (e: { state: 'downloading'; progress: number } | { state: 'installer' } | { state: 'error'; message: string }) => void): () => void
  }
}
```

User-Agent: el de Chromium + ` FlixPC/<versión>` (no `FlixApp/`: ese marca la app de Android).
