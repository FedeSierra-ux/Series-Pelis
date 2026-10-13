# Changelog

## [0.9.1] - 2026-10-13

### Arreglado
- **Pantalla en negro al cambiar de sección** (Chrome 150 en adelante, en PC y celular): desde esa versión
  `window.scrollTo()` devuelve una promesa, y el efecto que subía la página al navegar (en la v0.8) la devolvía como
  si fuera su limpieza. Al ir a otra página React intentaba llamarla, tiraba "is not a function" y se caía toda la
  app. La v0.9.0 ya no lo tenía; ahora un test revisa que ningún efecto vuelva a devolver llamadas del navegador que
  dan promesas.

### Cambiado
- Cambiar de página ya no vuelve a armar toda la app: el menú, el protector de pantalla y los avisos quedan
  montados y solo se rearma la pantalla nueva (menos trabajo en cada click, se nota en la TV). Si una pantalla
  falla, al ir a otra se sigue recuperando sola.

## [0.9.0] - 2026-10-13

Auditoría completa de la v0.8 (revisión de código, pruebas reales en PC, celular y TV, y auditoría visual): 40 bugs
arreglados, la TV más cómoda y cuatro funciones nuevas.

### Agregado
- **Aviso de versión nueva**: la app ya no se recarga sola; abajo aparece "Hay una versión nueva de Series-Pelis"
  con "Actualizar" y "Después" (se maneja con las flechas y Atrás lo cierra).
- **Memoria de foco y scroll**: al volver con Atrás, la pantalla aparece donde estaba y el cursor vuelve al póster o
  episodio del que saliste, en vez de ir al "Ver ahora" de arriba.
- **Series**: "Continuar" o "Ver ahora" lleva directo al episodio que corresponde, y si ya la empezaste,
  "Ver desde el principio" arranca el primer episodio desde cero.
- **Marcar temporada como vista** (y "como no vista" cuando está completa) para los episodios ya estrenados, con una
  sola anotación en el historial y el diario.
- Estados vacíos nuevos en Mi lista, Historial, Calendario, Tu año, Buscar, Diario y Metas, con ícono, explicación y un
  botón para seguir (por ejemplo "Explorar películas").
- Buscar avisa cuando ningún addon activo permite buscar (por ejemplo con Cinemeta apagado), con un botón a Ajustes.
- Los streams que necesitan cabeceras especiales (que el navegador no puede mandar) aparecen marcados como no
  reproducibles, con el aviso de abrirlos en un reproductor externo.
- La tarjeta de error del reproductor muestra qué título y episodio no pudo cargar; en la TV es más grande y se saca
  "Copiar enlace".
- Revisión automática en GitHub (tipos, tests y build) en cada cambio.

### Cambiado
- TV: todo se ve más grande para leerlo a tres metros (letra de 22 px, títulos de fila, pósters de 240 px, chips,
  pestañas, botones y el menú lateral del Tema 2 con más espacio). Se activa solo al detectar un televisor o con el
  ajuste "Interfaz para TV".
- Tema 2: la portada de Inicio ahora es redondeada y con margen, igual que la de la ficha.
- Los desplegables (Mi lista, Ajustes) tienen una flecha propia y el estilo de cada tema.
- TV en vivo en PC y TV: la lista de canales se desplaza dentro de su panel y el reproductor queda siempre a la vista.
- El mensaje de error del reproductor en la TV es más ancho, con letra y botones más grandes.
- Íconos de línea en el menú del Tema 1, en los botones del Historial y en "Teclado", en lugar de emojis (se ven
  iguales en cualquier dispositivo).
- "Ordenar" en Mi lista, "Calidad preferida" y "Tamaño máximo" en Ajustes y "Fusionar con…" en Catálogos usan el
  selector propio, que anda con el control remoto.
- En la ficha se dice "Fuentes" en vez de "Streams", y el puntaje de cada episodio usa la insignia de IMDb con un
  decimal (★ 8.0).
- Los episodios y videos cortos ya quedan en el historial: desde 1 minuto (episodios) o 2 (películas y otros); antes
  hacían falta 5.
- La copia de seguridad ya no incluye la key de TMDB (y si una copia vieja la trae, no pisa la tuya).
- Los addons se actualizan en segundo plano una vez por día, no en cada arranque; así Buscar, "Tus series" y
  "Tu año" no repiten pedidos al abrir la app.
- El servicio de "saltar intro" del sitio solo responde a la app, y la caché de Cinemeta ya no guarda respuestas que
  no puede leer.
- Las direcciones que no existen llevan a Inicio y la URL cambia.

### Arreglado
Reproductor:
- Si una fuente no cargaba y elegías otra, la nueva arrancaba desde cero y pisaba el punto donde habías quedado.
  Ahora sigue desde donde estabas.
- Si salías del reproductor mientras buscaba el siguiente episodio, la app te llevaba igual al episodio.
- En modo automático, al volver del reproductor después de que pasó solo al siguiente episodio, la ficha ya no vuelve
  a reproducirlo.
- Al salir con el botón "atrás" del navegador se perdían los últimos segundos vistos.
- Al terminar una temporada, si no encontraba fuente para seguir solo, la ficha se abría en la temporada equivocada.
- "Siguiente episodio" ya no apunta a capítulos que todavía no se estrenaron, y se calcula bien con addons que
  numeran los episodios de otra forma.
- Un corte de internet o un tropiezo del decodificador en streams HLS ya no termina en la tarjeta de error: primero se
  reintenta un par de veces.
- Dos streams distintos con una etiqueta genérica ("Latino 1080p") y el mismo tamaño ya no se ocultan como "Repetido".
- Subtítulos .srt con la hora de un solo dígito (0:00:01) no se mostraban, y "Ocultar sonidos" borraba el "NO:",
  "SÍ:" u "OK:" con que arrancaban algunas frases.
- Al salir del reproductor el video seguía descargándose en segundo plano.
- Volver a ver algo que ya habías terminado ahora retoma y aparece en "Seguir viendo"; al terminarlo otra vez,
  "Tu año" y el diario lo cuentan de nuevo.

TV y control remoto:
- El póster o episodio enfocado ya no queda cortado contra el borde ni tapado por la barra de arriba: se centra.
- En los selectores, bajar más allá de la última opción (o subir más allá de la primera) ya no cierra la lista ni
  deja el foco perdido; al cerrar, el foco vuelve al botón.
- Un selector nativo enfocado ya no hace que Atrás se vaya de la página.
- En el asistente inicial, Atrás vuelve un paso (o lo cierra en el primero) en vez de cambiar la página de abajo.
- El tráiler flotante ya no se queda con Backspace ni con la M mientras escribís en Buscar.

Ficha, Inicio y Descubrir:
- En el celular, al tocar un episodio las fuentes aparecen justo debajo, a la vista, en vez de quedar fuera de pantalla.
- Las fechas de estreno de los episodios ya no se muestran un día antes y coinciden con el Calendario.
- Abrir un título que no existe muestra "No encontramos este título" con un botón para volver, en vez de una ficha vacía.
- En el reparto, un actor con varios papeles aparece una sola vez con todos sus personajes.
- "Tu puntaje · Sin puntuar" ya no se parte en dos líneas en el celular.
- La portada de Inicio ya no queda cargando para siempre si el catálogo vuelve vacío o sin fondos.
- "Ya no me interesa" también oculta el título en Descubrir, como en Inicio y Buscar.
- Descubrir ya no pide páginas sin parar con addons que dicen paginar pero devuelven siempre lo mismo.
- El progreso de las sagas y las listas de Descubrir usan la fecha de acá, no la de Londres: de noche ya no aparecen
  "estrenos de mañana".

Ajustes, datos y TV en vivo:
- Se puede tener el mismo addon dos veces con distinta configuración (por ejemplo, Torrentio con TorBox y Torrentio
  con Real-Debrid): ahora se distinguen por la URL.
- Importar la misma copia dos veces seguidas vuelve a funcionar, y una copia con datos rotos ya no mete basura.
- Al pegar algo que no es una dirección al agregar un addon, el aviso dice que la URL no es válida.
- Sin conexión, los avisos dicen "Sin conexión" en vez de "el servidor puede estar caído", y si falta descargar una
  parte de la app lo explica con un botón "Probar de nuevo".
- TV en vivo: "Pantalla completa" funciona en iPhone, y los canales con coma en el nombre ("Canal 9, Buenos Aires")
  ya no se cortan.
- La lista "Ganadoras del Oscar" avisa cuando está tardando más de lo normal y ofrece probar de nuevo si falla.

Apariencia:
- El botón "Ver ahora" del Tema 1 tenía poco contraste: ahora el texto blanco cumple AA (≥ 4,7:1), también al pasar
  el mouse.
- La portada que se mostraba mientras cargaba no brillaba y saltaba al aparecer la real: ahora mide lo mismo y tiene
  la animación.
- En el celular, "Ver ahora" y "+ Mi lista" miden lo mismo en vez de uno estirado y otro chico.
- En el celular, el tilde de "episodio visto", los filtros de TV en vivo, "Filtros", las pestañas y los botones chicos
  (Metas, "Mostrar en Inicio") miden al menos 44 px para tocarlos sin errar.
- Radios de esquina unificados en variables (`--radius-sm`, `--radius`, `--radius-lg`) para que los dos temas se
  mantengan parejos.

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
