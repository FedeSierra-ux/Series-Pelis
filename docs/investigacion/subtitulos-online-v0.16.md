# Subtítulos online: qué conseguir de SubDL (y OpenSubtitles de respaldo)

Investigado el 14/10/2026. **Ojo:** subdl.com (registro, panel, docs, términos) está detrás del "Just a moment…" de
Cloudflare y no se pudo abrir directo desde acá. Lo de SubDL sale de los extractos de búsqueda de sus páginas oficiales,
de guías de terceros y de pruebas directas a la API (que sí responde). Donde algo no está confirmado, lo digo.

---

## Parte 1 — Paso a paso para vos (SubDL)

### 1. Crear la cuenta
1. Entrá a **https://subdl.com/panel/register** (si ya tenés cuenta: https://subdl.com/panel/login). [guía viren070]
2. Completá el formulario. **No pude confirmar si pide verificar el mail**: si te llega uno, confirmalo antes de seguir.

### 2. Sacar la API key
3. Con la sesión iniciada, andá a **https://subdl.com/panel/api** (sección "API" de tu panel).
4. Generá la key si no está y tocá **"Copy API Code"** para copiarla. [guía viren070, subdl.com/developers]
5. **No la pegues en ningún chat, issue ni archivo del repo.** Guardala en tu gestor de contraseñas.

### 3. Qué te da el plan gratis (y lo que cuesta lo pago)
| Plan | Precio | Búsquedas/día | Descargas/día | Notas |
|---|---|---|---|---|
| **Gratis** | 0 | **2.000** | **50** con key (según `/api/v2/me`) · sin key: **300 por IP** | alcanza de sobra para ~10 casas |
| Plus | US$3/mes o 20/año | 2.000 (igual) | igual | solo suma traducciones con IA, no sirve para esto |
| Pro | US$5/mes o 50/año | 30.000 | 2.000 con key | hasta 10 keys |
| Max | — | 60.000 | 5.000 | — |

- Las fuentes oficiales se contradicen un poco ("pedidos" vs "búsquedas"; un lugar dice 2.000 descargas para la gratis,
  pero `/me` de una key gratis muestra 50). No encontré un tope por segundo publicado.
- **Términos:** el uso **comercial** requiere plan pago y una key gratis "no debe usarse como key compartida para
  alimentar un servicio comercial para sus usuarios". Nuestra app es personal/familiar, sin plata de por medio, así que
  en principio entra en el plan gratis; si algún día se cobra algo, hay que pasar a Pro. No encontré nada sobre
  atribución ni sobre caché.

### 4. Cargar la key como secreto en Cloudflare Pages (proyecto `series-pelis`, sale de `wrangler.toml`)
**Opción A — por el panel**
6. https://dash.cloudflare.com → **Workers & Pages** → **series-pelis** → **Settings** → **Variables and Secrets** → **Add**.
7. Tipo **Secret** (en la doc figura como "Encrypt"), nombre **`SUBDL_KEY`**, valor = la key. Guardar.
8. Repetí para el entorno **Preview** si querés que también funcione en las URLs de prueba (el panel tiene el selector
   Production / Preview).
9. **Hacé un deploy nuevo**: el secreto se toma en el próximo despliegue, no en el que ya está publicado.

**Opción B — por la terminal** (pide el valor sin mostrarlo, no queda en el historial)
```bash
npx wrangler login                                   # una sola vez
npx wrangler pages secret put SUBDL_KEY --project-name series-pelis
npx wrangler pages secret list --project-name series-pelis   # chequear que aparece (no muestra el valor)
```
- Para Preview existe el flag global `--env`; la doc no aclara sus valores (en la práctica es `--env preview`,
  sin confirmar). Si dudás, cargalo por el panel para Preview.
- Después, nuevo deploy (`npm run build && npx wrangler pages deploy`).

### 5. Probar la key sin pegarla en ningún lado
En tu compu (macOS / Linux / Git Bash):
```bash
read -rs SUBDL_KEY && export SUBDL_KEY      # pegá la key + Enter (no se ve en pantalla)

# 1) ¿La key anda? Muestra tu plan y contadores; NO gasta cupo
curl -s -H "Authorization: Bearer $SUBDL_KEY" https://api.subdl.com/api/v2/me

# 2) Búsqueda real: Matrix en español, 3 resultados
curl -s "https://api.subdl.com/api/v1/subtitles?api_key=$SUBDL_KEY&imdb_id=tt0133093&type=movie&languages=ES&subs_per_page=3"

unset SUBDL_KEY
```
En Windows PowerShell: `$env:SUBDL_KEY = Read-Host "Key"` y las mismas URLs con `curl.exe`; al final
`Remove-Item Env:SUBDL_KEY`.

- Si anda: `/me` devuelve tu plan y `/subtitles` un JSON con `"status": true` y una lista `subtitles`.
- Si la key está mal: `{"status":false,"statusCode":403,"error":"not_authorized"}` (v1) o `"code":"unauthorized"` (v2).
- **Pasame solo si anduvo o qué error dio, nunca la key.**

---

## Parte 2 — Datos técnicos de SubDL (para implementar `/api/subs`)

**Búsqueda (v1, la que usa Bazarr hoy):** `GET https://api.subdl.com/api/v1/subtitles`
- `api_key` (obligatorio, query) + al menos uno de: `film_name`, `file_name`, `sd_id`, `imdb_id`, `tmdb_id`.
- `type` = `movie` | `tv`; `season_number`, `episode_number`; `year`; `languages` (CSV, ej. `ES,EN`);
  `subs_per_page` (Bazarr usa 30, hay `page`); `comment=1`, `releases=1`, `hi=1`, `full_season=1`,
  `unpack=1` (lista los archivos dentro del zip con su propia URL).
- Formato de `imdb_id` (`tt0133093` o solo número): **sin confirmar**, se ve en la prueba del paso 5.
- Para episodios Bazarr hace fallbacks: `season+episode` → solo `episode_number` (absoluto) → solo `season_number`
  (packs de temporada) → solo `type=tv`. Muchas series vienen con `season/episode = 0`.

**v2 (nueva):** auth con `Authorization: Bearer <key>` o `X-API-Key`. Hay `/api/v2/me` (plan y contadores, no gasta
cupo), `/api/v2/movies/search` (devuelve `sd_id`, `imdb_id`, `tmdb_id`) y `/api/v2/files/search` (por `filename` +
`languages`). No encontré búsqueda por IMDb + temporada/episodio documentada en v2 → **usar v1 para buscar**.
Ventaja de v2: la key va en cabecera, no en la URL (en v1 cuidado con no loguear la URL).

**Idioma:** el código de español es **`ES`** y **no distingue latino de España** (en el convertidor de Bazarr
`"ES": ("spa", None, None)`; el único con región es `BR_PT`). Para preferir latino habría que mirar
`release_name`/`author`/`comment`.

**Respuesta (v1):** `{ status, results: [{ sd_id, type, name, imdb_id, tmdb_id, year, ... }],
subtitles: [{ release_name, name, lang ("spanish"), language, author, url ("/subtitle/2506211-1689020.zip"),
season, episode, episode_from, episode_end, full_season, hi, releases, comment, unpack_files: [{ name, url,
file_n_id, season, episode, hi }] }], totalPages }`.

**Descarga:** `https://dl.subdl.com` + `url` → `.zip` (con `unpack=1`, por archivo: `https://dl.subdl.com/subtitle/{n_id}/{file_n_id}`).
- Probado acá: **sin key responde 200**, `content-type: application/zip`, adentro un `.srt`.
- Con key (`?api_key=` o cabecera `x-api-key`) descuenta del cupo de la cuenta (gratis ≈ 50/día); sin key, del cupo
  anónimo de **300/día por IP**. Desde una Pages Function la IP de salida es de Cloudflare (compartida con otros), así
  que conviene **cachear cada episodio una vez** (Cache API o KV) y no depender del cupo por IP.

**CORS:** probado — `api.subdl.com` y `dl.subdl.com` devuelven `access-control-allow-origin: *` (solo GET). O sea, el
navegador podría bajar los .zip directo sin el Worker (cada casa usaría su propio cupo por IP), pero la búsqueda
necesita la key, así que va por `/api/subs`.

**Errores a manejar** (del proveedor de Bazarr): `402` = requiere plan pago · `403` = key inválida (o bloqueo) ·
`404` = endpoint caído · `429` con `daily_limit` / `api_download_limit_exceeded` = cupo del día · `429 rate_limit`
(respeta `Retry-After`) · `429 service_busy`.

---

## Parte 3 — OpenSubtitles (respaldo), corto

**Para vos:**
1. Crear cuenta en https://www.opensubtitles.com (usuario + contraseña; la cuenta gratis sube el cupo de 5 a 20
   descargas/día). URL exacta del registro y si pide confirmar mail: **sin confirmar** (el sitio bloquea bots).
2. Logueado: perfil → **"API Consumers"** (https://www.opensubtitles.com/en/consumers) → crear consumer nuevo con un
   nombre (ej. "Series-Pelis"), destildar "Allow anonymous downloads" y guardar → copiar la **API key**.
   (Pasos de una guía de terceros, no del sitio oficial.) Opcional: tildar **"Under dev"** = hasta 100 descargas/día
   sin login mientras se desarrolla (dato de 2023, puede haber cambiado).
3. Secretos en Cloudflare (igual que el paso 4): **`OPENSUBTITLES_KEY`** y, para pasar de 5 a 20 descargas/día,
   **`OPENSUBTITLES_USER`** / **`OPENSUBTITLES_PASS`** (te recomiendo una cuenta aparte solo para la app).
4. Prueba: `read -rs OS_KEY && export OS_KEY` y
   `curl -s -H "Api-Key: $OS_KEY" -H "User-Agent: SeriesPelis v0.15" "https://api.opensubtitles.com/api/v1/subtitles?imdb_id=133093&languages=es"`;
   sin key contesta `403 "You cannot consume this service"` (probado).

**Técnico:**
- Base `https://api.opensubtitles.com/api/v1`. Cabeceras: `Api-Key` (una por aplicación, **obligatorio**: si cada
  usuario tiene que crear su propia key, banean) + `User-Agent` propio de la app (`SeriesPelis v0.15`).
- Buscar: `GET /subtitles?imdb_id=&parent_imdb_id=&season_number=&episode_number=&languages=` → cada resultado trae
  `files[].file_id`. Buscar no gasta cupo.
- Bajar: `POST /download` `{ file_id }` → `{ link, remaining, reset_time_utc }`; el `link` es temporal.
  Con usuario: `POST /login` `{ username, password }` → JWT en `Authorization: Bearer` (login: 1 pedido/s).
- Cupos de descarga: **5/día por IP sin login**, **20/día** cuenta gratis, 1.000 VIP; se reinician a medianoche UTC.
  Desde un Worker la IP es de Cloudflare → **hace falta el login** para que sea útil.
- Tope de velocidad: **5 pedidos/s por IP** (429 si se pasa); cabeceras `ratelimit-remaining` / `ratelimit-reset`.
- Idiomas: `es`; para latino figura **`ea`** = "Spanish (LA)" (dato de un repo de OpenSubtitles para VLC, verificar
  con `GET /infos/languages`). A diferencia de SubDL, sí distingue latino.
- CORS: `access-control-allow-origin: *` (probado), pero la key igual va del lado del servidor.

---

## Fuentes
- SubDL docs v1: https://subdl.com/api-doc · v2 / developers: https://subdl.com/developers
- Planes: https://subdl.com/pro · Blog Pro: https://subdl.com/blog/post/subdl-api-pro · Plus: https://subdl.com/blog/post/subdl-pro-golden-api
- Términos: https://subdl.com/terms · Comparación: https://subdl.com/opensubtitles-alternative
- Guía de key (registro, panel/api, "Copy API Code"): https://guides.viren070.me/stremio/addons/subdl-subtitles
- Proveedor SubDL de Bazarr (parámetros, errores, descarga): https://github.com/morpheus65535/bazarr/blob/master/custom_libs/subliminal_patch/providers/subdl.py
  y códigos de idioma: https://github.com/morpheus65535/bazarr/blob/master/custom_libs/subliminal_patch/converters/subdl.py
- Cupo free 50 descargas en `/me`: https://github.com/Abrechen2/sublarr/issues/212
- Ejemplo de respuesta: https://github.com/kalmnoise/subdl_api_cli
- Cloudflare secretos: https://developers.cloudflare.com/pages/functions/bindings/ · wrangler: https://developers.cloudflare.com/workers/wrangler/commands/pages/
- OpenSubtitles: https://opensubtitles.stoplight.io/docs/opensubtitles-api/ZG9jOjI3NTQ2OTAy-getting-started ·
  https://opensubtitles.stoplight.io/docs/opensubtitles-api/6ef2e232095c7-best-practices ·
  https://opensubtitles.tawk.help/article/about-the-api · https://news.ycombinator.com/item?id=38289941 ·
  https://github.com/opensubtitles/vlsub-opensubtitles-com/blob/main/docs/languages.md
