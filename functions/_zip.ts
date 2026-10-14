// Lector mínimo de .zip para las Pages Functions (los subtítulos de SubDL vienen comprimidos).
// Lee el directorio central y descomprime con DecompressionStream('deflate-raw'), que ya trae el runtime de
// Cloudflare: sin dependencias. Solo los métodos 0 (sin comprimir) y 8 (deflate), que son los que se usan.

export interface ZipEntry {
  name: string
  /** Tamaño sin comprimir, según el directorio. */
  size: number
  read: () => Promise<Uint8Array<ArrayBuffer>>
}

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50

/** Entradas del zip (sin las carpetas). Tira error si no parece un zip. */
export function zipEntries(buffer: ArrayBuffer, maxEntrySize = 5 * 1024 * 1024): ZipEntry[] {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  // El final del directorio está en los últimos 22 bytes + el comentario (hasta 64 kB).
  let end = -1
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('No es un zip')
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const names = new TextDecoder('utf-8')
  const out: ZipEntry[] = []
  for (let n = 0; n < count && at + 46 <= buffer.byteLength; n++) {
    if (view.getUint32(at, true) !== CENTRAL) throw new Error('Zip roto')
    const method = view.getUint16(at + 10, true)
    const packed = view.getUint32(at + 20, true)
    const size = view.getUint32(at + 24, true)
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    const local = view.getUint32(at + 42, true)
    const name = names.decode(bytes.subarray(at + 46, at + 46 + nameLen))
    at += 46 + nameLen + extraLen + commentLen
    if (name.endsWith('/') || (method !== 0 && method !== 8) || size > maxEntrySize) continue
    out.push({
      name,
      size,
      read: async () => {
        if (view.getUint32(local, true) !== LOCAL) throw new Error('Zip roto')
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
        const data = bytes.slice(start, start + packed)
        if (method === 0) return data
        // Se corta apenas pasa el tope (el tamaño del directorio puede mentir: zip bomba).
        const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
        const chunks: Uint8Array[] = []
        let total = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          total += value.byteLength
          if (total > maxEntrySize) {
            await reader.cancel()
            throw new Error('Archivo demasiado grande')
          }
          chunks.push(value)
        }
        const result = new Uint8Array(total)
        let pos = 0
        for (const c of chunks) {
          result.set(c, pos)
          pos += c.byteLength
        }
        return result
      },
    })
  }
  return out
}
