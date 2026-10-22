# Series-Pelis: más Stremio y más Netflix. Mejoras de UI/UX y funciones nuevas

Investigación sobre la v0.12.2 (commit `21faa78`). No se tocó nada del repo.

Cómo leerlo:
- **U1…U36** son mejoras de UI/UX sobre lo que ya existe.
- **F1…F22** son funciones nuevas.
- Al final hay un **Top 10** para la próxima versión.
- Esfuerzo: **S** (horas), **M** (1-2 días), **L** (varios días). Impacto: alto / medio / bajo.

Quedan afuera a propósito, porque ya los descartaste o los dejaste para más adelante:
- perfiles (109),
- Trakt,
- reconocimiento de caras,
- "la que más volviste a ver",
- otro puntaje cuando falta el de IMDb,
- títulos en español,
- la nube del debrid (45),
- temas de color nuevos (137, que espera el preview).

Ninguna propuesta saca streams de sitios piratas: todo sale de addons, Cinemeta, TMDB, YouTube (tráileres) e iptv-org.

---

## Lo que ya está a la altura (para no repetirlo)

Ya hay mucho de Netflix y de Stremio:
- portada con logo y tráiler sin interfaz,
- Top 10, "Para vos", "Porque viste…" y tendencias,
- etiquetas sobre el póster ("Episodio nuevo", "Temporada nueva", "Top 10", "Estreno"),
- tráiler al quedarse sobre un póster,
- "Seguir viendo" apaisado, con "quedan X min" y Deshacer,
- saltar intro, resumen y créditos; "¿Seguís viendo?"; temporizador; velocidad; PiP; Media Session; miniatura al adelantar con el mouse,
- sin spoilers, estrellas, "Ya no me interesa",
- Dónde ver en AR, sagas, reparto, página de persona,
- calendario, Tu año, diario y metas,
- TV en vivo, protector de pantalla, teclado en pantalla, memoria de foco y modo TV.

Lo que falta, sobre todo, son **atajos al play** (hoy todo pasa por la ficha y la lista de fuentes), algo de **TV "de verdad"** (fondo que sigue al foco, scroll anclado, scrub con miniaturas) y **pulido del reproductor** (episodios, volumen, menú unificado).

---

## 1. Mejoras de UI/UX (U1-U36)

### Navegación / riel

**U1. "Atrás" en escalera (Inicio → arriba → riel)**
- **Qué cambiar:** hoy "Atrás" en Inicio no hace nada (`initSpatialNav(() => location.pathname !== '/' && navigate(-1))`). Que el primer Atrás desde una fila lleve al principio de la pantalla (portada o primer botón), el segundo enfoque el riel y recién el tercero haga lo de siempre. Lo mismo en Películas, Series y Mi lista.
- **Por qué:** Netflix TV, Google TV y Stremio TV lo hacen así. Atrás nunca "no hace nada" y es la forma rápida de volver arriba con el control.
- **Archivos:** `src/App.tsx` (SpatialNav), `src/lib/spatialNav.ts`, `src/lib/focusMemory.ts`.
- **Esfuerzo:** S. **Impacto:** alto (TV).

**U2. Riel: indicador de sección activa y orden más Netflix**
- **Qué cambiar:** sacar Historial y Calendario del riel y dejarlos dentro de un hub "Vos" (ver U26). El riel queda en: Buscar, Inicio, Películas, Series, TV en vivo, Mi lista/Vos y Ajustes. Sumar una barrita lateral de acento en el ítem activo, además de la píldora.
- **Por qué:** Netflix pasó de 7-8 destinos a 5-6 y agrupó lo personal en "My Netflix" (Seguir viendo, Mi lista, Recordatorios, lo que te gustó). Menos destinos es menos ruido para el ojo, que es el objetivo declarado del rediseño 2025.
- **Archivos:** `src/components/Theme2Layout.tsx` (`RAIL`, `TABS`), `src/theme2.css`.
- **Esfuerzo:** S. **Impacto:** medio.

**U3. Transiciones entre pantallas (View Transitions)**
- **Qué cambiar:** usar `document.startViewTransition` al navegar. Primero un fundido corto entre páginas; después, la transición "compartida" del póster tocado a la ficha. Con `prefers-reduced-motion` se apaga, y en los navegadores sin soporte (TVs viejas) queda como hoy.
- **Por qué:** Prime Video sumó "animaciones y transiciones de página" en su rediseño. En Netflix, la tarjeta "crece" a la ficha. Hoy el cambio de pantalla es un corte seco.
- **Archivos:** `src/App.tsx` (ScrollMemory), `src/components/PosterCard.tsx`, `src/pages/Detail.tsx`, `src/theme2.css`.
- **Esfuerzo:** M. **Impacto:** medio.

**U4. Zoom de la interfaz**
- **Qué cambiar:** un ajuste "Tamaño de la interfaz" (90 %, 100 %, 115 %, 130 %) que escale `font-size` raíz y las variables de espaciado.
- **Por qué:** Stremio lo sumó en septiembre de 2026 ("interface zoom", web y escritorio). Sirve para la TV vista de lejos y para el celular de un familiar con la vista cansada.
- **Archivos:** `src/pages/settings/TvSettings.tsx`, `src/lib/store.ts` (settings), `src/theme2.css`, `src/lib/tv.ts`.
- **Esfuerzo:** S. **Impacto:** medio.

### Inicio

**U5. "Reproducir" directo desde Seguir viendo y desde la portada**
- **Qué cambiar:** hoy la tarjeta de "Seguir viendo" lleva a la ficha y ahí se elige la fuente (o corre la cuenta regresiva del modo automático). Que **OK o clic reproduzca directo**:
  - reusar `lastSourceStore` (mismo addon y `bingeGroup`) y `analyzeStreams`, como ya hace `findNextStream` para el siguiente episodio;
  - mientras busca, mostrar "Buscando fuente…" sobre la tarjeta;
  - si no encuentra nada reproducible, caer en la ficha como hoy;
  - dejar un botón chico "ⓘ" en la tarjeta para ir a la ficha.

  En la portada, el botón principal pasa a ser "▶ Reproducir" (directo) y uno secundario "Más info".
- **Por qué:** en Netflix, Disney+, Max y Prime, "Seguir viendo" **siempre** reproduce con un toque. Es el gesto más usado de todo el servicio. Stremio también reanuda desde el Board sin pasar por la lista de fuentes si ya tenés un stream recordado.
- **Archivos:** `src/components/ContinueCard.tsx`, `src/pages/Home.tsx`, `src/pages/home/TmdbHero.tsx`, `src/lib/nextEpisode.ts` (extraer un `findResumeStream`), `src/lib/streamPicker.ts`, `src/pages/detail/StreamList.tsx` (`PlayState`).
- **Esfuerzo:** M. **Impacto:** alto.

**U6. Unir "Seguir viendo" y "Tus series: siguiente episodio"**
- **Qué cambiar:** hoy son dos filas casi iguales una abajo de la otra. Que sea una sola: lo empezado, y cuando terminás un episodio, el siguiente ocupa su lugar con la etiqueta "Siguiente" o "Episodio nuevo", ordenados por fecha.
- **Por qué:** Netflix, Google TV y Stremio tienen **una** fila de continuar, que incluye el siguiente episodio. Dos filas parecidas confunden y empujan el resto de Inicio hacia abajo.
- **Archivos:** `src/pages/Home.tsx` (`UpNextRow`, `resume`), `src/lib/upNext.ts`, `src/lib/store.ts` (`continueWatching`).
- **Esfuerzo:** S. **Impacto:** alto.

**U7. Fila "Mi lista" en Inicio**
- **Qué cambiar:** sumar una fila con lo agregado recientemente que todavía no empezaste, después de "Seguir viendo". Que se pueda ocultar o mover desde el gestor de catálogos.
- **Por qué:** Netflix y Disney+ la muestran en Home. Hoy Mi lista solo está en su pantalla.
- **Archivos:** `src/pages/Home.tsx`, `src/lib/catalogPrefs.ts` (fila virtual "Mi lista").
- **Esfuerzo:** S. **Impacto:** medio.

**U8. Flechas de página en las filas (PC con mouse)**
- **Qué cambiar:** botones ‹ › en los bordes de cada `row-scroller`, que aparecen al pasar el mouse y avanzan una "página" de tarjetas. Usar `scroll-snap-type: x proximity` para que la fila no quede cortada a la mitad de una tarjeta. En la TV y en el celular no se muestran.
- **Por qué:** es el patrón de Netflix web. En Windows, una rueda vertical no mueve una fila horizontal (hay que usar Shift), así que hoy en PC las filas se recorren con la barra o arrastrando.
- **Archivos:** `src/components/Row.tsx`, `src/theme2.css`.
- **Esfuerzo:** S. **Impacto:** alto (PC).

**U9. Sonido y clasificación por edad en la portada**
- **Qué cambiar:** sumar un botón 🔇/🔊 para el tráiler de la portada (hoy siempre va con `mute: '1'`). A la derecha, la clasificación de Argentina ("ATP", "+13", "+16", "+18"), que sale de `release_dates` / `content_ratings` de TMDB con región AR.
- **Por qué:** el billboard de Netflix tiene exactamente esos dos elementos abajo a la derecha. El botón de sonido ya existe en el tráiler de los pósters (`HoverTrailer.tsx`, tecla M).
- **Archivos:** `src/pages/home/TmdbHero.tsx`, `src/lib/tmdb.ts` (`append_to_response`), `src/lib/hoverTrailer.ts` (`trailerSound`).
- **Esfuerzo:** S. **Impacto:** medio.

**U10. Filas apaisadas con logo (opcional)**
- **Qué cambiar:** una variante de tarjeta 16:9 con el fondo (`images.metahub.space/background/medium/{tt}/img`) y el logo encima (`images.metahub.space/logo/medium/{tt}/img`, o el de TMDB). Se elige por fila desde el gestor de catálogos, o globalmente en Ajustes → Pósters. Por ejemplo: "Para vos" y "Tendencias" apaisadas, catálogos de addons en póster.
- **Por qué:** es *la* estética Netflix (boxart horizontal con el logo). Ya la elegiste para la "Mezcla" ("tarjetas apaisadas"), pero hoy solo la usa "Seguir viendo".
- **Archivos:** `src/components/ContinueCard.tsx` (`LandscapeCard`), `src/components/PosterCard.tsx`, `src/pages/settings/PosterSettings.tsx`, `src/lib/catalogPrefs.ts`, `src/theme2.css`.
- **Esfuerzo:** M. **Impacto:** alto.

### Descubrir (Películas / Series)

**U11. Películas y Series como "página de filas" + grilla con filtros**
- **Qué cambiar:** hoy, abajo de la portada grande, hay una grilla infinita con filtros. Pasar a: portada, Top 10, filas por género ("Acción", "Comedia", "Terror", "Argentinas", "Animación"…) y un botón "Explorar todo / Filtros" que abre la grilla actual. Cada fila de género lleva "Ver todo", que abre la grilla con ese género ya filtrado.
- **Por qué:** así son las pestañas "Series" y "Películas" de Netflix, Disney+ y Prime. Las filas por género se recorren mucho mejor con el control remoto que una grilla infinita. La grilla con filtros (estilo Stremio Discover) queda como "modo avanzado".
- **Archivos:** `src/pages/Discover.tsx`, `src/pages/discover/DiscoverHero.tsx`, `src/pages/discover/FilterBar.tsx`, `src/lib/discoverApi.ts`, `src/lib/discoverFilters.ts`.
- **Esfuerzo:** M. **Impacto:** alto.

**U12. Géneros como chips horizontales**
- **Qué cambiar:** el selector de género pasa a ser una tira de chips desplazable arriba de la grilla. Un toque filtra; el chip activo queda relleno con `--accent-fill`.
- **Por qué:** Prime Video, Disney+ y Google TV usan chips. Son más rápidos que un `<select>`, que en la TV abre un desplegable nativo incómodo.
- **Archivos:** `src/pages/discover/FilterBar.tsx`, `src/theme2.css`.
- **Esfuerzo:** S. **Impacto:** medio.

### Buscar

**U13. Buscar vacío con sugerencias**
- **Qué cambiar:** con el campo vacío, mostrar debajo de las búsquedas recientes:
  - "Lo más buscado": tendencias del día de TMDB, como lista de texto con mini póster;
  - chips de géneros que llevan a Descubrir.
- **Por qué:** Netflix muestra "Búsquedas populares" y Disney+ muestra categorías antes de que escribas. Hoy, sin recientes, la pantalla queda casi vacía.
- **Archivos:** `src/pages/Search.tsx`, `src/pages/home/TmdbRows.tsx` (`useTrending`).
- **Esfuerzo:** S. **Impacto:** medio.

**U14. Pestañas de tipo y "Mejor resultado"**
- **Qué cambiar:** pestañas "Todo · Películas · Series · Personas" arriba de los resultados. En "Todo", el primer resultado va destacado en una tarjeta grande (fondo, logo, año, ▶ y Mi lista) y después los grupos.
- **Por qué:** Prime y Max destacan el "top hit". Disney+ tiene pestañas. Hoy los resultados vienen agrupados por catálogo y addon (`Películas · Cinemeta`), que es un detalle técnico que al usuario no le importa.
- **Archivos:** `src/pages/Search.tsx`, `src/components/PeopleRow.tsx`.
- **Esfuerzo:** M. **Impacto:** medio.

### Ficha

**U15. Ficha con pestañas debajo de la portada**
- **Qué cambiar:** "Episodios | Más como esto | Extras | Detalles". Hoy es un scroll largo: episodios y fuentes, después reparto, "Más como esto", saga, Dónde ver y Wikipedia.
  - En **Detalles** van el reparto, Dónde ver, premios, trivia y palabras clave.
  - En **Extras**, los tráileres, teasers y "detrás de escena" de TMDB (ver U17).
- **Por qué:** Netflix, Disney+ y Max usan exactamente esas pestañas. Con el control remoto es mucho menos scroll: el foco salta de pestaña en pestaña.
- **Archivos:** `src/pages/Detail.tsx`, `src/components/TmdbExtras.tsx`, `src/components/WikiTrivia.tsx`, `src/pages/detail/detail-fixes.css`.
- **Esfuerzo:** M. **Impacto:** alto.

**U16. Menos botones en la portada de la ficha**
- **Qué cambiar:** hoy pueden aparecer hasta 8 botones del mismo tamaño: Continuar, Desde el principio, Mi lista, Vista, Tráiler, IMDb, No me interesa, y las estrellas debajo. Dejar:
  - un primario grande: **▶ Reproducir / Continuar T2 E4** (directo, como U5);
  - una fila de **íconos con rótulo chico**: Mi lista (+/✓), Calificar (abre las estrellas), Tráiler, Compartir;
  - un **⋯** con Desde el principio, Marcar como vista, Ver en IMDb y No me interesa.
- **Por qué:** es la jerarquía de Netflix (Play grande + "Mi lista / Calificar / Compartir" como íconos) y de Disney+. Un solo botón principal hace que la decisión sea obvia.
- **Archivos:** `src/pages/Detail.tsx`, `src/components/StarRating.tsx`, `src/components/NotInterested.tsx`, `src/theme2.css`.
- **Esfuerzo:** M. **Impacto:** alto.

**U17. Tráiler dentro de la app**
- **Qué cambiar:** dos cambios:
  - el botón "Tráiler" hoy abre YouTube en otra pestaña (en la TV eso saca de la app). Que abra un reproductor a pantalla completa dentro de la app, con el mismo iframe sin interfaz de `TmdbHero` y subtítulos en español (como la 141);
  - además, a los ~3 s de abrir la ficha, que el fondo pase al tráiler silenciado, como en la portada.
- **Por qué:** Netflix y Disney+ reproducen el tráiler en el fondo de la ficha. La TV no debería salir nunca a YouTube.
- **Archivos:** `src/pages/Detail.tsx`, `src/pages/home/TmdbHero.tsx` (extraer un `useBackdropTrailer`), `src/lib/hoverTrailer.ts`.
- **Esfuerzo:** M. **Impacto:** alto.

**U18. "Disponible en 4K · HDR · 5.1" en la ficha**
- **Qué cambiar:** cuando llegan las fuentes, mostrar en `hero-meta` chips con la mejor calidad disponible (4K/1080p, HDR/DV, 5.1/Atmos, "Audio latino"). Salen del análisis que ya hace `streamPicker`.
- **Por qué:** Netflix y Prime muestran "4K Ultra HD · HDR · 5.1" en la ficha. Es información útil y no hay que abrir la lista de fuentes para saberla.
- **Archivos:** `src/pages/detail/StreamList.tsx` (exponer `best`), `src/lib/streamPicker.ts`, `src/pages/Detail.tsx`.
- **Esfuerzo:** S. **Impacto:** medio.

**U19. Fuentes más estilo Stremio**
- **Qué cambiar:**
  - chips para filtrar arriba de la lista de fuentes ("Todas · 4K · 1080p · [addon]");
  - que la lista quede **plegada** detrás de "Elegir otra fuente" cuando el modo es automático;
  - mostrar en una línea fija el tamaño, el códec y el idioma del audio (hoy son las líneas crudas del addon).
- **Por qué:** Stremio 5 filtra las fuentes por addon con un desplegable. Netflix directamente no muestra fuentes: plegarlas da lo mejor de los dos.
- **Archivos:** `src/pages/detail/StreamList.tsx`, `src/lib/streamPicker.ts`, `src/pages/player/SourcesMenu.tsx`.
- **Esfuerzo:** M. **Impacto:** medio.

**U20. Episodios: selector de temporada desplegable y "te quedan X min"**
- **Qué cambiar:**
  - con más de 6 temporadas, pasar las pestañas a un desplegable "Temporada 3 ▾" (en la TV, un `Picker`);
  - en cada episodio empezado, mostrar "Quedan 23 min" junto a la barra;
  - el episodio sugerido lleva la marca "Siguiente".
- **Por qué:** Netflix usa el desplegable de temporadas y "X min restantes" por episodio. Las pestañas no escalan para series largas (Los Simpson, One Piece).
- **Archivos:** `src/pages/Detail.tsx`, `src/components/Picker.tsx`, `src/lib/remaining.ts`.
- **Esfuerzo:** S. **Impacto:** medio.

### Reproductor

**U21. Panel de episodios dentro del reproductor**
- **Qué cambiar:** un botón "Episodios" (y la flecha ↓ en la TV) abre un panel con las temporadas y los episodios en tarjetas con miniatura y progreso, sin salir del video. Elegir uno cambia de episodio con la misma lógica que `goNext` (busca la fuente del mismo addon o `bingeGroup`).
- **Por qué:** Netflix, Disney+, Max, Prime y Stremio lo tienen. Hoy, para cambiar de episodio hay que salir a la ficha.
- **Archivos:** `src/pages/Player.tsx`, nuevo `src/pages/player/EpisodesPanel.tsx`, `src/lib/nextEpisode.ts`, `src/pages/detail/episodes.ts`.
- **Esfuerzo:** M. **Impacto:** alto.

**U22. Menú único "Audio y subtítulos"**
- **Qué cambiar:** unir los botones "CC" y "Audio" en un solo panel de dos columnas (Audio | Subtítulos). Abajo quedan "Estilo" y "Retraso".
- **Por qué:** es el panel de Netflix y Disney+. Un botón menos en la barra, y se ve de un vistazo la combinación elegida.
- **Archivos:** `src/pages/Player.tsx`, `src/pages/player/SubtitleMenu.tsx`, `src/pages/player/player-extras.css`.
- **Esfuerzo:** S. **Impacto:** medio.

**U23. Control de volumen con mouse**
- **Qué cambiar:** un ícono de parlante en la barra; al pasar el mouse se despliega un slider. La rueda del mouse sobre el video también cambia el volumen. Hoy el volumen solo se cambia con ↑/↓ o la tecla M.
- **Por qué:** Netflix web, YouTube y Stremio web lo tienen. En PC con mouse no hay forma visible de bajar el volumen.
- **Archivos:** `src/pages/Player.tsx` (`changeVolume`, `toggleMute`), `src/pages/player/PlayerIcons.tsx`.
- **Esfuerzo:** S. **Impacto:** alto (PC).

**U24. Adelantar con miniaturas en la TV y en el teclado**
- **Qué cambiar:** hoy `SeekPreview` funciona solo con el mouse. En la TV:
  - mantener → o ← entra en "modo scrub" y acelera (10 s, 30 s, 1 min);
  - se ve la miniatura del punto de destino;
  - OK confirma; Atrás cancela y vuelve a donde estabas.
- **Por qué:** es como se adelanta en Netflix TV y en Prime en Fire TV. En la TV, adelantar 40 minutos de a 10 s es inusable.
- **Archivos:** `src/pages/player/SeekPreview.tsx`, `src/pages/Player.tsx` (onKey `ArrowLeft`/`ArrowRight`).
- **Esfuerzo:** M. **Impacto:** alto (TV).

**U25. Marcas en la barra, tiempo restante y tarjeta del siguiente episodio con imagen**
- **Qué cambiar:**
  - **Marcas:** pintar en la barra los segmentos de intro, resumen y créditos que ya trae `segments`.
  - **Tiempo restante:** tocar el tiempo alterna entre "12:30 / 45:00" y "−32:30".
  - **Tarjeta del siguiente episodio:** sumar la miniatura, "T1 E5 · Título" y una barra que se llena con la cuenta regresiva. Hoy solo dice "Siguiente episodio en N s".
  - **Addon:** sacar el nombre del addon del título (pasa al menú Fuentes).
- **Por qué:** Prime y Plex muestran capítulos y segmentos. Netflix muestra el siguiente episodio con imagen y título.
- **Archivos:** `src/pages/Player.tsx`, `src/lib/segments.ts`, `src/theme2.css` (`.seekbar`, `.next-card`).
- **Esfuerzo:** S. **Impacto:** medio.

### Biblioteca (Mi lista, Historial, Calendario)

**U26. Hub "Vos" estilo "Mi Netflix"**
- **Qué cambiar:** una pantalla `/me` que junte, en filas, lo que hoy está repartido:
  - Seguir viendo,
  - Mi lista,
  - Recordatorios (F3),
  - Te gustaron (4-5 ★),
  - Momentos (F8),
  - accesos a Historial, Calendario, Diario, Metas y Tu año.

  La pestaña "Vos" del celular y el ítem del riel apuntan ahí, no a `/history`.
- **Por qué:** Netflix creó "My Netflix" justamente para esto en el rediseño de TV de 2025 y en la app del celular. Plex hizo lo mismo con su menú de usuario. Hoy "Vos" lleva al historial y lo demás queda escondido detrás de botones.
- **Archivos:** nuevo `src/pages/Me.tsx`, `src/components/Theme2Layout.tsx`, `src/App.tsx`, `src/pages/History.tsx`.
- **Esfuerzo:** M. **Impacto:** alto.

**U27. Mi lista con filtros de tipo y estado**
- **Qué cambiar:** pestañas "Todo · Películas · Series" y un filtro "Sin empezar · Empezadas · Terminadas", además del orden actual. Agregar selección múltiple para quitar varios a la vez.
- **Por qué:** la Biblioteca de Stremio tiene filtro por tipo y orden por último visto, nombre o fecha. Con muchas cosas en la lista, hoy se vuelve una pared de pósters.
- **Archivos:** `src/pages/MyList.tsx`, `src/lib/store.ts`.
- **Esfuerzo:** S. **Impacto:** medio.

### Ajustes

**U28. Buscador dentro de Ajustes**
- **Qué cambiar:** un campo arriba del índice que filtre secciones y opciones por texto ("subtítulos", "tráiler", "TV") y salte a la sección con `goToSection`.
- **Por qué:** Google TV y Android tienen búsqueda en ajustes. Con 12 secciones y la opción "avanzado", ya es difícil encontrar cosas.
- **Archivos:** `src/pages/settings/SettingsLayout.tsx`, `src/pages/Settings.tsx`.
- **Esfuerzo:** S. **Impacto:** bajo.

**U29. Ajustes rápidos dentro del reproductor**
- **Qué cambiar:** un ⚙ en el reproductor con lo que más se toca:
  - tamaño de los subtítulos,
  - saltar intro (botón / automático / apagado),
  - reproducir el siguiente solo,
  - calidad máxima.

  Hoy eso está en Ajustes → Reproductor, fuera del video.
- **Por qué:** Prime y YouTube permiten tocar esas opciones sin salir del video. Netflix deja cambiar el estilo de los subtítulos desde el panel de subtítulos.
- **Archivos:** `src/pages/Player.tsx`, `src/pages/settings/PlayerSettings.tsx` (reusar los controles).
- **Esfuerzo:** M. **Impacto:** medio.

### TV

**U30. Fondo que sigue al foco (billboard dinámico)**
- **Qué cambiar:** en modo TV, cuando el foco está en una fila de Inicio, Películas o Series, la parte de arriba muestra el fondo, logo, puntaje de IMDb, año, duración y sinopsis corta del póster enfocado, con un fundido de ~250 ms y un debounce de ~300 ms. Las filas quedan en la mitad de abajo.
- **Por qué:** es el layout clásico de Netflix TV, Stremio para Android TV, Google TV y Prime en Fire TV. Con el control remoto ves de qué se trata cada póster sin abrirlo, y es lo que más "huele" a app de TV.
- **Archivos:** `src/pages/Home.tsx`, `src/pages/Discover.tsx`, nuevo `src/components/FocusBillboard.tsx`, `src/lib/tv.ts`, `src/theme2.css` (`html[data-tv]`).
- **Esfuerzo:** L. **Impacto:** alto (TV).

**U31. Scroll anclado a la izquierda en las filas**
- **Qué cambiar:** hoy `spatialNav` hace `scrollIntoView({ inline: 'center' })` y la fila se corre en cada flecha. En la TV:
  - anclar el foco en la **primera columna visible**, con `scroll-padding-inline` igual al gutter; la fila se desplaza y el foco queda fijo;
  - en vertical, que la fila enfocada quede siempre a la misma altura.
- **Por qué:** Netflix TV y Google TV mantienen el foco en una posición fija y mueven el contenido: el ojo no tiene que perseguir el foco. Netflix explicó que el rediseño busca "minimizar el movimiento de los ojos".
- **Archivos:** `src/lib/spatialNav.ts`, `src/theme2.css`.
- **Esfuerzo:** S. **Impacto:** alto (TV).

**U32. Mantener OK = acciones rápidas**
- **Qué cambiar:** mantener OK (más de 600 ms), la tecla `ContextMenu` o un clic derecho sobre un póster abre una hoja con: ▶ Reproducir, Mi lista, Marcar como vista, No me interesa, Quitar de Seguir viendo y Ver ficha. En el celular, la misma hoja con un toque largo.
- **Por qué:** Android TV, Google TV y Fire TV usan el toque largo para las opciones. Netflix y Disney+ en el celular lo usan para la vista previa. Hoy el ✕ de "Seguir viendo" se alcanza con una flecha ↑ "escondida".
- **Archivos:** `src/components/PosterCard.tsx`, `src/components/ContinueCard.tsx`, nuevo `src/components/QuickActions.tsx`, `src/lib/spatialNav.ts`.
- **Esfuerzo:** M. **Impacto:** medio.

**U33. Margen seguro (overscan)**
- **Qué cambiar:** un ajuste en "Pantalla y control remoto" para correr la interfaz hacia adentro un 0, 2,5 o 5 %, con un recuadro guía mientras se ajusta. Algunas TVs recortan los bordes.
- **Por qué:** la guía de Fire TV pide dejar libre el 5 % de cada borde y tener el foco y el texto dentro del 90 % central.
- **Archivos:** `src/pages/settings/TvSettings.tsx`, `src/theme2.css` (`html[data-tv]`), `src/lib/store.ts`.
- **Esfuerzo:** S. **Impacto:** medio (TV).

### Celular

**U34. Al reproducir: pantalla completa y horizontal**
- **Qué cambiar:** al entrar al reproductor en el celular, pedir pantalla completa y `screen.orientation.lock('landscape')` (con `try/catch`: no todos los navegadores lo permiten). Al salir, liberar la orientación.
- **Por qué:** Netflix, Disney+ y Prime en el celular siempre pasan a horizontal al dar play. Hoy hay que girar el teléfono y tocar pantalla completa.
- **Archivos:** `src/pages/Player.tsx`, `src/pages/player/useMediaSession.ts`.
- **Esfuerzo:** S. **Impacto:** alto (celular).

**U35. Gestos en el reproductor del celular**
- **Qué cambiar:**
  - doble toque a la izquierda o derecha: −/+10 s, con la animación de onda y "10 s";
  - toque simple: muestra u oculta los controles;
  - pellizcar: pasa de "ajustar" a "llenar" la pantalla (tapa los bordes negros en pantallas 20:9);
  - botón "Bloquear pantalla" para que no se toque nada sin querer.
- **Por qué:** Netflix en el celular (doble toque y bloqueo de pantalla) y YouTube (pellizcar para llenar).
- **Archivos:** `src/pages/Player.tsx`, `src/pages/player/player-fixes.css`.
- **Esfuerzo:** M. **Impacto:** alto (celular).

**U36. Ficha en el celular: botón ▶ fijo abajo y hoja de vista previa**
- **Qué cambiar:**
  - en la ficha, el botón principal (▶ Reproducir / Continuar) queda fijo abajo mientras hacés scroll;
  - tocar un póster en las filas abre primero una **hoja inferior** con fondo, logo, sinopsis corta, ▶, Mi lista y "Más info". "Más info" va a la ficha completa.

  Queda pendiente tu respuesta sobre la hoja "Más" del Tema 2 en el celular (v0.11).
- **Por qué:** es el patrón de Netflix en el celular (vista previa en hoja) y de Disney+ y Max (CTA fijo). Ahorra una pantalla completa por cada póster que mirás.
- **Archivos:** `src/pages/Detail.tsx`, `src/components/PosterCard.tsx`, nuevo `src/components/PreviewSheet.tsx`, `src/theme2.css`.
- **Esfuerzo:** M. **Impacto:** medio.

---

## 2. Funciones nuevas (F1-F22)

**F1. "Sorprendeme" (reproducir algo al azar)**
- **Qué:** un botón en Inicio, en la ficha de las series y en el riel de la TV.
  - En Inicio elige al azar algo de "Para vos", Mi lista o Top 10 (sin lo de "Ya no me interesa") y lo reproduce directo (U5).
  - En la ficha de una serie, "Episodio al azar": ideal para sitcoms como Friends, The Office o Los Simpson.
- **Por qué:** Netflix tuvo "Play Something" y tiene "Shuffle Play" para series. Plex tiene "Shuffle".
- **Archivos:** `src/pages/Home.tsx`, `src/pages/Detail.tsx`, `src/lib/recommend.ts`.
- **Esfuerzo:** S. **Impacto:** medio.

**F2. Novedades y Próximamente**
- **Qué:** una pantalla con:
  - estrenos que vienen (TMDB `upcoming` región AR, más series con fecha de temporada nueva en `on_the_air` / `next_episode_to_air`),
  - "Llega esta semana",
  - "Nuevo en tus addons" (catálogos ordenados por fecha).

  Cada ítem tiene su tráiler y el botón "Avisarme" (F3).
- **Por qué:** es la sección "Nuevo y popular" de Netflix (que en el celular pasó al menú de arriba en 2026) y el "Coming Soon" de Disney+ y Max. El Calendario actual solo cubre las series que ya seguís.
- **Archivos:** nuevo `src/pages/Upcoming.tsx`, `src/lib/tmdb.ts`, `src/components/Theme2Layout.tsx`, `src/App.tsx`.
- **Esfuerzo:** M. **Impacto:** alto.

**F3. Recordatorios ("Avisarme")**
- **Qué:** marcar una película o serie que todavía no salió, o una temporada que viene. El día del estreno:
  - aparece arriba de Inicio con la etiqueta "¡Ya salió!";
  - suma un punto en la campanita (F4).

  Se guarda en un store nuevo, `remindersStore`.
- **Por qué:** es el "Remind Me" de Netflix, que vive en "My Netflix". Disney+ tiene lo mismo.
- **Archivos:** `src/lib/store.ts`, nuevo `src/lib/reminders.ts`, `src/pages/Detail.tsx` (botón cuando `!isReleased`), `src/components/TmdbExtras.tsx`.
- **Esfuerzo:** S. **Impacto:** medio.

**F4. Campanita de notificaciones**
- **Qué:** un ícono en el riel y la cabecera del celular, con contador. Lista:
  - "Episodio nuevo de X" (lo que hoy ya calcula `posterLabels` / `upNext`),
  - recordatorios cumplidos,
  - temporadas nuevas,
  - títulos nuevos de las personas que seguís (F12).

  Opcional, en PC y Android: aviso del sistema con la Notification API al abrir la app. No hace falta push con servidor.
- **Por qué:** Stremio tiene notificaciones de episodios nuevos (insignias en Seguir viendo y una bandeja). Netflix tiene la campana.
- **Archivos:** nuevo `src/components/Notifications.tsx`, nuevo `src/lib/notifications.ts`, `src/components/Theme2Layout.tsx`, `src/lib/upNext.ts`, `src/lib/posterLabels.ts`.
- **Esfuerzo:** M. **Impacto:** alto.

**F5. Recomendaciones al terminar una película (post-play)**
- **Qué:** al empezar los créditos de una película (con `credits.ts` ya lo sabemos), una tarjeta con 3 títulos de "Más como esto" y una cuenta regresiva para reproducir el tráiler del primero. Va junto al pedido de puntaje que ya existe (`RateAtEnd`).
- **Por qué:** es el post-play de Netflix para películas. Hoy, al terminar una película, el reproductor se queda ahí.
- **Archivos:** `src/pages/Player.tsx`, nuevo `src/pages/player/PostPlay.tsx`, `src/components/TmdbExtras.tsx` (reusar "Más como esto").
- **Esfuerzo:** M. **Impacto:** medio.

**F6. "Lo que pasó hasta ahora" (resumen de texto, sin spoilers)**
- **Qué:** en la ficha y en el `RecapOffer` del reproductor, un panel "Ponete al día" con las sinopsis de TMDB de los últimos episodios vistos (o de la temporada anterior), en orden y cortadas **justo antes** del episodio que vas a ver. Respeta el modo sin spoilers.
- **Por qué:** Prime Video tiene "X-Ray Recaps", resúmenes que llegan solo hasta el minuto donde estás. Acá se hace sin IA, con lo que ya trae TMDB.
- **Archivos:** `src/pages/player/RecapOffer.tsx`, `src/pages/Detail.tsx`, `src/lib/tmdb.ts` (episodios de temporada), `src/lib/spoilers.ts`.
- **Esfuerzo:** S. **Impacto:** medio.

**F7. Clips: feed vertical de tráileres (celular)**
- **Qué:** una pestaña "Clips" con un feed vertical a pantalla completa de tráileres y teasers de YouTube, sacados de TMDB (`videos`), con:
  - "Para vos", tendencias y Mi lista sin ver como fuente del feed;
  - deslizar para pasar al siguiente;
  - botones Mi lista, Ver ficha y Compartir.

  Reusa el iframe sin interfaz y los subtítulos en español de la 141.
- **Por qué:** Netflix lanzó "Clips" en abril de 2026 como una de las 4 pestañas de su app del celular, con un feed personalizado, Mi lista en un toque y compartir. Es la forma "moderna" de descubrir.
- **Archivos:** nuevo `src/pages/Clips.tsx`, `src/lib/hoverTrailer.ts`, `src/components/Theme2Layout.tsx` (`TABS`).
- **Esfuerzo:** L. **Impacto:** medio.

**F8. Momentos (guardar escenas)**
- **Qué:** un botón "Guardar momento" en el reproductor (y la tecla `B`) guarda título, episodio, segundo y una captura chica (si el CORS lo permite; si no, el fondo del título). Los momentos se ven en "Vos" (U26) y se reproducen desde ese segundo con un toque.
- **Por qué:** es "Moments" de Netflix (2024): guardar una escena en "My Netflix" y volver a reproducir desde ahí.
- **Archivos:** `src/pages/Player.tsx`, `src/lib/store.ts` (nuevo `momentsStore`), `src/pages/Me.tsx`.
- **Esfuerzo:** S. **Impacto:** bajo.

**F9. Mis listas (colecciones propias)**
- **Qué:** además de "Mi lista", crear listas con nombre ("Para ver con los chicos", "Maratón de terror", "Pendientes de Mundial") y mostrarlas como filas en Inicio. Se exportan con el JSON de datos.
- **Por qué:** Plex tiene colecciones y playlists, y Letterboxd tiene listas. Las listas curadas de la v0.5 son fijas; no hay forma de armar las tuyas.
- **Archivos:** `src/lib/store.ts`, `src/pages/Lists.tsx`, `src/pages/MyList.tsx`, `src/lib/catalogPrefs.ts`.
- **Esfuerzo:** M. **Impacto:** medio.

**F10. Mandar a la TV (Cast / Remote Playback)**
- **Qué:** un botón "Enviar a la TV" en el reproductor del celular o la PC:
  - en Chrome, la Remote Playback API (`video.remote.prompt()`);
  - más adelante, opcional, el Cast Web Sender SDK para Chromecast y Google TV.

  Los links de debrid son https directos, así que se pueden castear.
- **Por qué:** Netflix, Disney+, Max, Prime y Plex castean desde el celular. Para las casas sin la app en la TV, es la forma más rápida de verla en grande.
- **Archivos:** `src/pages/Player.tsx`, `src/pages/player/PlayerIcons.tsx`, `public/_headers` (la CSP si se usa el SDK de Cast).
- **Esfuerzo:** M. **Impacto:** alto.

**F11. Seguir en el celular (código QR)**
- **Qué:** en la TV, en la ficha o al pausar, un "Seguir en otro dispositivo" muestra un QR con el link a `/detail/...` y el segundo exacto. El celular lo abre y sigue desde ahí. No necesita servidor: el link lleva todo.
- **Por qué:** es la versión sin login de "seguir viendo en otro dispositivo" de Netflix y Disney+. Encaja con el login por código previsto para más adelante.
- **Archivos:** nuevo `src/components/HandoffQr.tsx` (una lib chica de QR, sin CDN, por la CSP), `src/pages/Player.tsx`, `src/pages/Detail.tsx`.
- **Esfuerzo:** S. **Impacto:** medio.

**F12. Seguir a una persona**
- **Qué:** en la página de una persona, "Seguir". Cuando TMDB lista un título nuevo de esa persona (actor o director), avisa en la campanita (F4) y aparece una fila "Nuevo de [persona]" en Inicio.
- **Por qué:** Plex Discover deja seguir a actores y directores. Complementa "Para vos" sin pedir nada.
- **Archivos:** `src/pages/Person.tsx`, `src/lib/store.ts`, `src/lib/discoverApi.ts`, `src/lib/notifications.ts`.
- **Esfuerzo:** M. **Impacto:** bajo.

**F13. Búsqueda por voz**
- **Qué:** un micrófono en Buscar, con la Web Speech API (`SpeechRecognition`, `lang: 'es-AR'`). Se muestra solo si el navegador lo soporta (Chrome en Android y escritorio; en las TVs depende del navegador).
- **Por qué:** Netflix TV, Google TV y Fire TV buscan por voz. Tipear con el teclado en pantalla es lo más lento de la experiencia de TV.
- **Archivos:** `src/pages/Search.tsx`, `src/components/OnScreenKeyboard.tsx`.
- **Esfuerzo:** S. **Impacto:** medio.

**F14. "¿Qué tenés ganas de ver?" (búsqueda por ánimo)**
- **Qué:** chips de ánimo en Buscar y en Descubrir: "Para reírme", "Algo cortito (< 100 min)", "Para llorar", "Con suspenso", "Para ver en familia", "Argentina", "Basada en hechos reales". Cada uno es una receta de filtros de TMDB (géneros, keywords, duración, país) sobre `discoverApi`. Sin IA.
- **Por qué:** Netflix prueba una búsqueda conversacional ("algo divertido y alegre") y sus colecciones de Clips "por ánimo". Esto da el mismo resultado práctico.
- **Archivos:** `src/lib/discoverFilters.ts`, `src/lib/curated.ts`, `src/pages/Search.tsx`, `src/pages/discover/FilterBar.tsx`.
- **Esfuerzo:** S. **Impacto:** medio.

**F15. Guía "Ahora / A continuación" en TV en vivo**
- **Qué:** mostrar debajo de cada canal qué está dando y qué sigue, con barra de progreso, usando datos EPG de iptv-org (`iptv-org/epg`) cuando el canal tiene `guide`. Si un canal no tiene datos, se ve como hoy.
- **Por qué:** Stremio sumó una guía de TV en vivo (EPG) en septiembre de 2026. Es lo básico de cualquier app de TV en vivo.
- **Archivos:** `src/lib/liveTv.ts`, `src/pages/LiveTv.tsx`, quizás `functions/api/epg.ts` (caché de la grilla, solo datos públicos).
- **Esfuerzo:** L. **Impacto:** medio.
- **Ojo:** antes hay que investigar qué fuente pública y abierta de EPG cubre los canales de AR elegidos.

**F16. Modo noche y realce de diálogos**
- **Qué:** en el ⚙ del reproductor, "Modo noche" (comprime picos de volumen) y "Realzar diálogos" (sube 1-4 kHz), con Web Audio (`DynamicsCompressor` + `BiquadFilter`).
- **Por qué:** Prime Video tiene "Dialogue Boost" y muchas TVs y barras traen modo noche. Sirve para ver de noche sin despertar a nadie.
- **Archivos:** `src/pages/Player.tsx`, nuevo `src/pages/player/audioFx.ts`.
- **Esfuerzo:** M. **Impacto:** medio.
- **Experimental:** Web Audio solo funciona si el servidor del video manda CORS. Si no, se apaga solo y avisa.

**F17. Ajustar, llenar o estirar el video**
- **Qué:** un botón (y la tecla `Z`) que alterna `object-fit: contain`, `cover` y `fill`. Se recuerda por dispositivo.
- **Por qué:** Stremio lo sumó en septiembre de 2026, con la tecla para alternar y la elección recordada. Sirve en celulares 20:9 y en TVs con bordes negros en películas 2.39:1.
- **Archivos:** `src/pages/Player.tsx`, `src/pages/player/player-fixes.css`, `src/lib/shortcuts.ts`.
- **Esfuerzo:** S. **Impacto:** medio.

**F18. Elegir 3 títulos en el asistente inicial**
- **Qué:** un paso nuevo en el onboarding: "Elegí 3 que te gusten", con una grilla de populares de TMDB. Se guardan como puntaje 4-5 ★ y alimentan "Para vos" y "Porque viste" desde el primer día.
- **Por qué:** Netflix lo hace en el primer uso para que el Home no arranque genérico. Hoy "Para vos" necesita puntajes o historial para servir.
- **Archivos:** `src/components/Onboarding.tsx`, `src/lib/ratings.ts`, `src/pages/home/ForYouRow.tsx`.
- **Esfuerzo:** S. **Impacto:** medio.

**F19. Compartir un título**
- **Qué:** un botón Compartir en la ficha, con `navigator.share` (en PC, copiar el link): el link a la ficha más el póster y la sinopsis.
- **Por qué:** está en la fila de íconos de Netflix y Disney+. Sirve para pasarle algo a otra casa de la familia.
- **Archivos:** `src/pages/Detail.tsx` (ya existe `shareCard.ts` para "Tu año").
- **Esfuerzo:** S. **Impacto:** bajo.

**F20. Ver juntos a distancia (watch party)**
- **Qué:** una sala con código de 6 dígitos: play, pausa y seek sincronizados entre casas, y un chat de reacciones con emojis. Cada casa usa su propia fuente (su debrid); solo se sincroniza el tiempo.
- **Por qué:** Disney+ tuvo GroupWatch, Prime tiene Watch Party y Plex tiene Watch Together. Para ~10 casas de la familia tiene mucho sentido.
- **Archivos:** nuevo `functions/api/room/[[path]].ts` (Cloudflare Durable Objects / WebSocket), `src/pages/Player.tsx`, nuevo `src/lib/watchParty.ts`.
- **Esfuerzo:** L. **Impacto:** medio.
- **Ojo:** necesita backend. Conviene después del login con D1.

**F21. Subtítulos dobles**
- **Qué:** mostrar dos idiomas a la vez (por ejemplo inglés arriba y español abajo), en el menú de subtítulos.
- **Por qué:** lo tienen Language Reactor (Netflix) y Stremio con addons. Sirve para practicar inglés con las series.
- **Archivos:** `src/pages/player/useSubtitles.ts`, `src/pages/player/SubtitleMenu.tsx`, `src/lib/subtitles.ts`.
- **Esfuerzo:** M. **Impacto:** bajo.

**F22. Atajo "Seguir donde quedé" al abrir la app**
- **Qué:** si la última sesión quedó a mitad de algo (menos de 12 h), al abrir la app aparece un aviso "¿Seguís con *X* T2 E4? ▶" que se va solo a los 8 s. Opcional, en Ajustes.
- **Por qué:** Prime Video lleva lo último que estabas viendo a la portada, y Google TV pone "Continuar" primero. En la TV ahorra navegar.
- **Archivos:** `src/pages/Home.tsx`, `src/components/UpdateToast.tsx` (mismo patrón de aviso), `src/lib/store.ts`.
- **Esfuerzo:** S. **Impacto:** medio.

---

## 3. Top 10 para la próxima versión

Criterio: lo que más acerca la app a Netflix y Stremio en el uso diario, con esfuerzo razonable y sin depender de servidor nuevo.

| # | Ítem | Por qué ahora | Esfuerzo |
|---|---|---|---|
| 1 | **U5** Reproducir directo desde Seguir viendo y la portada | Es el gesto más usado. Hoy siempre hay una pantalla de más | M |
| 2 | **U6** Una sola fila de "Seguir viendo" (con el siguiente episodio) | Saca una fila duplicada de Inicio | S |
| 3 | **U21** Panel de episodios en el reproductor | Hoy hay que salir del video para cambiar de episodio | M |
| 4 | **U16 + F19** Ficha con un solo botón principal e íconos (incluye Compartir) | La ficha se ve mucho más Netflix | M |
| 5 | **U17** Tráiler dentro de la app (no YouTube) y de fondo en la ficha | En la TV, hoy el tráiler te saca de la app | M |
| 6 | **U31 + U1** Scroll anclado y "Atrás" en escalera en la TV | Cambia la sensación del control remoto con poco código | S |
| 7 | **U8 + U23** Flechas en las filas y volumen con mouse (PC) | Dos huecos claros en PC | S |
| 8 | **U34 + U35** Horizontal automático y gestos en el celular | El reproductor del celular pasa a sentirse nativo | M |
| 9 | **F2 + F3** Novedades/Próximamente con "Avisarme" | Lo único "Netflix" grande que falta en el descubrimiento | M |
| 10 | **U26** Hub "Vos" (Mi Netflix) | Ordena Historial, Calendario, Diario, Metas y Tu año, y da lugar a Recordatorios y Momentos | M |

Si se quiere una versión "TV primero", se puede cambiar el #9 por **U30** (fondo que sigue al foco, L) y el #10 por **U24** (adelantar con miniaturas en la TV, M).

Preguntas para hacerle al usuario antes de arrancar:
- U5: ¿play directo siempre, o solo cuando la "Elección de fuente" está en automático?
- U2 y U26: ¿está bien sacar Historial y Calendario del riel y meterlos en "Vos"?
- U10: ¿las filas apaisadas van en todas las filas o solo en las de TMDB?
- La hoja "Más" del celular, que quedó pendiente en la v0.11.

---

## Fuentes consultadas

- Rediseño de Netflix en TV (2025): menú arriba, My Netflix, etiquetas en las tarjetas, recomendaciones en tiempo real. [Netflix Help Center](https://help.netflix.com/en/node/321880164349028), [about.netflix.com](https://about.netflix.com/news/netflix-on-tv-gets-a-major-makeover), [IBC](https://www.ibc.org/ott-streaming/news/netflix-introduces-new-homepage-design-for-tv-screens/21877), [BGR](https://bgr.com/entertainment/netflix-just-got-its-biggest-redesign-in-years-heres-what-it-looks-like/), [AlternativeTo](https://alternativeto.net/news/2025/5/netflix-announces-global-tv-app-redesign-ai-search-and-vertical-tiktok-style-video-feed)
- Netflix en el celular (2026): Clips, barra de 4 pestañas. [What's on Netflix](https://www.whats-on-netflix.com/news/netflix-mobile-updates-clips-new-navigation/), [Fast Company](https://www.fastcompany.com/91534522/netflix-goes-vertical-with-its-new-mobile-app)
- Netflix Moments. [Tom's Guide](https://www.tomsguide.com/entertainment/netflix/new-netflix-feature-lets-you-save-iconic-movie-and-tv-show-scenes-heres-how-it-works), [IBC](https://www.ibc.org/ott-streaming/news/netflix-launches-'moments'-mobile-feature-to-save-and-share-scenes/21047)
- Stremio (septiembre de 2026): guía EPG, zoom de interfaz, ajustar/llenar/estirar, pistas que pasan al siguiente episodio. [AlternativeTo](https://alternativeto.net/news/2026/9/stremio-brings-live-tv-guide-interface-zoom-enhanced-video-player-and-windows-vlc-option/)
- Biblioteca y Board de Stremio Web (filtros, orden, Seguir viendo, notificaciones). [Docs de stremio-web](https://mintlify.wiki/stremio/stremio-web/features/library)
- Rediseño de Prime Video (barra arriba, portada, animaciones y transiciones). [Neowin](https://www.neowin.net/news/the-amazon-prime-video-tv-app-is-getting-a-ui-refresh-with-a-new-top-navigation-bar-and-more/), [Android Central](https://androidcentral.com/streaming-tv/amazon-prime-video-ui-content-changes)
- Prime Video X-Ray Recaps. [About Amazon](https://www.aboutamazon.com/md/news/entertainment/amazon-prime-video-x-ray-recaps), [TV Technology](https://tvtechnology.com/news/prime-video-launches-ai-powered-recaps-of-tv-shows)
- Jellyfin 10.10 (segmentos, trickplay) y Plex (Watchlist, Discover Together). [Jellyfin](https://jellyfin.org/posts/jellyfin-release-10.10.0/), [Cord Cutters News](https://cordcuttersnews.com/plexs-new-discover-together-makes-the-app-more-like-social-media/)
- Guía de diseño de Fire TV (zona segura del 90 %, foco). [Amazon Developer](https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html)
