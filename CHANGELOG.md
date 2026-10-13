# Changelog

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
