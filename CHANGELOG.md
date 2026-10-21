# Changelog

## [0.30.0] - 2026-10-21

### Agregado
- **Flix para Windows** (`desktop-app/`, Electron): la misma app (login, perfiles e historial) con un **motor de
  torrents** y la **conversión de video** adentro, como Stremio de escritorio. Elegís el torrent y reproduce, sin
  debrid y sin instalar nada más; lo que Chromium no puede (AC3, DTS, 5.1, varios audios) se convierte solo.
  Instalador básico `flix-pc-setup.exe` que **se actualiza solo** desde GitHub Releases (Ajustes → App de Windows).
- **Torrents por TorBox en el navegador**: un torrent sin debrid usa su par de TorBox (mismo torrent y archivo).
  Lo que TorBox ya tiene arranca enseguida; lo que no, muestra **"TorBox lo está bajando…"** con el tiempo de espera
  y el video **arranca solo** cuando está listo.
- Ajustes → **App de Windows**: en la app, versión y actualizaciones; en el navegador de Windows, el botón
  **Bajar Flix para Windows**.

### Cambiado
- Se fue el aviso **"Descargar Stremio Service"** de las fuentes y del reproductor. Si Stremio Service está abierto
  en la compu, Flix lo sigue usando solo.
- En el navegador, si TorBox falla, el cartel ya no ofrece "Reproducir por torrent" (no hay con qué): queda
  "Probar de nuevo".

## [0.29.0] - 2026-10-21

### Agregado
- **Torrents sin debrid en la PC**, como Stremio Web: con **Stremio Service** abierto en la compu, Flix lo encuentra
  solo (`127.0.0.1:11470`) y los torrents de Torrentio se reproducen en el navegador.
- Pantalla **"Conectando con el torrent…"** con cuánta gente lo comparte y a qué velocidad baja.
- **Conversión automática** (HLS a través del servicio) de lo que el navegador no puede abrir: MKV con x265, audio
  AC3/E-AC3 o 5.1, varios audios. También para los links directos marcados como "no aptos para la web".
- Aviso en las fuentes cuando no se encuentra el servicio, con **Descargar Stremio Service** y **Probar de nuevo**
  (se vuelve a buscar solo al volver a la pestaña). El estado se ve en Ajustes → Reproductor.

### Cambiado
- Si Stremio Service no está abierto al darle a reproducir un torrent, el cartel ofrece descargarlo o probar de nuevo.

## [0.28.0] - 2026-10-19

### Agregado
- **Títulos en español latino** (los de TMDB, como en Netflix o Disney+ Argentina) en pósters, filas, portadas,
  Seguir viendo, Mi lista, historial, calendario, Tu año, la ficha, el reproductor y las filas del inicio de la TV.
  Los logos y los títulos de los episodios siguen en el idioma original. Sin TMDB queda el nombre de Cinemeta.
- Ficha: con logo, el nombre en español debajo cuando el logo dice otro; sin logo, el título en español y
  "Título original: …".
- **Buscar** encuentra por el nombre en español y por el original (también trae títulos de TMDB que no están en
  los catálogos de los addons).

### Cambiado
- **Portada de Inicio más grande** y sin el buscador de arriba: Buscar queda en el menú de la izquierda.

## [0.27.1] - 2026-10-19

### Cambiado
- **Fuentes**: la recomendada va siempre primera (su addon arriba de todo). Si un addon lento trae algo mejor, la
  recomendación cambia y la lista se reacomoda.
- Idiomas de las fuentes: el audio de España dice **"España"** (antes "Castellano") y una fuente con varios
  idiomas que trae latino dice **"Latino"**.
- Buscar: en "Mejor resultado", con empate gana el título y no la persona.
- **Top 10** con el número más chico (70 % del póster), igual en Inicio, Películas y Series, en todas las pantallas.
- Sin la etiqueta "Top 10" sobre los pósters de las filas de Inicio, Películas/Series y la grilla.
- **Halo solo en los logos oscuros** (también en la ficha, donde antes no había): los claros van sin halo.
- Reproductor: sin botón ni teclas de velocidad (siempre 1×). En el celular la barra va siempre en una fila: el
  temporizador se ve como un globito sobre la luna y, por debajo de 360 px, pasa a "Más opciones" (⚙).
- Cartelito al pasar el mouse en ← (volver) y en Bloquear.
- Celular apaisado: el subtítulo sube por encima de "Saltar" y de las tarjetas de la esquina, como en vertical.
- Asistente inicial: si la primera sincronización da error, no se abre (como cuando tarda más de 10 s).

### Arreglado
- Películas y Series: moviéndose con Tab, el título de la fila enfocada ya no queda tapado por la portada.
- Los esqueletos de los pósters ya no hacen saltar la fila cuando cargan.
- Vos e Historial en el celular: el anillo de foco de los chips ya no se corta.
- Ajustes → Casa: "Sí, sacar" mantiene el aspecto de botón y en el celular "No" no baja a otro renglón.

## [0.27.0] - 2026-10-19

### Agregado
- **TorBox a través de Torrentio** para todas las casas. La key va dentro del addon (la carga el administrador); la
  app nunca la guarda aparte. Guía de configuración en el README.
- **Lo que TorBox todavía no tiene** ("tiene que descargarse"): arranca por torrent (app de Android o Stremio en la
  PC) y al mismo tiempo le pide a TorBox que lo baje, así la próxima vez ya está listo.
- **Si TorBox falla** con una fuente (límite de descargas, cuenta, video que no pudo preparar): cartel con el motivo y
  el botón **"Reproducir por torrent"**. Nunca pasa solo. En la app de Android dice el motivo exacto.

### Cambiado
- Elección de fuente: lo que TorBox ya tiene listo gana siempre a lo que tiene que descargarse, aunque sea de menor
  calidad (lo segundo va por torrent).

## [0.26.3] - 2026-10-19

### Cambiado
- **Asistente inicial**: si la casa tarda más de 10 segundos en sincronizar, ya no se abre igual. El aparato usa los
  idiomas de fábrica (o los de la casa cuando termina de sincronizar); si la casa todavía no eligió, aparece la
  próxima vez que se abra la app.

## [0.26.2] - 2026-10-19

### Cambiado
- **Asistente inicial**: si la casa ya eligió los idiomas (en el asistente de otro aparato o en Ajustes), un
  aparato nuevo de la casa ya no lo muestra. Se puede abrir igual desde Ajustes. Sin login, igual que antes.

## [0.26.1] - 2026-10-18

### Cambiado
- **Subtítulos en el celular**: con los controles a la vista, el subtítulo sube por encima de **todo** lo que haya
  en la esquina: "Saltar", la tarjeta "Siguiente episodio", la oferta de resumen y "Más como esto". Queda arriba
  aunque tenga 4 o 5 renglones o esté en tamaño "Muy grande" (antes se encimaba). Sin controles, en PC y en la TV,
  igual que antes.

### Arreglado
- Series de una sola temporada: el año sin guion ("2025" y no "2025–") también en los pósters, Buscar, la portada
  de Inicio, el tráiler al pasar, el protector y "Más como esto", cuando la ficha de la serie ya se cargó.
- Asistente inicial: con la sesión guardada también espera la primera sincronización, así muestra los idiomas de
  la casa y no los de fábrica.

## [0.26.0] - 2026-10-18

Rediseño con las **45 propuestas visuales aprobadas** en la página de la auditoría (4 votadas "no" quedan como
estaban: explorar-11, ficha-09, reproductor-07 y vos-ajustes-04). El debrid (TorBox) que estaba planeado para
esta versión pasa a la **v0.27.0**.

### Cambiado
- **Inicio**
  - Halo claro en los logos de la portada y las tarjetas apaisadas, así los logos oscuros se leen en la TV.
  - Las filas corridas ya no dejan asomar el póster anterior (PC con mouse y TV).
  - Top 10 en el celular con el número más chico y metido debajo del póster; el esqueleto reserva el lugar del
    número, así la fila no salta al cargar.
  - "Para vos" muestra la razón una sola vez, debajo del título ("Porque viste…"), si es la misma para toda la
    fila. Las filas de recomendaciones no repiten la etiqueta "Top 10".
  - "¿Quién está mirando?" más grande en la TV; asistente inicial y editor de perfil más prolijos en el celular
    (la barra de Guardar queda abajo sin tapar los colores).
  - Los avisos dicen **"Eliminado de Seguir viendo"** y **"Eliminado del historial"**; en el celular ocupan todo
    el ancho.
- **Películas, Series, Buscar y Persona**
  - El título de la fila enfocada queda a la vista debajo de la portada fija.
  - La portada que sigue al foco muestra el póster difuminado mientras carga el fondo.
  - Top 10 más chico en el celular y sin la etiqueta "Top 10" repetida sobre el póster.
  - Tira de listas curadas con fundido al borde; chips de género tonales en Buscar.
  - "Mejor resultado": si buscás a una persona (por ejemplo "ricardo darín"), gana la persona y la fila
    Personas va primero; sin imagen, la caja no ocupa alto de más.
  - Buscar en la TV con el teclado en pantalla: teclado a un costado y resultados al otro.
  - Pestañas de Buscar compactas en el celular (arregla "Personas" cortada en pantallas chicas).
  - Persona en el celular: foto al lado de los datos y biografía con "Leer más".
- **Ficha**
  - En el celular la portada es más baja y "Reproducir" se ve en la primera pantalla.
  - Sinopsis con "Leer más" / "Leer menos"; títulos largos más chicos.
  - Las fuentes muestran etiquetas (calidad, HDR, audio, idioma, peso, servicio, en caché) en vez del texto crudo
    del addon, que queda al pasar el mouse; en PC grande van en dos columnas. Arriba, un resumen: "6 listas para
    ver · 2 torrents sin debrid · 1 oculta por tus filtros".
  - Series: los episodios vistos se ven atenuados y el siguiente, resaltado. Sin episodio elegido, el panel de
    fuentes muestra ese siguiente episodio (T1 E1 si no viste nada) con "Ver fuentes de este episodio".
  - Episodios más prolijos en el celular; "Sin spoilers" con un ícono de ojo tachado en vez del 🙈; el episodio
    1 nunca va difuminado.
  - Reparto en dos renglones; la ayuda de las estrellas dice "Tocá una estrella" en el celular.
  - Sinopsis de los episodios en español desde TMDB (solo si la fecha de estreno coincide).
- **Reproductor**
  - Barra de arriba más legible, spinner con el acento, y los subtítulos se esconden mientras arrastrás la barra.
  - Botones de la barra con íconos y **una etiqueta que dice qué hace cada uno** al pasar el mouse o el foco.
  - En el celular, una sola fila de íconos de 44 px; "Abrir en…" y "Ventana flotante" pasan a ⚙ → "Más
    opciones". La tarjeta del siguiente episodio ocupa una fila.
  - En la TV, botones e íconos más grandes.
  - En el celular, con los controles a la vista, el subtítulo sube para que "Saltar intro" no lo tape.
- **Vos y Ajustes**
  - Mi lista en 3 columnas en el celular; filtros del historial en un renglón; Vos vacío sin estadísticas ni
    filtros de más.
  - Metas y logros más prolijos; Tu año sin columna vacía en la TV.
  - "Estilo de subtítulos" con rótulos (Tamaño, Color, Fondo, Letra, Posición).
  - "Sacar" un aparato en el mismo renglón; Explorar addons más prolijo.
  - **Tu año ya no estima horas**: lo marcado como visto sin reproducirlo cuenta como peli o episodio, pero no
    suma tiempo (se fue el "(aprox.)").

### Arreglado
- La saga de la ficha queda sin «Estás acá» (votaste no a ficha-09): el cambio no había llegado a la v0.25.1.

## [0.25.1] - 2026-10-18

Arreglos de la auditoría visual (50 de 53 puntos) y de la revisión del motor de torrents.

### Arreglado
- **Inicio y navegación con el control remoto**
  - Al volver de una ficha, el foco vuelve a la misma fila (aunque el título esté repetido en el Top 10), la fila
    queda corrida igual que la dejaste y la tarjeta entera a la vista. También en filas lejanas que cargan tarde,
    y la portada muestra el título correcto.
  - ← desde la primera tarjeta entra al riel por la página actual, no por "Ajustes" o "Vos".
  - El anillo de foco de los pósters ya no se corta arriba (Inicio, Películas, Series y Vos).
  - En la TV los números del Top 10 no se meten debajo de la tarjeta anterior.
  - La etiqueta "Estreno" deja lugar al badge de IMDb.
  - En el celular, la portada ya no tiene una muesca abajo.
  - "¿Quién está mirando?": los nombres no se cortan a mitad de palabra. En el editor, el campo "Nombre" se ve
    sin enfocarlo.
- **Películas, Series y Buscar**
  - **El arreglo de pósters cortados de la v0.25.0 estaba incompleto**: al volver de una ficha o al bajar con las
    flechas, la fila y su título quedan debajo de la portada, fuera del fundido.
  - La portada sigue al póster enfocado; el mouse solo la cambia si se mueve de verdad.
  - "Mejor resultado" usa el póster si el fondo no carga (antes quedaba una caja vacía).
  - Los chips de género de Buscar tienen el mismo tamaño que los de Filtros, y en el celular el botón "Filtros"
    tapa bien los chips de atrás.
  - Los puestos del equipo técnico (dirección, guion, música…) salen en español.
- **Ficha**
  - Con el control se llega a las fuentes de una peli desde las pestañas.
  - En el celular, la fuente que tocaste ya no queda resaltada.
  - La lista de fuentes ya no se reordena sola a los pocos segundos.
  - En una serie, → desde un episodio ya no salta a la portada, y ← desde las fuentes vuelve al episodio.
- **Reproductor**
  - El temporizador para dormir recuerda y marca los minutos elegidos.
  - "Saltar intro/resumen" ya no le roba el foco a los controles o a un menú abierto, y no muestra un anillo de
    foco que nadie pidió. En el celular sube para no pisar la barra.
  - El aviso de escena post-créditos, "¿Qué te pareció?", el reparto de la pausa y los avisos ("Continuando
    desde…") ya no se pisan entre sí.
  - La ayuda "← → para elegir" de las estrellas sale solo con teclado o control.
  - En la TV, los controles y los menús respetan la zona segura (5 %).
- **Vos, Ajustes y login**
  - → ya no salta a "Quitar de Seguir viendo" fuera de pantalla (ni lo borra con OK sin verlo).
  - En el número de la meta, ← y → salen del campo.
  - Tu año, la meta y el historial cuentan las horas igual.
  - Ajustes: ↓ se queda en el contenido, el índice marca la sección donde está el foco, sus anillos entran
    enteros y "Soy el administrador" y los desplegables se alcanzan con las flechas.
  - Los campos de email y número tienen la misma píldora que el resto; "Apaisada" prendida se ve con un ✓; al
    renombrar un catálogo en el celular el campo ocupa todo el ancho.
  - "addon_catalog" dice "lista de addons"; los episodios dicen "✓ Visto" / "Empezado".
  - El botón "Entrar" de la invitación queda dentro de la tarjeta; tras un código inválido el foco vuelve al campo.
- **Motor de torrents (app de Android)**
  - Si la web abre antes de que arranque el motor, espera unos segundos en vez de pedir "actualizá la app".
  - Una lectura ya no se puede trabar si se pierde un aviso interno del motor, y gasta menos CPU.
  - Las carpetas temporales se borran al cerrar y las que quedaron de antes se limpian solas.
  - Volver a la app después de un rato en segundo plano no borra el torrent que estabas viendo.
  - En pausa no vuelve a anunciarse a los pares.
  - Los links de torrent con muchos trackers ya no fallan (se recortan trackers si hace falta).
  - Solo se da por perdido un torrent cuando nadie lo comparte (504) o se corta por tiempo; los otros errores
    se reintentan.

### Cambiado
- **Quitar algo del historial** muestra "Quitado del historial" con **Deshacer** durante 6 segundos.
- El resumen de cada mes cuenta lo terminado y aparte dice "N sin terminar"; coincide entre Vos e Historial.

## [0.25.0] - 2026-10-18

### Agregado
- **Torrents sin debrid en la app de Android** (TV, Fire TV y celular, el mismo APK): la app trae su propio motor
  de torrents, como Stremio. Las fuentes de torrent de los addons (las que no tienen debrid) se reproducen en el
  reproductor de Android mientras se van bajando. Mientras busca, muestra "Buscando pares…" y después cuántos pares
  hay y a qué velocidad baja.
  - Necesita **Android 9 o más nuevo** y el reproductor de Android prendido (Ajustes → Reproductor). En un aparato
    más viejo la app anda igual que antes, sin torrents.
  - Usa hasta unos 110 MB de espacio por torrent mientras mirás y lo borra al cerrar; guarda 2 torrents como mucho.
  - Si nadie comparte el torrent avisa: "No hay nadie compartiendo este torrent ahora. Probá otra fuente."
  - En la PC los torrents siguen necesitando Stremio abierto (servidor local).
- **Pestaña Detalles en la ficha de las series** (última pestaña): el reparto, creación o dirección, países y
  dónde verla en Argentina (suscripción, alquiler y compra, con datos de JustWatch).

### Cambiado
- **Debrid primero**: la elección automática (y el siguiente episodio) siempre prefiere una fuente directa o con
  debrid antes que un torrent, aunque el torrent tenga más calidad.
- En la lista de fuentes, los torrents que no se pueden abrir en ese aparato dicen por qué (abrir Stremio en la PC,
  prender el reproductor de Android o actualizar la app).
- El APK pesa unos 20 MB más por el motor de torrents.

### Arreglado
- **Pósters cortados en Películas y Series**: al volver de una ficha, el Top 10 quedaba tapado por la portada de
  arriba; y al bajar con el teclado o el control remoto, la fila quedaba cortada debajo de la portada. Ahora la
  fila con el foco siempre queda entera a la vista.

## [0.24.0] - 2026-10-18

### Cambiado
- **El perfil está arriba del riel**, donde estaba la sigla de la app (y arriba a la izquierda en el celular).
  Tocarlo abre "¿Quién está mirando?" para cambiar de perfil o editarlos. Perfiles ya no está en Vos.
- **Avatares fijos**: 80 personajes y animales en 3D (Animales, Personajes y Criaturas) sobre el color del perfil.
  Un perfil nuevo arranca con uno al azar que no use otro perfil.
- **Top 10 de la semana**: Películas y Series muestran las tendencias de la semana de TMDB en vez de "populares
  en plataformas de Argentina", que traía títulos viejos.
- **Ficha de las películas**: el reparto va arriba de las fuentes.
- **Tráiler en latino primero**: primero el subtitulado en latino; si la peli es en español, el de audio latino.
  Después el doblado latino, el subtitulado de España, el original y por último el doblado de España.

### Quitado
- **TV en vivo**: el menú, la página y todo lo relacionado. El link viejo `/tv` lleva a Inicio.
- Avatar con el **fondo de algo que viste**.
- Pestañas **Extras** y **Detalles** de la ficha (dónde verla, premios, palabras clave y "¿Sabías que?").

## [0.23.0] - 2026-10-18

### Cambiado
- **Vos**: arriba van los accesos **Historial, Calendario y Tu año**, en ese orden. Enseguida está **Mi lista
  completa** en grilla, con estrellas y "Ordenar". Abajo siguen Seguir viendo, Te gustaron y Lo que viste.
- **Mi lista salió del menú** (riel y barra de abajo del celular): está en Vos. El link viejo `/list` lleva a Vos.
- **Historial y Diario son una sola cosa**: el Historial se ve como el Diario, agrupado por mes y por día con el
  número grande al costado. Mantiene los filtros Todo, Películas, Series, Sin terminar y Vistas, y la búsqueda.
  El link viejo del Diario lleva al Historial.
- **Tu año**, más simple: quedan las horas, la cantidad de películas, episodios y series, la meta, los géneros y
  las series que más viste.

### Quitado
- Accesos "Diario" y "Metas y logros" de Vos (Metas sigue en el Historial y en el aviso de la meta).
- En Tu año: el mapa "Tu actividad", "Racha más larga", "Tu día favorito", "De punta a punta", la tarjeta de
  películas y el modo historia ("Ver como historia" y la imagen para compartir).
- El atajo de teclado G → L (Mi lista).

## [0.22.6] - 2026-10-18

### Cambiado
- **TV en vivo con tus canales**: la lista ahora tiene solo TN, C5N, Crónica TV, Canal 26, LN+, A24, Televisión
  Pública, Encuentro, Cine.AR, Telefe, El Trece, El Nueve, América TV y Music Top, agrupados en Noticias, Públicos,
  Aire y Música.
- **Solo señales oficiales**: Canal 26, América y Music Top van por el stream del canal; los demás, por la
  transmisión en vivo de su canal oficial de YouTube, dentro de la app. Si no están transmitiendo, aparece el aviso y
  el botón "Abrir en YouTube".

### Quitado
- La lista de iptv-org y los canales que traía.
- **DeporTV**: no tiene ahora ninguna señal oficial que funcione.

## [0.22.5] - 2026-10-18

### Cambiado
- **Orden de Inicio**: arriba va "Seguir viendo" y enseguida el **"Top 10 de hoy"**. Después siguen "Para vos",
  "Porque viste…", las tendencias de la semana y los catálogos de los addons, como antes.
- **Se sacó la fila "Mi lista" de Inicio**: ya está en el menú del costado. Tampoco aparece en Ajustes → Catálogos.

## [0.22.4] - 2026-10-18

### Agregado
- **Botón de atrás en la ficha**: arriba a la izquierda de la portada de la peli o serie, en PC y celular, para volver
  a donde estabas. Si la ficha se abrió con un link directo, lleva al Inicio. En la TV no aparece (está el Atrás del
  control remoto).

## [0.22.3] - 2026-10-18

### Cambiado
- **Modo sin spoilers prendido de fábrica**: viene tildado en las casas nuevas y se prende una sola vez en las que
  ya lo tenían apagado. Si después alguien lo destilda en Ajustes, queda destildado para toda la casa (no se vuelve
  a prender solo). "Ocultar también lo que no empezaste" sigue apagado de fábrica.

### Arreglado
- **Sincronización de ajustes nuevos**: cuando un aparato se actualiza después que otro, los ajustes que trae la
  versión nueva ya no pisan lo que la casa eligió en el servidor (van con el valor de fábrica y gana lo de la casa).
  La primera vez que abre la versión nueva, el aparato vuelve a bajar todos los ajustes de la casa.

## [0.22.2] - 2026-10-18

### Cambiado
- **Año sin guion también en los pósters**: en las tarjetas, Buscar, la portada de Inicio, el tráiler al pasar por un
  póster, "Más como esto" y el protector de pantalla, una serie que **arrancó este año** se ve con el año solo
  ("2026" en vez de "2026–"). Ahí no se sabe cuántas temporadas tiene, así que se adivina: si una serie sacó dos
  temporadas en el mismo año, también va sin guion. En la ficha se siguen contando las temporadas de verdad.

## [0.22.1] - 2026-10-18

### Cambiado
- **Asistente de la primera vez en una sola pantalla**: en un aparato nuevo solo pregunta el idioma del audio y de
  los subtítulos (y si se activan solos), con un botón "Empezar". Se fueron los pasos de addons, TMDB y "Listo":
  TMDB ya viene del sitio y los addons los carga el administrador para todas las casas.
  - Con login, los idiomas son de la casa: el asistente espera la primera sincronización (hasta 10 s) para mostrar
    lo que la casa ya eligió, y lo que se cambie ahí vale para toda la casa.
- **Series con una sola temporada (por ahora)**: el año va solo, sin el guion ("2026" en vez de "2026–"), en la
  ficha y en la portada que sigue al foco. "2019–2019" también queda "2019".
- **Las series ya no muestran la duración** ("50 min") en la ficha ni en las portadas, porque cambia en cada
  episodio. Las películas la siguen mostrando.

## [0.22.0] - 2026-10-16

### Cambiado
- **La app ahora se llama Flix**, en todos lados: título de la página, PWA, menú, inicio de sesión, "Tu año",
  avisos y la app de TV.
- **Ícono nuevo**: una F de neón lavanda sobre fondo violeta oscuro. Está en el favicon, la PWA, el logo del menú y
  la app de Android TV / Fire TV (ícono, banner de la fila de apps y pantalla de inicio).
- App de TV: el identificador pasa a ser `ar.flix.tv`, los enlaces usan `flix://` y el APK se llama
  **`flix-tv.apk`**. Enlace para Downloader:
  `https://github.com/FedeSierra-ux/Series-Pelis/releases/latest/download/flix-tv.apk`.
  - Un APK anterior (`ar.seriespelis.tv`) no se actualiza a este: se instala aparte (y conviene desinstalar el viejo).
  - Las versiones de la TV se publican con etiquetas **`flix-vX.Y.Z`** (antes `tv-vX.Y.Z`). La primera es
    `flix-v0.22.0`.
- Las copias exportadas se llaman `flix-<fecha>.json` y la imagen de "Tu año" `mi-<año>-flix.png`. Las copias
  viejas de Series-Pelis se siguen pudiendo importar.

### Sin cambios
- El sitio sigue en `series-pelis.pages.dev`, y el repo y el proyecto de Cloudflare conservan el nombre. Los datos
  guardados en el navegador no se pierden.

## [0.21.0] - 2026-10-15

### Agregado
- **La app de TV se actualiza desde GitHub Releases.** Al abrir, revisa si hay una versión nueva (como mucho cada
  6 h) y muestra un aviso: tocás **"Actualizar"**, baja el APK, lo verifica y abre el instalador de Android, donde
  solo queda tocar **"Instalar"**. "Después" la esconde 24 h (por versión).
  - Antes de instalar se controla que sea la misma app, una versión más nueva y **firmada con la misma llave**.
  - La primera vez Android pide el permiso de "instalar apps desconocidas"; al volver sigue sola.
  - Ajustes → **App de TV** (solo en la app): versión instalada, "Buscar actualizaciones" e "Instalar".
  - Necesita el repo público y las versiones firmadas con los secretos del repo. Un APK v0.20 o anterior se
    actualiza a mano una vez.
- **"Seguir viendo" en el inicio de Android TV / Google TV.**
  - **"A continuación"** del sistema: lo que estás viendo (con el avance), el episodio siguiente y los episodios
    nuevos de tus series, del perfil activo.
  - Al elegir una tarjeta se abre la app en esa ficha (si era "Seguir viendo", arranca a reproducir), y cambia al
    perfil que corresponda. Si sacás una tarjeta de la fila, no vuelve hasta que avances o cambie el episodio.
- **Fire TV:** el actualizador y los enlaces andan igual, pero el "Continuar viendo" de Amazon solo acepta apps con
  integración de catálogo con Amazon, así que en Fire TV no aparece.

### Cambiado
- El workflow `android-tv.yml` falla si la etiqueta `tv-vX.Y.Z` no coincide con la versión de `tv-app/package.json`.

## [0.20.0] - 2026-10-15

### Agregado
- **Reproductor nativo en la app de Android TV / Fire TV** (Media3/ExoPlayer, se dibuja encima de la web). Lee
  más formatos que el WebView (MKV, HEVC, audio AC3/E-AC3, pistas de audio y subtítulos dentro del video) y anda
  más fluido en la TV. Sigue haciendo lo mismo que el de la web, porque las decisiones las toma la web:
  - **Saltar intro y saltar resumen** (botón o automático, según Ajustes; el resumen no se salta solo si hace una
    semana o más que no ves la serie).
  - **Siguiente episodio**: la tarjeta aparece en los créditos con cuenta de 10 s, y el episodio nuevo arranca sin
    cerrar el reproductor.
  - **Pistas de audio y subtítulos**: los del video, los de los addons y los online en latino, con la misma elección
    automática y el estilo de Ajustes → Subtítulos. Lo que elegís se recuerda para el título, como en la web.
  - **Seguir viendo**: guarda el progreso igual que la web (y arranca donde quedaste). También el "¿Seguís viendo?".
- Ajustes → Reproductor → **"Usar el reproductor de Android"** (solo en la app; prendido de fábrica, por aparato).
  Si Android no puede con un video, sigue solo el reproductor de la web desde el mismo minuto.
- Con un APK viejo (v0.19) la app sigue usando el reproductor de la web.

## [0.19.0] - 2026-10-15

### Agregado
- **App para Android TV y Fire TV** (carpeta `tv-app/`, Capacitor). Abre el sitio a pantalla completa, con el
  ícono y el banner de la app en el inicio de la TV.
  - **Botón Atrás del control**: cierra menús, sale del reproductor o vuelve de página igual que en el
    navegador; en Inicio, la app se va al fondo (como Netflix o YouTube).
  - **Pantalla prendida** mientras se reproduce (el WebView no tiene Wake Lock).
  - **"Abrir en…"** otro reproductor: VLC, MX Player, Just Player o el que elija Android. Si el elegido no está
    instalado, Android muestra la lista de los que haya.
  - El modo TV se prende solo (la app se presenta como "AndroidTV").
  - Sin internet al abrir: una pantalla propia con "Reintentar".
  - La sesión se guarda al pasar la app al fondo (no pide el código de nuevo) y no va a las copias de seguridad
    de Android.
- **APK desde GitHub Actions** (`.github/workflows/android-tv.yml`): se compila en cada cambio de `tv-app/` y, con
  una etiqueta `tv-vX.Y.Z`, se publica en Releases para instalarlo con Downloader. Firma estable con secretos
  del repo (si no están, sale un APK de prueba).
- `src/lib/native.ts`: lo que la web le pide a la app (en el navegador no hace nada).

## [0.18.2] - 2026-10-15

### Seguridad
- El **tope de 6 perfiles por casa** también lo controla el servidor (antes solo la app): un perfil nuevo que no
  entra se rechaza. Borrar uno libera el lugar, también en la misma subida.

## [0.18.1] - 2026-10-15

### Seguridad
- **Borrar el perfil que se está usando** (por ejemplo, desde el celular mientras la TV reproduce) ya no pasa
  el historial de ese perfil al principal: hasta recargar, la app sigue escribiendo en el perfil de la página y,
  mientras borra sus datos, no guarda nada más de ese perfil (antes podía volver a crearlo en el aparato).
- El servidor vuelve a borrar los datos de un perfil si otro aparato lo borró justo mientras se subía su
  progreso (quedaban filas huérfanas que contaban para el tope de la casa).

### Cambiado
- El tope de datos de la casa se mide con el índice de la base: antes cada subida recorría las filas de **todas**
  las casas (D1 cobra por filas leídas).

## [0.18.0] - 2026-10-15

### Agregado
- **Perfiles** (hasta 6 por casa). Cada perfil tiene su historial, seguir viendo, Mi lista, estrellas,
  "no me interesa", diario y metas. Los addons, el debrid y los ajustes generales siguen siendo de la casa, y lo
  físico (modo TV, tamaño de la interfaz, protector, búsquedas…) de cada aparato.
  - **"¿Quién está mirando?"**: en la TV, con más de un perfil, aparece al abrir la app y al cerrarse el protector
    de pantalla; si nadie elige, a los 10 s entra con el perfil marcado (un aro alrededor del avatar muestra la
    cuenta, y cualquier tecla la reinicia). En la PC y el celular se recuerda el último perfil.
  - Con un solo perfil, todo se ve igual que antes.
  - **Avatar**: la inicial sobre un color o una imagen de algo que viste o tenés en Mi lista.
  - **Vos**: muestra quién está mirando, "Cambiar de perfil" y "Administrar". Con más de un perfil, el ítem
    "Vos" del menú muestra el avatar.
  - **Administrar perfiles**: crear, renombrar, cambiar el color o la imagen, y borrar (pide confirmar). El
    principal ("Principal") no se borra. Borrar un perfil borra sus datos en todos los aparatos.
- Con la casa enlazada, los perfiles se sincronizan entre los aparatos; sin login funcionan solo en el aparato.

### Cambiado
- `/api/sync` acepta `?profile=` y `?part=shared|profile` (cada parte con su cursor). Una app v0.17 en caché
  sigue andando: sin esos parámetros ve el perfil principal, como antes.
- Los datos del perfil principal quedan donde estaban: no hay que migrar nada.
- Cambiar de perfil sube lo pendiente y recarga la app. Si otra pestaña cambia de perfil, esta también recarga.
- La guía del control remoto espera a que se cierre "¿Quién está mirando?".

## [0.17.1] - 2026-10-15

### Seguridad
- Un aparato que no es del admin y **sale de la casa (o lo sacan desde otro)** se queda sin los addons: se
  borran la lista, la última fuente elegida por título, las filas de catálogos de Inicio, las revisiones de
  manifests y la caché de respuestas, porque las URLs de los addons llevan la key del debrid. Queda Cinemeta.
  Lo demás (historial, mi lista, ajustes) sigue en el aparato. Al aparato del admin no se le borra nada.
- "Salir de la casa" avisa que se borran los addons cuando el aparato no es del admin.

## [0.17.0] - 2026-10-15

### Agregado
- **Login "Código de casa" y sincronización entre aparatos** (Cloudflare D1). Con la base enlazada, la app pide
  entrar con una casa antes de mostrar nada; sin la base (o en `npm run dev`) todo sigue como antes.
  - **Primera vez**: "Soy el administrador" con la clave `ADMIN_KEY` (secreto de Cloudflare, mínimo 32 caracteres)
    crea la casa principal.
  - **Ajustes → Casas** (solo el admin): crear casas, invitaciones (enlace `/unirse#…` o código), anularlas,
    renombrar, ver y sacar aparatos, y borrar casas.
  - **Invitación**: abriendo el enlace o pegando el código en la pantalla de entrada.
  - **TV**: muestra un código de 6 números y un QR; se aprueba desde un aparato que ya entró
    (**Ajustes → Casa → Vincular un aparato** o `/vincular`). Antes de aprobar se ve qué aparato pidió el código,
    hace cuánto y desde qué ciudad (con aviso si no coincide con la tuya); nunca se aprueba solo.
  - **Ajustes → Casa** (arriba de todo): en qué casa está el aparato, estado de la sincronización, aparatos de la
    casa y "Salir de la casa" (antes sube lo que quedó pendiente).
- **Qué se sincroniza**: los addons son los mismos para todas las casas y solo los cambia el admin; los ajustes
  de reproducción (subtítulos, idiomas, autoplay, saltar intro, sin spoilers, reglas de fuentes) son de la casa;
  historial, seguir viendo, mi lista, estrellas, "no me interesa", diario y metas son del perfil de la casa. Lo
  físico (modo TV, tamaño de la interfaz, protector, reproductor externo, servidor local, búsquedas) queda en cada
  aparato. La key propia de TMDB nunca se sube. Si dos aparatos cambian lo mismo, gana el cambio más nuevo.
- Lo que ya tenías guardado en el aparato se sube solo la primera vez y se mezcla con lo de la casa.

### Cambiado
- Con el login activo, `/api/tmdb` y `/api/subs` solo responden a aparatos que entraron (usan las keys del sitio).
  `_status` sigue abierto.
- Sin ser admin, Ajustes → Addons muestra la lista sin poder cambiarla, el asistente inicial no tiene el paso de
  addons e "Importar desde Stremio" no ofrece traer los addons.

### Seguridad
- Sesión en una cookie `__Host-` (HttpOnly, Secure, SameSite=Lax) guardada como hash; un año en la TV y seis meses
  en la PC o el celular. Topes de intentos para la clave del admin, las invitaciones y los códigos de la TV. Los
  códigos de invitación y de la TV se borran de la barra de direcciones apenas se leen.
- **Admin por aparato**: solo es administrador el aparato que entró con la clave `ADMIN_KEY`. La TV vinculada o
  un aparato invitado a la casa principal ven lo mismo, pero no pueden cambiar addons ni manejar casas.
- Ninguna sesión dura más de dos años aunque se use todos los días; volver a entrar en un aparato cierra la sesión
  anterior. Un código de la TV se aprueba una sola vez aunque dos aparatos lo intenten a la vez.
- Topes de la sincronización: tamaño por dato (32 KB; 256 KB los addons), 120 subidas cada 10 minutos por aparato
  y 20.000 filas / 20 MB por casa. Los topes por IP agrupan las IPv6 por /64.
- `/api/tmdb` y `/api/subs` no se pueden saltear con mayúsculas, `%xx` o barras dobles en la ruta.

## [0.16.2] - 2026-10-14

### Arreglado
- **Los subtítulos online no aparecían nunca**: SubDL devuelve la dirección de cada archivo con `?api_key=…` al
  final y la función esperaba que terminara en `.zip`, así que descartaba todos. Ahora toma solo el id (la key no
  sale del servidor).
- Un error de SubDL (`status: false`, por ejemplo `not_authorized`) ya no se toma como "no hay subtítulos" ni queda
  guardado una hora: la búsqueda responde 502 con el código del error (sin la key) y se reintenta la próxima vez.
- `/api/subs/_status` responde aunque se abra desde un link (chat, WhatsApp); antes daba "Solo desde la app".
- La caché de búsquedas cambia de clave, así que los resultados vacíos que quedaron guardados no se usan más.

### Cambiado
- Si la descarga sin key se queda sin cupo, el reintento con key la manda como SubDL la indica (`?api_key=`).

## [0.16.1] - 2026-10-14

### Cambiado
- `wrangler.toml` enlaza la base D1 `series-pelis` (binding `DB`) para el login de la v0.17. Todavía no se usa.
- Las instrucciones del KV de informes dicen que el binding va en `wrangler.toml` (el panel no deja agregarlo
  cuando el proyecto tiene este archivo).

## [0.16.0] - 2026-10-14

### Agregado
- **Subtítulos online en español latino**: si los subtítulos en español están entre tus idiomas, el reproductor
  busca subtítulos online además de los de los addons. La fuente principal es **SubDL** y, si no encuentra nada,
  **OpenSubtitles** (opcional).
  - Los latinos van primero y se eligen solos; los de España quedan en "Otros idiomas" y nunca se ponen solos.
  - Se muestran hasta 4, los más parecidos al archivo que se está viendo (resolución, origen, grupo).
  - Las series encuentran el episodio aunque el subtítulo venga en un pack de toda la temporada.
- **Función `/api/subs`** en Cloudflare: las keys quedan como secretos (`SUBDL_KEY` y, opcional,
  `OPENSUBTITLES_KEY` / `OPENSUBTITLES_USER` / `OPENSUBTITLES_PASS`), solo responde al propio sitio, tiene límite
  por IP y guarda en caché las búsquedas (12 h) y los archivos (30 días), así cada episodio se baja una vez para
  todas las casas. `/api/subs/_status` dice si está activa.

## [0.15.1] - 2026-10-14

### Seguridad
- `.gitignore` ignora `.dev.vars` y `.env` (donde van las keys para probar las Functions en la compu), así
  nunca se suben al repo por error.

## [0.15.0] - 2026-10-14

### Agregado
- **Películas y Series como página de filas** (sin filtros):
  - **Top 10 en Argentina**: lo más popular de las plataformas de suscripción de Argentina (Netflix, Disney+,
    Prime Video, Max, Apple TV+ y Paramount+, según TMDB). Ningún servicio publica lo que se mira en cada país,
    así que es una aproximación. Sin TMDB, la fila pasa a "Top 10 populares" de Cinemeta.
  - **Bien calificadas**: lo popular con IMDb 7 o más.
  - **Drama, Suspenso, Ciencia ficción y Comedias** (Cinemeta, con el puntaje de IMDb en el póster).
  - **Argentinas** (con TMDB).
  - "Ver todo" en cada fila abre la grilla con ese filtro; en la TV y el celular también va como última tarjeta.
- **Portada que sigue al póster**: arriba queda fija la imagen del título que estás mirando (mouse o control
  remoto) y, a los 3 segundos quieto, arranca su **tráiler con sonido**. Si el navegador no deja arrancar con
  sonido, sigue sin sonido; el botón (o la tecla M) lo activa y la elección se recuerda en el aparato.
- **Explorar todo**: la grilla con filtros de siempre.

### Cambiado
- La grilla de Películas y Series ya no tiene la portada grande ni el Top 10 encimado (se fueron a las filas).
- En la página de filas no se reproduce el tráiler chico de los pósters (va arriba, en la portada).

## [0.14.1] - 2026-10-14

### Quitado
- **Calidad según la conexión** (Ajustes → Reproductor): ya no se baja la calidad a 720p o 480p con una conexión
  lenta ni aparece el aviso "Conexión lenta: se eligió 720p". Siempre se recomienda la calidad preferida.

## [0.14.0] - 2026-10-14

### Agregado
- **Inicio**:
  - "Seguir viendo" y "Tus series: siguiente episodio" quedan en una sola fila.
  - Fila nueva "Mi lista".
  - Flechas ‹ › para pasar de página en las filas con el mouse.
  - Desde Seguir viendo y desde la portada se puede **reproducir directo**, sin pasar por la ficha.
- **Filas apaisadas con logo**: "Para vos", "Porque viste…" y "Tendencias de la semana" muestran la imagen de
  fondo con el logo del título y "año · género". Cada fila se puede pasar a póster o a apaisada en Ajustes →
  Catálogos (botón "Apaisada"); los catálogos de los addons y Mi lista siguen con póster.
- **TV**:
  - "Atrás" en escalera: primero vuelve al principio de la fila, después arriba de todo y después al menú.
  - El fondo de Inicio cambia según el título enfocado.
  - Las filas se desplazan con el foco anclado a la izquierda.
- **Ficha**:
  - Pestañas debajo de la portada (Episodios / Fuentes, Más como esto, Detalles); el reparto queda donde estaba.
  - Un botón principal más íconos y un menú ⋯.
  - Tráiler dentro de la app.
  - Selector de temporada desplegable y "quedan X min" en el episodio empezado.
- **Reproductor**:
  - Volumen con el mouse.
  - Adelantar con miniatura desde el control de la TV y el teclado.
  - Tarjeta del siguiente episodio con imagen.
  - Ajustes rápidos (⚙).
  - Ajustar, llenar o estirar el video (tecla Z).
  - "Más como esto" al terminar una película.
  - En el celular: horizontal y pantalla completa al reproducir, doble toque para ±10 s, un toque muestra los
    controles y bloqueo de pantalla.
- **Buscar**:
  - Sugerencias con el campo vacío.
  - Pestañas por tipo y "Mejor resultado".
  - Búsqueda por voz.
- **"Vos"**: un lugar estilo "Mi Netflix" con tu historial, Tu año, Diario, Metas y Calendario.
- **Interfaz**:
  - Riel con la sección activa marcada.
  - Transiciones suaves entre pantallas.
  - Tamaño de la interfaz en Ajustes (zoom).

### Cambiado
- **Filtros de Películas y Series**:
  - En PC el orden se ve solo en el botón "Ordenar", sin repetirlo como chip, y "Limpiar todo" no lo toca.
  - En el celular los filtros activos van en una sola tira que se desliza de costado.
  - Los chips de "Listas" tienen el mismo estilo que los de género.
- Las pestañas abiertas se sincronizan solas (progreso, Mi lista, ajustes).
- Importar una copia mezcla con lo que hay, sin pisar lo más nuevo ni perder addons caídos.
- La caché de fichas tiene tope.
- El siguiente episodio automático mantiene el idioma y la versión de la fuente.

### Arreglado
- **Ficha**:
  - En una serie sin ver, "Ver ahora" iba a los especiales (T0) en vez de T1 · E1.
  - Al recargar el reproductor se iba a Inicio; ahora vuelve a la ficha.
  - Si falla la carga, ahora hay "Reintentar".
  - Si YouTube no carga, la portada ya no queda tapada por un tráiler roto.
- **Buscar**: ya no dice "No encontramos nada" cuando falló un addon, y sin conexión muestra un solo aviso y
  reintenta al volver la red.
- **Reproductor**:
  - "Abrir en otro reproductor" en PC estaba bloqueado.
  - El botón de pantalla completa quedaba afuera en el celular apaisado.
  - El menú de subtítulos mostraba códigos internos.
  - Los subtítulos tocaban los bordes en el celular.
  - El panel de ajustes rápidos quedaba debajo de la barra de progreso.
  - En la TV, "Más como esto" no tomaba el foco.
- **Addons**: una URL con barra final duplicaba el manifest; ahora se valida lo que mandan los addons y la
  importación desde Stremio distingue addons con el mismo id.
- **TV en vivo**: ya no arranca en un canal que no se puede ver desde el navegador.
- "Seguir viendo" y la ficha usan el mismo criterio de "empezado".
- El Historial ya no dice "1 películas".
- Los episodios que todavía no salieron no aparecen como "Siguiente".
- Varios arreglos de accesibilidad (un solo título principal por página, etiquetas) y de compatibilidad con
  navegadores de TV viejos.

## [0.13.0] - 2026-10-14

### Cambiado
- **Portada nueva estilo Netflix / Disney+, sin tráiler**: la portada ya no reproduce el tráiler (sigue
  apareciendo al pasar por los pósters). Se mantienen el logo, el puntaje de IMDb, el año, la duración, los
  géneros y la sinopsis.
  - **Inicio**: carrusel tipo Disney+ en un banner redondeado que avanza solo cada 8 segundos, con indicadores,
    flechas al pasar el mouse y botón de pausa. Se frena al pasar el mouse o con el foco del control remoto.
  - **Películas y Series**: portada a todo el ancho tipo Netflix, con el "Top 10 de hoy" montado abajo.
  - Botones "Ver ahora", "Mi lista" y "Más info" (abre la ficha sin arrancar solo). En el celular se puede
    deslizar con el dedo; en la TV se recorren los indicadores con ←/→.
  - Se va la opción "Reproducir el tráiler sin sonido en la portada de Inicio" (Ajustes → TMDB).
- **Filtros de Películas y Series más prácticos**: barra que queda pegada arriba con el catálogo, los géneros como
  chips, "Ordenar" y un botón "Filtros" con la cantidad de filtros puestos. Los filtros activos se ven como chips
  que se sacan con la ×, con "Limpiar todo". El resto (décadas, puntaje mínimo, idioma, país y plataformas con
  logo) está en un panel lateral, que en el celular es una hoja desde abajo. Todo se aplica al instante.

### Quitado
- **Listas "Mejor puntaje IMDb"** (películas y series). Si estaban como filas de Inicio, se sacan solas. El
  puntaje de IMDb en pósters y portada queda.

## [0.12.2] - 2026-10-14

### Cambiado
- **Subtítulos en español activados de entrada**: la opción "Activarlos solos en el primer idioma preferido que
  haya" (Ajustes → Reproductor) ahora viene prendida, con español primero y después inglés. A quien ya tenía la
  app se le prende una sola vez; si la apaga, queda apagada. Los subtítulos salen de los addons instalados (por
  ejemplo, "OpenSubtitles v3" de Stremio): si ningún addon trae subtítulos para ese título, no aparece nada.

## [0.12.1] - 2026-10-14

### Arreglado
- **Buscar ya no salta mientras carga**: al seguir escribiendo, los resultados de la búsqueda anterior quedan
  atenuados hasta que llegan los nuevos (antes se borraban y volvían los esqueletos con cada letra). Lo mismo con
  la fila de Personas, que además ya no se cerraba y se volvía a abrir al empezar cada búsqueda. El esqueleto de
  Personas ahora tiene el tamaño de las caras (antes era de póster, más alto) y la primera búsqueda muestra dos
  filas de esqueletos. Medido con resultados simulados: el corrimiento de pantalla (CLS) bajó de 0,29 a 0,12.

## [0.12.0] - 2026-10-14

### Agregado
- **Series con portada grande**: igual que Películas, a todo el ancho y estilo Stremio (logo, IMDb, año,
  duración, géneros y reparto) con las series en tendencia de hoy y el "Top 10 series de hoy" encimado abajo.

### Arreglado
- La duración de las series en la portada: TMDB ya casi no manda la duración general de una serie, así que
  ahora se toma la del último episodio emitido.

## [0.11.0] - 2026-10-14

### Cambiado
- **Un solo diseño**: los colores del Tema 2 quedan como los de toda la app y se saca el Tema 1 (y la sección
  Ajustes → Apariencia). Ya no hay parpadeo al abrir: el tema va marcado en el HTML. Con el Tema 1 se van también
  el atajo `T` (cambiar el tema) y la barra inferior con "Más" que tenía ese tema en el celular; en el celular queda
  la barra del Tema 2.
- **Portada nueva estilo Stremio** (con TMDB): logo del título, puntaje de IMDb, año, duración, géneros, sinopsis
  y las caras del reparto principal, con la imagen de fondo de la peli completa.
  - **Películas**: portada grande a todo el ancho con las películas en tendencia y el "Top 10 películas de hoy"
    montado sobre la parte de abajo.
  - **Inicio**: portada más chica con los **estrenos en cines**, que no ocupa toda la parte de arriba.
  - En el celular la imagen va arriba y el texto empieza donde se funde, para que se lea bien.
- **Tráiler sin controles**: a los segundos el tráiler arranca solo y no aparece la interfaz de YouTube (ni el botón
  de play/pausa ni el título); el video recién se muestra cuando ya se está reproduciendo, mientras tanto se ve la
  imagen de fondo. Vale para la portada y para el tráiler al pasar por un póster.

### Agregado
- **Pausar el tráiler tocando la portada**: un click (o OK en la TV) pausa y otro lo sigue. Con el control remoto,
  ↑ desde "Ver ahora" o "Mi lista" va a la portada (antes se iba al menú lateral).

## [0.10.0] - 2026-10-14

Lo que quedó afuera de la v0.9: reproductor con controles del sistema y velocidad, atajos y ayuda, guía del control
remoto, informes de errores opt-in, cabeceras de seguridad, y las tres pantallas pendientes (Ajustes, barra inferior
del Tema 1 y gestor de catálogos en el celular).

### Agregado
Reproductor:
- Controles del sistema (pantalla de bloqueo, auriculares, notificación de Android) con título, episodio y póster, y
  botones de play/pausa, ±10 s y siguiente episodio.
- La pantalla no se apaga mientras se reproduce; se libera en pausa y al salir.
- Ventana flotante (picture-in-picture) con botón nuevo y tecla P; en Safari también. Se oculta si el navegador no lo
  soporta.
- Velocidad de reproducción de 0,5× a 2× desde el botón "1×" (menú navegable con el control remoto) o con las teclas
  < y >. Se recuerda durante la sesión.
- Atajos nuevos: J/L (±10 s), ↑/↓ (volumen, con teclado), M (mudo), C (subtítulos sí/no), S (menú de subtítulos),
  A/V (fuentes), N (siguiente episodio), P (ventana flotante), 0–9 (saltar al 0–90 %), I (saltar intro/resumen).
- Calidad según la conexión: con 3G o ahorro de datos se elige como máximo 720p, con 2G 480p, combinado con la calidad
  preferida (el menor de los dos). Ajuste "Ajustar la calidad a la conexión" en Ajustes → Reproductor (activado por
  defecto) y aviso "Conexión lenta: se eligió 720p" cuando eso cambió la elección.

Atajos y ayuda:
- Atajos en toda la app: `/` va a Buscar, `?` abre la ayuda, `T` cambia el tema y `G` seguido de H/D/B/L/I/C/A va a
  Inicio, Descubrir, Buscar, Mi lista, Historial, Calendario o Ajustes.
- Ventana de ayuda con todos los atajos (app, reproductor y control remoto), navegable con el control y accesible
  desde Ajustes → Teclado y ayuda → "Ver atajos".
- Guía del control remoto la primera vez en la TV (flechas, OK, Atrás y el reproductor), con "Ver la guía del control
  remoto" en Ajustes para repasarla.

Diagnóstico y seguridad:
- Informes de errores opt-in: botón "Enviar informe" en la pantalla de error de la app, en el error del reproductor y
  en el aviso "no responde" de las filas (en la TV se manda con OK, sin teclado). Ajustes → Diagnóstico con envío
  automático (apagado por defecto), explicación de qué se manda y "Enviar un informe ahora". Los informes nunca llevan
  URLs de addons ni de streams (solo el host) ni keys; se encolan sin conexión y se mandan al volver.
- `POST /api/report` (Pages Function + KV `REPORTS`, 16 kB, 20 por hora por IP, 30 días) y lectura con el secreto
  `REPORT_ADMIN_KEY`. Sin el KV configurado, la sección y los botones no aparecen.
- Cabeceras de seguridad: Content-Security-Policy, Referrer-Policy, X-Frame-Options y Permissions-Policy, probadas en
  Inicio, ficha, Buscar, Ajustes y reproductor sin ninguna violación. Un test vigila que el hash del script inline de
  `index.html` siga coincidiendo con la CSP.

Pantallas:
- Ajustes con índice lateral fijo en PC y TV (resalta la sección que se está leyendo; con el control remoto, elegir una
  sección pasa el foco a su primer control) y enlaces `/settings#sección`.
- En el celular, el menú del Tema 1 tiene "Más": una hoja con TV en vivo, Historial, Calendario, Listas, Juntos,
  Diario, Metas y Ajustes (Listas, Juntos, Diario y Metas antes no estaban en ningún menú).
- Menú "⋯" por catálogo en el celular (mostrar/ocultar en Inicio, renombrar, nombre original, fusionar/separar).

### Cambiado
- Ajustes en el celular: secciones plegables, la primera abierta (de 7,9–8,9 k px a 2,5–2,6 k px de alto).
- Barra inferior del Tema 1 en el celular: 6 ítems (Inicio, Películas, Series, Buscar, Mi lista, Más) con etiquetas de
  12 px y 48 px de alto, en vez de 8 ítems de 9,9 px.
- Gestor de catálogos en el celular: flechas ↑/↓ de 44 px y el resto de las acciones en "⋯"; en PC y TV la fila sigue
  igual.
- Calendario vuelve a la barra de arriba en todos los anchos de PC.
- Reproductor: las teclas con Ctrl/Cmd/Alt ya no disparan atajos (F, K…) y las letras funcionan también con Bloq Mayús.
- Las Pages Functions comparten `crossSite()` / `json()` en `functions/_lib.ts`. En dev y preview, `/api/report`
  responde "desactivado" en vez de 404.

### Arreglado
- "Restablecer" (catálogos) y "Quitar" (addons) se ven en rojo también en el Tema 2.
- "Mi lista" ya no queda marcado en el menú al estar en "Listas".
- La pantalla de error de la app ya no depende de "Copiar detalle" (inútil en una TV).

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
