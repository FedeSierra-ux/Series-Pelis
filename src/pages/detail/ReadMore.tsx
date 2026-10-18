import { useLayoutEffect, useRef, useState } from 'react'

/**
 * v0.26 (ficha-01/02): la sinopsis de la portada cortada (4 renglones en PC y TV, 3 en el celular, por CSS) con
 * «Leer más» que la abre. El botón aparece solo si el texto no entra; es un botón común, así lo alcanzan las
 * flechas del control remoto.
 */
export function ReadMore({ text, className = '' }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || open) return
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1)
    check()
    // Al girar el celular o cambiar el ancho, el corte cambia.
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', check)
      return () => window.removeEventListener('resize', check)
    }
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, open])

  return (
    <>
      <p ref={ref} className={`${className}${open ? '' : ' is-clamped'}`}>
        {text}
      </p>
      {(overflows || open) && (
        <button type="button" className="d-read-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Leer menos' : 'Leer más'}
        </button>
      )}
    </>
  )
}
