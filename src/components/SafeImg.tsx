import { useState, type ImgHTMLAttributes } from 'react'
import { placeholderSrc, type PlaceholderShape } from '../lib/imgPlaceholder'

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** Sin `src` (el título no tiene imagen) va directo el relleno. */
  src?: string
  /** Proporción del relleno: `poster` (2:3) o `wide` (16:9). */
  shape?: PlaceholderShape
  /** Título del que sale la inicial del relleno (sin él, un ícono de imagen). */
  label?: string
}

/**
 * <img> que, si no carga (404, CDN caído), muestra un rectángulo oscuro con la inicial del título en vez del ícono de
 * imagen rota del navegador (visual-pc-03). Es el mismo recurso que `PosterCard` (nombre sobre fondo oscuro), pero
 * sigue siendo un <img>: las clases y las reglas de tamaño de cada pantalla se aplican igual. Si el `src` cambia
 * (por ejemplo del fondo al póster en "Seguir viendo"), vuelve a intentar con el nuevo.
 */
export function SafeImg({ src, shape = 'poster', label, onError, ...rest }: Props) {
  const [failed, setFailed] = useState<string>()
  const broken = !src || failed === src
  return (
    <img
      {...rest}
      src={broken ? placeholderSrc(shape, label) : src}
      data-img-failed={broken || undefined}
      onError={(e) => {
        if (broken) return
        setFailed(src)
        onError?.(e)
      }}
    />
  )
}
