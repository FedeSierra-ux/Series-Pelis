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

/**
 * Marca `<html data-tv>` cuando la interfaz es para TV (ajuste manual o detección) y la mantiene
 * al día cuando cambia el ajuste. El CSS agranda letras y controles bajo `html[data-tv]`
 * (se mira a 3 metros). Devuelve la función para dejar de escuchar.
 */
export function syncTvAttr(): () => void {
  const apply = () => {
    const tv = resolveTvMode(settingsStore.get().tvMode, currentPlatform().tv)
    const root = document.documentElement
    if (tv) root.dataset.tv = ''
    else delete root.dataset.tv
  }
  apply()
  return settingsStore.subscribe(apply)
}
