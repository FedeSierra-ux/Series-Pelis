// Consultas de medios que usa el código TypeScript (el CSS tiene sus `@media`: acá viven las que se repiten
// con el mismo corte, así un valor se cambia en un solo lugar). Los tests de `controlBar` y `media`
// vigilan que las del reproductor coincidan con `player-v14.css`.

/** Celular (el corte de 760 px que manda en el CSS): la ficha pone las fuentes debajo del episodio elegido, Buscar y los filtros achican su barra, el subtítulo sube por arriba de "Saltar". */
export const NARROW_QUERY = '(max-width: 760px)'

/** Lo opuesto a `NARROW_QUERY`: pantalla ancha (tráiler de fondo de la ficha). */
export const WIDE_PAGE_QUERY = '(min-width: 761px)'

/** Ajustes: desde acá el índice va al costado en vez de plegable. */
export const WIDE_QUERY = '(min-width: 1024px)'

/** Pantalla táctil (celular, tablet): sin mouse ni flechas. Las TV dicen `pointer: none`, no entran. */
export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'

/** El puntero principal es el dedo (también lo declaran algunas tablets con mouse). */
export const COARSE_POINTER_QUERY = '(pointer: coarse)'

/** El usuario pidió reducir el movimiento. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Celular vertical: una sola fila de íconos y "Abrir en…", ventana flotante y Ajustar pasan al ⚙.
 * Es la misma consulta que el `@media` de `player-v14.css` (los botones los esconde el CSS).
 */
export const COMPACT_BAR_QUERY = '(max-width: 760px) and (pointer: coarse)'

/**
 * Celular muy angosto (menos de 360 px, ej. 320): con una serie ("Audio" y "Siguiente episodio") la fila de
 * íconos no entraba ni sin temporizador. Ahí el temporizador también pasa al ⚙ (lo esconde el CSS con la
 * misma consulta). De 360 px para arriba, la barra queda igual.
 */
export const TINY_BAR_QUERY = '(max-width: 359px) and (pointer: coarse)'

/**
 * Celular apaisado: más de 760 px de ancho pero pantalla táctil y poco alto (el mismo corte de 500 px que usa
 * `player-v14.css` para la barra en dos renglones). Ahí el subtítulo también sube por arriba de la esquina.
 */
export const PHONE_LANDSCAPE_QUERY = '(pointer: coarse) and (max-height: 500px)'
