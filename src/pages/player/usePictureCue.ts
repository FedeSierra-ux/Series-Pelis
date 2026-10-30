import { useEffect, useState, type RefObject } from 'react'
import { pictureCueBottom } from '../../lib/subtitlePrefs'

/**
 * uso-11: `bottom` de `cuePlacement` para que, en el celular vertical, el subtítulo quede al pie de la imagen y no
 * contra el borde de la pantalla (ver `pictureCueBottom`). Se vuelve a medir con las medidas del video (llegan con
 * `loadedmetadata`, o con `resize` si cambia la calidad), al girar el celular y al cambiar Ajustar / Llenar.
 */
export function usePictureCueBottom(videoRef: RefObject<HTMLVideoElement | null>, rootRef: RefObject<HTMLElement | null>, fit: string): number {
  const [bottom, setBottom] = useState(0)
  useEffect(() => {
    const video = videoRef.current
    const root = rootRef.current
    if (!video || !root) return
    const measure = () => {
      setBottom(pictureCueBottom({ w: root.clientWidth, h: root.clientHeight }, { w: video.videoWidth, h: video.videoHeight }, fit))
    }
    measure()
    video.addEventListener('loadedmetadata', measure)
    video.addEventListener('resize', measure)
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    ro?.observe(root)
    return () => {
      video.removeEventListener('loadedmetadata', measure)
      video.removeEventListener('resize', measure)
      ro?.disconnect()
    }
  }, [videoRef, rootRef, fit])
  return bottom
}
