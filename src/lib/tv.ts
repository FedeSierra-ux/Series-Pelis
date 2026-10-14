import { currentPlatform, resolveTvMode } from './platform'
import { settingsStore, useStore } from './store'

/** ¿Usamos la interfaz para control remoto (teclado en pantalla)? Ajuste manual o detección. */
export function useTvMode(): boolean {
  const { tvMode } = useStore(settingsStore)
  return resolveTvMode(tvMode, currentPlatform().tv)
}

/** ¿Mostrar las opciones avanzadas de Ajustes? Para envolver en JS en vez de usar `data-advanced`. */
export function useShowAdvanced(): boolean {
  return useStore(settingsStore).showAdvanced
}

/** v0.14 (U4): tamaños de la interfaz que se pueden elegir en Ajustes → Pantalla y control remoto. */
export const UI_SCALES = [90, 100, 115, 130] as const
export type UiScale = (typeof UI_SCALES)[number]

/** Cualquier valor guardado → uno de la lista (lo raro o viejo vuelve a 100 %). */
export function normalizeUiScale(v: unknown): UiScale {
  return (UI_SCALES as readonly unknown[]).includes(v) ? (v as UiScale) : 100
}

/**
 * Tamaño de la interfaz: `data-ui-scale` y `--ui-zoom` en `<html>`; el CSS (components/layout-v14.css) le pone
 * `zoom` al marco de la app (riel, páginas y pestañas). El reproductor no se agranda: tiene sus propios tamaños.
 * Se usa `zoom` porque casi todos los estilos están en px (un `font-size` raíz no los movería).
 */
export function applyUiScale(root: HTMLElement, value: unknown) {
  const scale = normalizeUiScale(value)
  if (scale === 100) {
    delete root.dataset.uiScale
    root.style.removeProperty('--ui-zoom')
  } else {
    root.dataset.uiScale = String(scale)
    root.style.setProperty('--ui-zoom', String(scale / 100))
  }
}

/**
 * Marca `<html data-tv>` cuando la interfaz es para TV (ajuste manual o detección) y la mantiene
 * al día cuando cambia el ajuste. El CSS agranda letras y controles bajo `html[data-tv]`
 * (se mira a 3 metros). También aplica el tamaño de la interfaz (`applyUiScale`). Devuelve la función para
 * dejar de escuchar.
 */
export function syncTvAttr(): () => void {
  const apply = () => {
    const settings = settingsStore.get()
    const tv = resolveTvMode(settings.tvMode, currentPlatform().tv)
    const root = document.documentElement
    if (tv) root.dataset.tv = ''
    else delete root.dataset.tv
    applyUiScale(root, settings.uiScale)
  }
  apply()
  return settingsStore.subscribe(apply)
}
