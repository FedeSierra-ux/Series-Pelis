# Perfiles en Series-Pelis: cómo los hacen los servicios y cómo los haríamos nosotros

> Investigación para la v0.15 (sin tocar código). Fecha: 14/10/2026. Base: `src/lib/store.ts`, `src/lib/storeSync.ts`
> y `src/components/Theme2Layout.tsx` de la v0.14.1, más la ayuda oficial de cada servicio (links al final de cada sección).
> Lo que no se pudo confirmar en una fuente oficial está marcado con **(no verificado)**.

---

## 1. Qué hacen los servicios

### Tabla comparativa

| Servicio | Máx. perfiles | "¿Quién está viendo?" | Avatar | Infantil / edad | PIN | Por perfil | Compartido | Cómo se cambia |
|---|---|---|---|---|---|---|---|---|
| **Netflix** | 5 (miembro extra: 1) | Al abrir la app si hay más de 1 perfil; en la TV es la pantalla de selección de perfiles | Íconos predefinidos (personajes de Netflix, según el país). Sin foto | Perfil "Niños" (experiencia aparte, sin acceso a controles parentales) + nivel de madurez y títulos bloqueados por perfil | PIN de 4 dígitos por perfil ("Bloqueo de perfil"); opción "pedir PIN para crear perfiles" atada al perfil principal | Historial, sugerencias, Mi lista, puntajes, idioma, **apariencia de subtítulos y ajustes de reproducción**, notificaciones, partidas de juegos | Cuenta, plan, pagos, dispositivos | TV: botón Atrás → ícono de perfil arriba del menú. Celular: "Mi Netflix" → nombre del perfil. Web: hover en el avatar de arriba a la derecha |
| **Disney+** | 7 (según prensa; Disney no lo dice en su guía) | Pantalla "Who's Watching" al abrir | Personajes de Disney/Marvel/Star Wars (varían por país). Sin foto | **Junior Mode** (solo apto todo público, sin autoplay) + "Kid-Proof Exit" (para salir hay que resolver un desafío: escribir números que están en letras) + clasificación por perfil | PIN de 4 dígitos por perfil; "restringir creación de perfiles" pide la contraseña | Avatar, idioma de la app, autoplay, video de fondo, clasificación, historial/Seguir viendo | Cuenta, dispositivos | Ícono del perfil en el menú → vuelve a "Who's Watching" |
| **Prime Video** | 6 (incluye infantiles) | Selector al entrar (en Fire TV el perfil de Prime es aparte del de Fire TV) | Íconos predefinidos | Perfil Kids: solo hasta 12 años, compras bloqueadas, búsqueda filtrada | PIN de cuenta (pisa los otros) + PIN por perfil ("Profile lock") | Watchlist, recomendaciones, historial | Cuenta, compras, PIN de cuenta | Ícono redondo arriba a la derecha |
| **HBO Max** | 5 | Selector al entrar | Íconos / personajes **(no verificado el detalle)** | Perfil Kids con límite de clasificación (por defecto "Pre-teens"), su propia Mi lista y Seguir viendo; no ve ajustes de cuenta. "Kid-Proof Exit" | PIN por perfil en los adultos | Mi lista, Seguir viendo, clasificación | Cuenta, suscripción | Menú del perfil |
| **Apple TV (tvOS)** | No son perfiles de la app: son **usuarios del aparato**, cada uno con su Apple ID | No hay pantalla al abrir la app; se elige en el Centro de control | Foto/Memoji del Apple ID | Restricciones del aparato | Código del aparato | Up Next, colecciones, recomendaciones, Game Center | Fotos, ajustes del aparato, iCloud principal | **Mantener apretado el botón TV** → Centro de control → nombre. Al cambiar, la app TV se recarga con el "A continuación" del otro |
| **YouTube (TV)** | Cuentas de Google + "Invitado" (en Roku/Apple TV/Fire TV el invitado pasó a "usar sin cuenta") | En Android TV aparece **al abrir en frío**; recuerda la última cuenta y **si no tocás nada, entra sola con la resaltada** | Foto de la cuenta | Perfil de YouTube Kids en el mismo selector | — | Todo (son cuentas distintas) | El aparato | Avatar en el menú lateral → pestaña Cuentas |
| **Stremio** | **No tiene perfiles**: una cuenta = una biblioteca. La gente usa una cuenta por persona o addons de terceros (ej. "Profile Manager") | — | — | — | — | — | Todo mezclado: el "Seguir viendo" de uno se mezcla con el de otro | Cerrar sesión y entrar con otra cuenta |
| **Plex (Plex Home)** | Miembros de la casa + "usuarios administrados" (sin mail; solo se entra cambiando desde una cuenta completa) | Selector de usuario; se puede **entrar solo con el último usuario** (ajuste por aparato, solo cuentas completas) | Foto de la cuenta | Restricciones de clasificación para usuarios administrados | PIN por usuario; Plex aclara que **no es seguridad real**, es una comodidad para chicos | Visto/no visto, On Deck, puntajes | El servidor y las bibliotecas | Web: menú de usuario. Celular: ícono "cambiar usuario" en el cajón |
| **Jellyfin** | Usuarios del servidor | Pantalla de login con los usuarios visibles (se puede ocultar un usuario y que tenga que tipear) | Imagen por usuario | Clasificación máxima, ocultar sin clasificación, etiquetas, **horario permitido** | Contraseña (bloqueo tras N intentos) | Todo lo de reproducción | Servidor, bibliotecas | Cerrar sesión / cambiar usuario |
| **Kodi** (vale como modelo) | Perfiles locales del aparato | "Mostrar pantalla de login al iniciar"; si está apagada, **entra solo con un perfil elegido** | Imagen por perfil | — | Bloqueo maestro por perfil (el wiki avisa que **no es seguridad**, se saltea por la interfaz web) | Por perfil se elige si la info de medios y las **fuentes** son *separadas*, *compartidas con el principal* o *compartidas de solo lectura* | Lo que se marque como compartido | Desde la pantalla de login o el menú |

**Transferir perfil (Netflix):** un perfil se puede mudar a una cuenta nueva, a una existente o a un lugar de "miembro extra",
llevándose historial, Mi lista, recomendaciones y ajustes (no los pagos). No se puede con perfiles infantiles, con PIN o con mail
propio; hay que habilitar la transferencia en la cuenta de origen.

### Patrones comunes (lo que conviene copiar)

1. **El selector aparece al abrir en frío** cuando hay más de un perfil. Si hay uno solo, no se muestra.
2. **En aparatos compartidos (TV) se pregunta; en personales (celular/PC) se recuerda.** YouTube en Android TV recuerda la
   última cuenta y entra sola con la resaltada si nadie toca nada; Plex y Kodi tienen "entrar solo con el último".
3. **El cambio de perfil vive en el avatar**: arriba a la derecha en web, en la pestaña "Mi Netflix"/"Vos" en el celular,
   arriba del menú lateral en la TV. En tvOS es un gesto del control (mantener apretado).
4. **Avatares predefinidos, nada de fotos** (Netflix, Disney+, Prime, Max). Nombre corto debajo.
5. **"+ Agregar perfil"** como última tarjeta del selector y **"Administrar perfiles"** como botón debajo (modo edición con lápiz
   sobre cada avatar).
6. **PIN de 4 dígitos por perfil** y, en los infantiles, una "salida a prueba de chicos". Plex y Kodi lo dicen claro:
   en un cliente local **no es seguridad, es un candado de cortesía**.
7. **Por perfil:** historial/progreso, Seguir viendo, Mi lista, puntajes, recomendaciones, idioma, subtítulos, autoplay.
   **Compartido:** la cuenta/plan, los aparatos, las fuentes (en nuestro caso: addons y debrid).
8. **Invitado:** YouTube lo tiene (lo que se ve no toca las recomendaciones de nadie); Netflix y Disney+ no.
9. **Borrar un perfil borra su historial** (Netflix lo avisa). El principal no se puede borrar.

---

## 2. Opciones de UX (para dibujar)

Elementos comunes a las cuatro variantes:

- **Tarjeta de perfil:** círculo (o cuadrado redondeado `--radius`) con avatar, nombre en Sora debajo. Foco en la TV: aro lila
  `#c4b0ff` de 4 px + escala 1.08 (igual que los pósters). Candado chico abajo a la derecha si tiene PIN.
- **Avatar (sin fotos ni caras):** a elegir entre
  - *Inicial + color*: 8 colores armonizados con el acento (lila, menta, durazno, cielo, limón, rosa, arena, gris). Lo más barato.
  - *Íconos ilustrados*: 16–24 SVG propios (pochoclo, claqueta, control, cohete, gato, mate…). Sin derechos de terceros.
  - *Fondo de una peli favorita*: recorte de un backdrop de TMDB elegido por el usuario (no fotos de actores, para no rozar lo de caras).
- **"+ Agregar"**: tarjeta con borde punteado. **"Invitado"** (opcional): tarjeta gris con ícono de anteojos.
- **Teclado del PIN en la TV:** grilla numérica 3×4 navegable con flechas (y las teclas numéricas del control si las tiene),
  4 puntitos arriba. En PC/celular, 4 casillas con `inputmode="numeric"`.

### Variante A — "Clásica" (Netflix / Disney+)

Siempre que se abre la app y hay más de un perfil, pantalla completa "¿Quién está mirando?".

- **TV:** fondo `--bg` con un degradé lila muy suave; título centrado arriba; fila horizontal de 2–6 avatares de ~160 px;
  foco inicial en el último perfil usado (`data-autofocus`). Abajo, botón "Administrar perfiles". ← → mueve, OK entra.
- **PC:** la misma composición centrada, avatares de ~120 px, hover con aro lila. "Administrar perfiles" como botón secundario.
- **Celular:** grilla de 2 columnas, avatares de ~96 px; "Administrar" como texto arriba a la derecha (lápiz).
- **Cambio de perfil:** el ítem "Vos" del riel (`RAIL`) y de la barra (`TABS`) muestra el avatar en vez del ícono `user`;
  dentro de "Vos", arriba, "Cambiar de perfil" → vuelve a la pantalla.
- **Pro:** lo conoce todo el mundo. **Contra:** un paso más cada vez que se abre, aunque viva sola una persona en esa casa.

### Variante B — "Recordada" (YouTube Android TV / Plex)

Entra directo con el último perfil. Durante 4–5 s aparece una pastilla abajo a la izquierda: avatar + "Mirando como **Sofi**
· Cambiar" (en la TV, "Cambiar" queda enfocable con ↓; en PC/celular es un botón).

- **TV:** la pastilla flota sobre la portada; si se apreta OK sobre "Cambiar" se abre un **panel lateral** desde la izquierda
  (pegado al riel) con la lista vertical de perfiles: avatar 64 px + nombre, el actual con tilde. No es pantalla completa.
- **PC:** el avatar va abajo del riel lateral; click abre un **menú desplegable** con los perfiles, "Administrar" e "Invitado".
- **Celular:** la pestaña "Vos" muestra el avatar; **mantener apretado** abre una hoja inferior con los perfiles
  (el tap normal sigue abriendo "Vos").
- **Ajuste:** "Preguntar quién mira al abrir" (apagado de fábrica).
- **Pro:** cero fricción. **Contra:** fácil que alguien vea con el perfil de otro y le ensucie "Seguir viendo".

### Variante C — "En la portada" (sin pantalla aparte)

No hay pantalla de selección: en Inicio, arriba de la portada, una franja con chips de perfil
("¿Quién mira? ● Sofi ● Juan ● Abu ● Invitado") que se colapsa al elegir o al empezar a bajar.

- **TV:** la franja es la primera fila navegable (↑ desde la portada llega a ella); chips de 56 px con nombre al lado.
- **PC:** chips en la barra de arriba junto al buscador.
- **Celular:** chips en un carrusel horizontal arriba de la portada.
- **Pro:** se ve contenido al instante y el cambio está a un toque. **Contra:** visualmente compite con la portada redondeada
  y en la TV agrega una fila más antes del contenido; es la menos "de servicio de streaming".

### Variante D — "Mixta según el aparato" (la que recomiendo)

- **TV (`html[data-tv]`):** se comporta como **A** al arrancar en frío **y al volver del protector de pantalla** (después de
  la inactividad, otra persona puede haber agarrado el control). Foco en el último perfil; si nadie toca nada en 10 s, entra
  sola con el resaltado (como YouTube), con un anillo de cuenta regresiva alrededor del avatar.
- **PC y celular:** se comporta como **B** (recuerda el último perfil del aparato; cambio desde el avatar / mantener apretado "Vos").
- **Si hay un solo perfil:** nunca se muestra nada; la app se ve igual que hoy.
- **Primera vez (asistente `Onboarding`):** un paso nuevo "¿Quiénes miran en esta casa?" con el perfil principal ya creado
  (nombre editable) y "+ Agregar" opcional, que se puede saltear.

---

## 3. Opciones de implementación

### Cómo están hoy los datos

- Un solo IndexedDB `series-pelis-data` / store `kv` (idb-keyval), **una clave por store**: `addons`, `progress`, `diary`,
  `goals`, `lastSource`, `liveTv`, `trackPrefs`, `watchlist`, `ratings`, `notInterested`, `recentSearches`,
  `catalogPrefs`, `settings`.
- Todos son **singletons** (`export const progressStore = new PersistedStore(...)`) que los componentes importan directo y
  se hidratan una vez en `hydrateStores()`.
- `storeSync`: cada escritura es un parche mezclado en la misma transacción (`update`) y se avisa por `BroadcastChannel`
  `sp-store` con `{ key }`; `onRemoteChange` guarda **un handler por clave** (`Map<string, fn>`).
- Exportar/importar: un JSON `version: 1` con todo junto (la key de TMDB no va).
- La caché `series-pelis-cache` va por URL (no depende del usuario): **se queda compartida**.

### Qué va por perfil y qué queda compartido (propuesta)

| Por perfil | Compartido en el aparato |
|---|---|
| `progress` (historial, Seguir viendo) | `addons` (y el debrid que llevan adentro) |
| `watchlist` (Mi lista) | `catalogPrefs` (filas de Inicio; se puede pasar a perfil más adelante) |
| `ratings` (estrellas), `notInterested` | caché de catálogos y fichas (`series-pelis-cache`) |
| `diary`, `goals` (Diario, Metas, Tu año) | key de TMDB y marca `sp-tmdb-server` |
| `trackPrefs` (idioma por título), `lastSource` | marcas de `localStorage` (`sp-report-server`, salud de canales, manifests) |
| `recentSearches`, `liveTv` (favoritos) | |
| **Ajustes personales:** `subtitleLangs`, `autoSubtitles`, `audioLangs`, `subtitleStyle`, `hideSdh`, `autoplayNext`, `skipSegments`, `stillWatchingAfter`, `spoilerFree`, `spoilerUnstarted`, `askRatingAtEnd`, `hoverTrailer`, `curatedRows`, `posterRating`, `posterLabels` | **Ajustes del aparato:** `tvMode`, `uiScale`, `screensaverMinutes`, `streamingServerUrl`, `externalPlayer`, `seekPreview`, `showAdvanced`, `onboardingDone`, `hintsSeen`, `sendReports`, `autoSubsMigrated`, `tmdbKey` |
| *A decidir con el usuario:* `sourceRules` (calidad preferida, palabras como "latino") | |

`Settings` hoy es un solo objeto: hay que partirlo en `deviceSettingsStore` + `profileSettingsStore` y dejar una **fachada**
`settingsStore` con el mismo `get/set/subscribe` que mezcla los dos y manda cada campo al suyo en `set`, así todos los
`settingsStore.get().x` y `settingsStore.set((s) => ({ ...s, ... }))` actuales no se tocan.

### Cambios concretos en `store.ts` / `storeSync.ts` (sirven para A, B y C)

1. **`PersistedStore` con alcance:** `new PersistedStore('progress', {}, { scope: 'profile', resolve: newestUpdate })`.
   Los de alcance `'device'` siguen como hoy.
2. **Clave real = espacio + clave.** Dos formas:
   - **Prefijo de clave en la misma base (recomendado):** idb-keyval acepta claves array, ej. `['p', profileId, 'progress']`.
     Una sola base, una sola transacción por escritura como hoy, borrar un perfil = recorrer `keys()` y `delMany`.
   - *Una base por perfil* (`createStore('series-pelis-p-<id>', 'kv')`): aislamiento más limpio y borrar es
     `indexedDB.deleteDatabase`, pero suma conexiones abiertas, `indexedDB.databases()` no existe en navegadores de TV viejos
     para listarlas, y la cuota se reparte igual. No vale la pena.
3. **Migración sin riesgo:** el **perfil principal usa las claves de siempre** (`'progress'`, `'watchlist'`…, sin prefijo).
   Los perfiles nuevos usan el prefijo. Así, al actualizar, nadie pierde nada y no hay que mover datos.
4. **Cambiar de perfil = rehidratar**, no recrear: `switchProfile(id)` pone el espacio activo, vuelve cada store de perfil a su
   valor inicial, hace `hydrate()` de todos (`Promise.all`) y emite. Los componentes no cambian porque siguen importando los
   mismos singletons. Además: limpiar `focusMemory`/`ScrollMemory`, navegar a `/` con `replace` y sacar `returnVideo`.
5. **Escrituras en vuelo:** `set()` tiene que capturar la clave completa (con el perfil) **en el momento del `set`**, no al
   resolver la promesa; si no, un guardado de progreso de Sofi que termina después del cambio cae en el perfil de Juan.
   Y `refresh()` tiene que descartar la lectura si cambió el perfil mientras tanto (hoy usa `seq`; sumar un "epoch" de perfil).
   **No permitir cambiar de perfil con el reproductor abierto** (el progreso se guarda cada 5 s).
6. **`storeSync`:** el aviso pasa a `{ key, ns }` y `onRemoteChange` registra por clave completa. Cada pestaña tiene **su**
   perfil activo (en `sessionStorage` `sp-profile`, con `localStorage` como "último usado" para pestañas nuevas): si en la
   PWA mira Sofi y en una pestaña Juan, los avisos del otro perfil se ignoran. No forzar el cambio en las demás pestañas
   (podrían estar reproduciendo).
7. **Lista de perfiles:** clave de aparato `profiles` = `{ v: 1, list: [{ id, name, avatar, color, pinHash?, kind:
   'normal' | 'kids' | 'guest', createdAt, updatedAt }], main: id }`. Ids con `crypto.randomUUID()` (sirven tal cual para D1).
8. **PIN:** guardar `SHA-256(sal + pin)` con `crypto.subtle`, nunca el PIN. Decirlo claro en la interfaz: "evita que se cuelen,
   no es una contraseña". Para recuperarlo, "Olvidé el PIN" lo borra desde el perfil principal (o desde Ajustes avanzados).
9. **Invitado:** perfil `kind: 'guest'` cuyos stores viven **solo en memoria** (no escriben a IndexedDB). Barato y útil para
   visitas.
10. **Exportar/importar `version: 2`:** `{ app, version: 2, device: { addons, addonManifests, settings, catalogPrefs },
    profiles: [{ id, name, avatar, data: { progress, watchlist, ... } }] }`. Importar una copia `version: 1` = mezclar en el
    perfil activo (como hoy). Botón extra **"Exportar solo este perfil"** → en otra TV, "Importar como perfil nuevo":
    es nuestro "Transferir perfil" sin servidor.
11. **Borrados para sincronizar después:** hoy `removeHistory`, `toggleWatchlist`, `removeDiaryEntry` **borran la clave**.
    Para poder sincronizar con D1 sin que lo borrado "reviva" desde otro aparato, conviene ir pasando a lápidas
    (`{ deleted: true, updatedAt }`) o a un registro de borrados por store. Se puede hacer en la fase de D1, pero sabiendo que viene.

### Opción A — Perfiles locales por aparato (sin login)

- **Qué es:** todo lo de arriba, solo en IndexedDB. Cada TV/celular tiene sus propios perfiles.
- **Pros:** no depende del login ni de D1; funciona offline; la migración es nula (el principal usa las claves de hoy);
  encaja con la regla "todo pasa por los stores".
- **Contras:** Sofi en la TV y Sofi en el celular son dos perfiles distintos (su "Seguir viendo" no cruza). Se mitiga a medias
  con "Exportar/Importar este perfil". El PIN es decorativo.
- **Esfuerzo:** **M** (store + fachada de ajustes + pantalla de perfiles + editor + PIN + export v2 + tests de cambio de
  perfil con escrituras en vuelo y de `storeSync` con dos perfiles).
- **Riesgos:** datos cruzados si falla el punto 5 (el más delicado); que la cuota de IndexedDB se llene antes (cada perfil
  suma su historial; hoy ya existe el aviso `storageIssue`).

### Opción B — Perfiles en una cuenta por casa, en D1 (con login)

- **Qué es:** la casa tiene una cuenta (login con código de vinculación en la TV, como dice CLAUDE.md); los perfiles viven en
  D1 y se ven en todos los aparatos de la casa.
- **Esquema mínimo:** `households`, `devices` (vinculados por código), `profiles (id, household_id, name, avatar, color,
  pin_hash, kind, updated_at, deleted_at)` y datos por perfil, sea en tablas (`progress(profile_id, video_id, …, updated_at)`,
  `watchlist`, `ratings`…) o en una tabla genérica `profile_kv(profile_id, store, item_id, json, updated_at, deleted)`.
- **Sincronización:** los parches de `diffPatch` ya son por entrada → mandarlos a `POST /api/sync` y resolver con las mismas
  reglas que hoy entre pestañas (`newestUpdate` por `updatedAt`, `newestByAt`); bajar con "dame lo cambiado desde X".
  Cola offline en IndexedDB para la TV que se queda sin red.
- **Pros:** el perfil sigue a la persona por toda la casa; PIN que sí se puede validar en el servidor; base para "Transferir
  perfil" real entre casas y para los perfiles de la idea 109.
- **Contras:** depende del login (todavía no existe), de un Worker con autenticación, de límites de D1 y de resolver
  conflictos y borrados (punto 11). Más superficie para errores y para privacidad entre las ~10 casas (todo filtrado por
  `household_id`).
- **Esfuerzo:** **L** (login + vinculación + API de sync + migración de los datos locales + tests).
- **Riesgos:** perder progreso por un conflicto mal resuelto; que una casa vea datos de otra por un bug de filtrado; costo de
  escrituras si se sincroniza el progreso cada 5 s (conviene agrupar y mandar al pausar/salir/cada 30–60 s).

### Opción C — Híbrida: locales ahora, a la cuenta después

- **Qué es:** A hoy, diseñada para que el paso a B sea "subir lo que hay": ids UUID, `updatedAt` en todo, lápidas, y una
  pantalla futura "Vincular esta TV a la casa" que pregunta por cada perfil local **"¿Es el mismo que…?"** (unir con uno de la
  cuenta) o **"Subir como perfil nuevo"**. Al unir, se mezcla con las mismas funciones de importación de hoy
  (`importProgress`, `mergeWatchlist`, `newestByAt`), que ya son idempotentes.
- **Pros:** el usuario tiene perfiles ya; nada de lo que se haga se tira; el trabajo de B se reduce a la API y al login.
- **Contras:** durante un tiempo hay dos mundos (local y nube) y la pantalla de "unir perfiles" agrega un caso a explicar.
- **Esfuerzo:** **M** ahora + **M/L** cuando llegue el login (menos que B de cero).
- **Riesgos:** duplicados si la gente sube en vez de unir (mitigable sugiriendo por nombre igual).

### Otras que valen la pena (como complemento)

- **D — Solo "Invitado"**: sin perfiles, un modo que no guarda nada. **S**. Resuelve "vino una visita y me arruinó Seguir
  viendo", pero no el caso de varias personas fijas.
- **E — "Un aparato = una persona"**: ponerle nombre al aparato y listo (como hoy). **S**, pero no sirve para la TV del living,
  que es justamente donde se usa más.
- **Descartada:** usar una cuenta de Stremio por persona (`stremioApi`) como perfil: obliga a cada uno a tener cuenta y mezcla
  addons; y Stremio mismo no tiene perfiles.

### Perfil infantil (aparte)

Es lo más caro y lo más "agujereado": Cinemeta no trae clasificación por edad; TMDB sí (`release_dates` / `content_ratings`,
certificación de AR: ATP, +13, +16, +18), pero solo cuando hay TMDB, y los catálogos y la búsqueda de los addons no se pueden
filtrar con garantía. Un perfil infantil "liviano" sería: Inicio armado solo con Descubrir de TMDB filtrado por
`certification_country=AR&certification.lte=…`, sin Buscar libre, sin TV en vivo, sin autoplay y con "salida a prueba de chicos"
(desafío tipo Disney+). **Esfuerzo L** y con fugas posibles. Recomiendo preguntarle al usuario si hay chicos en las casas antes
de hacerlo.

---

## 4. Recomendación

**Opción C (híbrida) con la UX de la variante D.** Arrancar con perfiles locales bien hechos y con el formato de datos pensado
para la nube, sin esperar al login.

**Fase 1 — v0.15 (M): perfiles locales**
- `PersistedStore` con `scope`, claves `['p', id, store]`, perfil principal con las claves de siempre (sin migración).
- Fachada de ajustes (aparato / perfil) con la tabla de arriba.
- Pantalla "¿Quién está mirando?" (TV: al arrancar y al volver del protector, con auto-entrada a los 10 s; PC/celular:
  recuerda el último). Avatar en "Vos" (`RAIL`/`TABS`), mantener apretado en el celular.
- Crear / editar / borrar (con confirmación: "se borra su historial") y avatares de inicial + color e íconos propios.
- PIN opcional de 4 dígitos (hash, "candado de cortesía") e **Invitado** en memoria.
- `storeSync` con `ns`; perfil activo por pestaña; no se cambia con el reproductor abierto.
- Exportar/importar `version: 2` + "Exportar / Importar este perfil".
- Tests: cambio de perfil con escritura en vuelo, dos pestañas en perfiles distintos, importar v1 y v2, borrar perfil.

**Fase 2 — junto con el login (M/L): perfiles de la casa en D1**
- Lápidas para los borrados, API `/api/sync` con las reglas de mezcla de hoy, cola offline.
- "Vincular esta TV a la casa" → unir o subir cada perfil local.
- PIN validado en el servidor. Transferir perfil entre casas.

**Fase 3 — si el usuario lo pide:** perfil infantil con certificación de TMDB; filas de Inicio (`catalogPrefs`) por perfil.

**Por qué:** los perfiles son pedidos (109) y hoy el problema real es la TV compartida del living, que se resuelve sin
servidor. Hacerlos locales primero no se tira: los UUID, `updatedAt` y las reglas de mezcla que ya existen son exactamente lo
que necesita la sincronización con D1. La variante D copia el patrón que mejor funciona en los servicios grandes (preguntar en
el aparato compartido, recordar en el personal) y con un solo perfil la app queda igual que hoy.

### Preguntas para el usuario antes de arrancar
1. ¿Hay chicos en las casas? (define si vale el perfil infantil y el PIN).
2. ¿`sourceRules` (calidad y palabras como "latino") es de cada persona o de la casa?
3. ¿Las filas de Inicio (Ajustes → Catálogos) son de cada persona o de la TV?
4. ¿Quiere "Invitado"?
5. Avatares: ¿inicial + color, íconos ilustrados, o fondo de una peli favorita?
6. En la TV, ¿preguntar también al volver del protector de pantalla, o solo al abrir?

---

## Fuentes

- Netflix — crear/editar perfiles (5 perfiles, qué es por perfil, borrar borra historial): https://help.netflix.com/en/node/10421
- Netflix — bloqueo de perfil con PIN: https://help.netflix.com/en/node/114277
- Netflix — cambiar de perfil en TV, celular y web: https://help.netflix.com/en/node/322532375336036
- Netflix — transferir perfil: https://help.netflix.com/node/122698 · https://help.netflix.com/en/node/124844 · https://help.netflix.com/en/node/124918
- Disney+ — controles parentales, PIN, Junior Mode, Kid-Proof Exit, restringir creación: https://disneyplus.com/explore/articles/parental-controls-guide-disney-plus
- Disney+ — 7 perfiles (prensa): https://www.businessinsider.nl/how-many-profiles-on-disney-plus/
- Prime Video — 6 perfiles, Kids, PIN de cuenta y de perfil: https://www.internetmatters.org/parental-controls/entertainment-search-engines/amazon-prime-video/ · https://www.pluggedin.com/blog/parental-controls-amazon-prime-video/ · https://www.techhive.com/article/578685/amazon-rolls-out-prime-video-user-profiles.html
- HBO Max — perfiles (hasta 5) y perfiles Kids: https://help.hbomax.com/de-de/Answer/Detail/000002539 · https://help.hbomax.com/DO/Answer/Detail/000002540
- Apple TV — varios usuarios y Centro de control: https://support.apple.com/guide/tv/atvb0753b37d/16.0/tvos/16.0 · https://support.apple.com/guide/tv/atvb5f549664/15.0
- YouTube — selector al arrancar en Android TV (recuerda y entra solo): https://9to5google.com/2025/10/28/youtube-for-android-tv-now-shows-account-switcher-at-startup/ · modo invitado: https://support.google.com/youtube/answer/3015415?hl=en · https://9to5google.com/2025/02/03/youtube-guest-profile-tv-apps/
- Stremio — sin perfiles nativos (addon de terceros): https://stremio-addons.net/addons/pezzhub-profile-manager
- Plex Home — qué es y PIN: https://support.plex.tv/articles/203815766-what-is-plex-home/ · cambio rápido de usuario: https://support.plex.tv/articles/204232453-fast-user-switching/ · entrar solo con el último: https://forums.plex.tv/t/bypassing-select-user-screen/888336
- Jellyfin — usuarios y controles parentales: https://jellyfin.org/docs/general/server/users/adding-managing-users
- Kodi — perfiles (separado/compartido, login al iniciar, el bloqueo no es seguridad): https://kodi.wiki/view/Profiles · https://kodi.wiki/view/Settings/Profiles · https://kodi.wiki/view/Master_lock
