import { useEffect, useRef, useState } from 'react'

/** Carga el catálogo recién cuando la fila se acerca a la pantalla. */
export function useNearViewport<T extends Element>(eager: boolean) {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(eager)
  useEffect(() => {
    if (visible || !ref.current) return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), {
      rootMargin: '600px 0px',
    })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [visible])
  return [ref, visible] as const
}

export interface TmdbState<T> {
  data?: T
  loading: boolean
  failed: boolean
}

/**
 * Pedido a TMDB para Inicio. `depKey` vacío = apagado (sin key o fila lejos de la pantalla).
 * Arranca con lo que haya en memoria para no parpadear al volver. Los errores no se muestran:
 * la fila o la portada simplemente no aparecen.
 */
export function useTmdbQuery<T>(depKey: string | undefined, run: () => Promise<T>, peek?: () => T | undefined): TmdbState<T> {
  const initial = depKey ? peek?.() : undefined
  const [state, setState] = useState<TmdbState<T> & { key?: string }>({ key: depKey, data: initial, loading: !!depKey && !initial, failed: false })

  useEffect(() => {
    if (!depKey) return
    let alive = true
    const mem = peek?.()
    setState({ key: depKey, data: mem, loading: !mem, failed: false })
    run()
      .then((data) => alive && setState({ key: depKey, data, loading: false, failed: false }))
      .catch(() => alive && setState((s) => ({ ...s, key: depKey, loading: false, failed: !s.data })))
    return () => {
      alive = false
    }
  }, [depKey])

  if (!depKey) return { loading: false, failed: false }
  // Mientras el efecto no corrió para la clave nueva, no mostramos datos de la anterior.
  if (state.key !== depKey) return { data: initial, loading: !initial, failed: false }
  return state
}
