import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

/** Código QR como SVG (sin scripts ni imágenes de afuera: la CSP solo deja `script-src 'self'`). */
export function QrCode({ text, size = 200, label }: { text: string; size?: number; label: string }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`
    return { path: d, count: n + 8 }
  }, [text])
  return (
    <svg className="qr-code" role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${count} ${count}`} shapeRendering="crispEdges">
      <rect width={count} height={count} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}
