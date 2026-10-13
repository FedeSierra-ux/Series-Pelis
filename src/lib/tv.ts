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
