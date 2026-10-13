# Changelog

## [0.8.1] - 2026-10-13

### Arreglado
- **Pantalla en negro al cambiar de sección** (Chrome 150 en adelante, en PC y celular): desde esa versión
  `window.scrollTo()` devuelve una promesa, y el efecto que sube la página al navegar la devolvía como si fuera
  su limpieza. Al ir a otra página React intentaba llamarla, tiraba "is not a function" y se caía toda la app.
  Un test nuevo revisa que ningún efecto devuelva llamadas del navegador que dan promesas.

## [0.8.0] - 2026-10-13

Arreglos de la auditoría visual y de la prueba de addons, y TMDB activado desde el sitio para toda la familia.

### Agregado
- **TMDB sin configurar nada**: si el sitio publicado en Cloudflare tiene el secreto `TMDB_KEY`, la app pide a TMDB
  por `/api/tmdb/*` y las fichas salen en español sin cargar ninguna key. La key nunca llega al navegador.
  - La función solo responde a la app (mismo sitio) y a las rutas de TMDB que se usan.
  - Si alguien carga su propia key en Ajustes → TMDB, se usa la suya. Ajustes y el asistente inicial avisan
    que TMDB ya viene activado.
- **Pantalla de error del reproductor**: tarjeta sobre el fondo de la peli con **Elegir otra fuente** ahí mismo,
  en vez de un cartel que tapaba el botón Fuentes. Lo mismo cuando una peli no tiene fuentes.
- Aviso en la fila cuando un addon no responde, en vez de que la fila desaparezca de Inicio.
- Reemplazo con el nombre del título cuando un póster no carga.

### Cambiado
- Los botones del reproductor usan íconos de línea parejos, y "Abrir en…" ya no se corta en la TV. En el celular
  los controles van en dos renglones.
- Ficha: fondo más oscuro a la izquierda y renglones más angostos para que el texto no se pise con las caras.
  Se reserva el lugar de lo que carga después, así no salta.
- Tema 2: "Tus series" usa tarjetas apaisadas como "Seguir viendo", el teclado en pantalla tiene más contraste
  y el aro de foco del riel ya no tapa el texto.
- Los torrents sin debrid van plegados al final de cada addon ("N torrents sin debrid"), así no llenan la lista.
- Errores en español y sin jerga técnica (antes salían "Failed to fetch" o "signal is aborted…").
- Las URLs de addons se limpian solas: espacios, `stremio://`, sin `https://` o terminadas en `/configure`.
- Volver a instalar un addon apagado lo deja apagado y lo avisa.

### Arreglado
- Tema 1: el borde de foco de los pósters quedaba cortado.
- TV: la primera flecha iba al logo o al menú; ahora va al contenido ("Ver ahora", el stream recomendado…).
- TV: con → se pasa del campo de URL del addon al botón "Agregar" (cuando el cursor está al final).
- "Volver" después de pasar solo al episodio siguiente dejaba la ficha en el episodio anterior; ahora queda en el
  último que viste.
- Si un subtítulo no carga, sigue el que estaba puesto.
- Los subtítulos suben cuando aparecen los controles, así no quedan tapados.

## [0.7.0] - 2026-10-13

### Agregado
- **TV en vivo** (`/tv`), en el menú de los dos temas.
  - Canales gratis de Argentina de la lista abierta de iptv-org, en cuatro categorías: Aire, Noticias, Deportes y Música.
  - Se ocultan los canales de cable pago que trae la lista (ESPN, TyC Sports, Disney, AMC…). Tampoco aparecen los que
    piden cabeceras especiales para verse ni, en la versión publicada (https), los que solo transmiten por `http://`.
  - Cada canal es un botón que se elige con el control remoto. El reproductor queda fijo a la izquierda mientras
    se recorre la lista en la PC y la TV.
  - Zapping con CH+ / CH− (o Re Pág / Av Pág), número de canal directo y ▲ ▼ en pantalla completa.
  - Favoritos y último canal visto. Se guardan en la copia de seguridad.
  - Aviso en los canales que no transmiten todo el día o que solo andan en su zona. Si un canal no responde,
    ofrece probar de nuevo o pasar al siguiente.
  - Si el navegador no deja arrancar con sonido, el canal empieza silenciado y se activa con un botón.

## [0.6.0] - 2026-10-13

Addons, TV y apariencia (la última de las tres versiones del cuestionario de funciones), con el **Tema 2** opcional.

### Agregado
- **Tema 2 (nuevo)**, en Ajustes → Apariencia. El Tema 1 (por defecto) queda exactamente como antes.
  - Riel lateral en PC y TV, y barra de navegación abajo en el celular.
  - Portada y ficha en tarjetas redondeadas, "Seguir viendo" con tarjetas apaisadas y acento lila.
  - Letras Sora y DM Sans, incluidas en la app (andan sin conexión y solo se bajan con el Tema 2).
  - Anillo de foco grueso para el control remoto. Se aplica al instante y sin parpadeo al abrir.
- **Explorar addons**: la colección oficial de Stremio, para instalar con un toque.
- **Activar o desactivar addons** sin desinstalarlos.
- **Gestor de catálogos** (`/settings/catalogs`): renombrar, ocultar, reordenar y fusionar filas. Se aplica en
  Inicio y en Descubrir.
- **Importar desde Stremio**: addons, biblioteca (a Mi lista) e historial con progreso. Se puede entrar con email
  y contraseña, con la clave de sesión o pegando un JSON. La contraseña y la sesión no se guardan.
- **Protector de pantalla**: fondos de pelis con reloj después de 5 min sin actividad (configurable o apagado).
- **Teclado en pantalla** para escribir con el control remoto (Buscar, Ajustes y el asistente). Modo TV
  automático o manual.
- **Más reproductores externos**: VLC, mpv, IINA, PotPlayer, Infuse, Outplayer, nPlayer, Just Player, MX Player…
  Solo se ofrecen los de tu sistema.
- **Modo sin conexión**: la app abre igual con Seguir viendo, Mi lista, Historial y las fichas visitadas, con un
  aviso arriba.
- **Asistente inicial** (idiomas, primer addon y key de TMDB) y **Ajustes esencial/avanzado**.

### Corregido
- Descubrir: en una fila fusionada el filtro de género usa los géneros de todos sus catálogos.

## [0.5.0] - 2026-10-13

Descubrir, ficha y biblioteca (segunda de las tres versiones del cuestionario de funciones).

### Agregado
- **Búsqueda mientras escribís** y **búsquedas recientes** (se borran de a una o todas).
- **Personas en la búsqueda** (con TMDB) y **"juntos"**: escribí "Darín y Francella" o usá "Buscar con otra
  persona…" en la página de alguien para ver los títulos donde aparecen los dos.
- **Filtros y orden en Descubrir**: género, años, puntaje mínimo y orden; con TMDB también idioma, país y plataforma
  en Argentina. Quedan en la URL, así que al volver de una ficha siguen puestos.
- **Listas curadas** (`/lists`): mejor puntaje de IMDb (aproximación con las más populares de Cinemeta),
  ganadoras del Oscar a Mejor película (Wikidata) y, con TMDB, sagas y listas temáticas. Se pueden sumar a Inicio.
- **Etiquetas clickeables** en la ficha: géneros, dirección, elenco y palabras clave.
- **Puntaje de IMDb sobre el póster** (o debajo, o sin puntaje) y **etiquetas**: Episodio nuevo, Temporada nueva,
  Top 10 y Estreno.
- **Tráiler al pasar por un póster**: a los 2 s, sin sonido y con subtítulos en español (no en el celular).
- **"¿Sabías que?"** en la ficha, con datos de Wikipedia en español.
- **Tu puntaje con estrellas** (de 0,5 a 5) en la ficha y al terminar de ver algo. Se ve en Mi lista, Historial y el Diario.
- **"Ya no me interesa"**: saca el título de las recomendaciones y filas de Inicio (se deshace desde Ajustes).
- **Para vos**: recomendaciones con TMDB según lo que viste y puntuaste, con **el porqué** en una línea.
- **Modo sin spoilers**: difumina las miniaturas y oculta la sinopsis de los episodios que no viste.
- **Diario** (`/history/diary`): todo lo que viste con fecha, agrupado por mes y día, con "La volviste a ver".
- **Tu año en modo historia**, animado, con **Compartir** (imagen de 1080×1920).
- **Metas y logros** (`/history/goals`): meta anual de pelis, episodios u horas y 11 logros.

### Corregido
- Selector de Descubrir: al abrirlo con el mouse, Escape/Atrás volvía a la página anterior en vez de cerrarlo.
- La caché de imágenes del service worker guardaba respuestas opacas, que Chrome cuenta como ~7 MB cada una:
  podía llenar la cuota del navegador y entonces dejaban de guardarse ajustes, progreso y Mi lista sin avisar.

## [0.4.0] - 2026-10-13

Reproductor, subtítulos y fuentes (primera de las tres versiones que salieron del cuestionario de funciones).

### Agregado
- **Vista previa al adelantar**: al pasar el mouse por la barra se ve el cuadro de ese momento, sin mover el video.
  Anda con enlaces directos y HLS; se apaga en Ajustes y cuando el navegador pide ahorrar datos.
- **Sinopsis al pausar**, junto al reparto: título y resumen del episodio o la peli (en español con TMDB).
- **Escena post-créditos**: si la peli o el episodio tiene una (TMDB o IntroDB), avisa "Quedate…" y la cuenta
  regresiva del siguiente episodio no la corta.
- **"¿Ver el resumen?"**: si hace 7 días o más que no ves la serie, ofrece el "Anteriormente en…" en vez de saltearlo.
- **Cambiar de fuente sin perder el minuto**: menú "Fuentes" en el reproductor; sigue en el mismo segundo y con el
  mismo subtítulo, retraso y audio.
- **Subtítulo propio**: "Cargar archivo…" en el menú de subtítulos o arrastrando el archivo (.srt, .vtt, .ass, .ssa).
- **Más estilo de subtítulos**: letra, altura, fondo suave y contorno, con vista previa. Opción para ocultar los
  subtítulos para sordos (SDH) y sacar las descripciones de sonidos.
- **Idioma por serie o peli**: el subtítulo y el audio que elegís a mano quedan guardados para ese título
  ("Olvidar idiomas de esta serie" para volver a los de Ajustes). Entra en la copia de seguridad.
- **Subtítulos forzados automáticos**: si no hay subtítulos y el audio está en tu idioma, activa solo los carteles forzados.
  Las pistas de subtítulos de los HLS ahora aparecen en el menú.
- **Filtros de fuentes**: tamaño máximo, descartar HEVC/AV1, HDR/Dolby Vision (permitir, preferir o excluir) y
  ocultar repetidos. Lo descartado queda plegado en "Ocultos por tus filtros", con el motivo.
- Los **clips de menos de 5 minutos** ya no cuentan en el historial ni en "Seguir viendo".

### Corregido
- Al elegir un subtítulo se borraban también las pistas que crea hls.js.
- En el celular, el reparto al pausar y los menús del reproductor tapaban los controles.

## [0.3.0] - 2026-10-13

TMDB, opcional: sin key la app sigue igual que antes, solo con Cinemeta.

### Agregado
- **Key de TMDB en Ajustes**. Acepta la API Key (v3) o el Read Access Token (v4), la prueba antes de guardarla y queda
  solo en el navegador (no está en el código).
- **Ficha en español**: título, sinopsis, frase y logo del título. El tráiler viene de TMDB y prioriza el que está en español.
- **Reparto con fotos** en la ficha y **página de cada actor o actriz** con su biografía y filmografía.
- **Sagas**: "Parte de la colección…" con todas las películas en orden.
- **Más como esto**: recomendaciones de TMDB en la ficha.
- **Dónde ver en Argentina**: plataformas de streaming, alquiler y compra (datos de JustWatch vía TMDB).
- **Inicio**:
  - portada con las tendencias del día, el logo y el **tráiler sin sonido** de fondo (se puede apagar en Ajustes;
    no se reproduce en el celular ni con "reducir movimiento");
  - **Top 10 de hoy**;
  - **Porque viste…**, con recomendaciones a partir de lo último que viste;
  - **Tendencias de la semana**.
- **Reparto al pausar** (tipo X-Ray): al pausar aparece quién actúa en ese episodio, con los invitados marcados, o en la peli.
  No usa reconocimiento de caras.
- Las imágenes de TMDB quedan en la caché del service worker.

### Corregido
- `npm test` corría también las copias de los tests en `.claude/worktrees`. El PR de la v0.2.0 informó 22 tests,
  pero son 11.

## [0.2.0] - 2026-10-13

### Agregado
- **Saltar intro, resumen y créditos** con los tiempos de IntroDB (botón o automático). Se consultan a través de
  una Pages Function (`/api/segments`) porque IntroDB no permite llamadas desde otros sitios.
- **Siguiente episodio con cuenta regresiva** al empezar los créditos (o 30 s antes del final), con "Ver ahora" y "Cancelar".
- **¿Seguís viendo?** después de N episodios seguidos sin tocar nada, y **temporizador para dormir**
  (15/30/60 min o fin del episodio).
- **Subtítulos**: se activan solos en el idioma preferido, estilo configurable (tamaño, color, fondo) y ajuste de retraso ±0,5 s.
- **Audio**: elige sola la pista en el idioma preferido (HLS).
- **Abrir en otro reproductor** (VLC o el selector de Android); en PC copia el enlace.
- **Elección automática de fuente**: modo "Elegir yo" o "Automático" con calidad preferida y palabras a preferir o
  excluir (por defecto se excluyen CAM, TS, etc.). Aviso de 3 s con "Elegir otro" antes de reproducir.
- **Recordar la última fuente** de cada serie y usarla en el siguiente episodio. Badge "Recomendado" en la lista de streams.
- **Precarga** de los streams del siguiente episodio al pasar el 70 %.
- **Quitar de "Seguir viendo"** con ✕ y opción de deshacer.
- Fila **"Tus series: siguiente episodio"** en Inicio.
- **Calendario** de estrenos de tus series (próximos 60 días y última semana).
- **Tu año**: horas vistas, géneros favoritos, series más vistas, rachas, día favorito y mapa de actividad.
- Ajustes nuevos: "Reproductor" y "Elección de fuente".

### Cambiado
- Mientras se buscan streams se muestra "Buscando streams…" y ya no se mezclan los del episodio anterior.
- Con el control remoto: ↑/↓ recorren los menús del reproductor y Enter funciona en los botones del cartel de error.

## [0.1.0] - 2026-10-13

Primera versión.

### Agregado
- PWA con React + Vite, instalable en PC, celular y TV.
- Cliente del protocolo de addons de Stremio: catálogos, metadatos, streams y subtítulos.
- Cinemeta preinstalado, con el puntaje de IMDb en pósters, portada y ficha.
- Inicio con portada rotativa, "Seguir viendo" y filas de catálogos con carga diferida.
- Páginas de películas y series con filtro por catálogo y género, y scroll infinito.
- Búsqueda en todos los addons que la soportan.
- Ficha con temporadas, episodios, marcar como visto, tráiler y enlace a IMDb.
- Reproductor con HLS, subtítulos (SRT→VTT), pistas de audio, reanudar y siguiente episodio automático.
- Historial agrupado por día, con filtros y estadísticas. "Mi lista" con orden por fecha, puntaje o nombre.
- Ajustes: gestión de addons, servidor local de Stremio (experimental), subtítulos preferidos, copia de seguridad.
- Navegación con control remoto (flechas, Enter, Atrás).
- Caché stale-while-revalidate (memoria + IndexedDB) y service worker para cargas casi instantáneas.
- Agentes de agency-agents, skill + MCP de rea y script de instalación global para Claude Code.
