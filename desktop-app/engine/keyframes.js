// @ts-check
// Dónde están los keyframes del video, sacado del índice del contenedor (Cues de MKV, stss de MP4) leyendo solo
// unos pocos tramos del archivo por HTTP Range. Con eso los segmentos de HLS empiezan justo en un keyframe y el
// video se puede copiar sin convertir. Si no hay índice (AVI, TS, MP4 fragmentado, MKV sin Cues) → null, y el
// video se convierte (ahí los keyframes los pone el codificador).
import http from 'node:http'

/** Tope de lo que se lee de un índice (las Cues de una peli de 3 h ocupan unos cientos de KB). */
const MAX_INDEX_BYTES = 48 * 1024 * 1024
const HEAD_BYTES = 256 * 1024

/**
 * @typedef {(start: number, length: number) => Promise<Buffer>} ReadFn
 * @typedef {{ keyframes: number[], duration?: number }} KeyframeIndex
 */

/**
 * Lector por HTTP Range de una URL local del motor (torrent o link de internet pasado por el motor).
 * @param {string} url
 * @param {AbortSignal} [signal]
 * @returns {{ read: ReadFn, size: () => number }}
 */
export function httpReader(url, signal) {
  let size = -1
  /** @type {ReadFn} */
  const read = (start, length) =>
    new Promise((resolve, reject) => {
      const end = size > 0 ? Math.min(start + length, size) - 1 : start + length - 1
      if (end < start) return resolve(Buffer.alloc(0))
      const req = http.get(url, { headers: { range: `bytes=${start}-${end}` }, signal, agent: false }, (res) => {
        if (res.statusCode !== 206 && res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode}`))
        }
        const cr = /\/(\d+)$/.exec(String(res.headers['content-range'] ?? ''))
        if (cr) size = Number(cr[1])
        else if (res.statusCode === 200) size = Number(res.headers['content-length'] ?? -1)
        /** @type {Buffer[]} */
        const chunks = []
        let got = 0
        // Un 200 (sin Range) trae todo: se corta al llegar a lo pedido.
        const skip = res.statusCode === 200 ? start : 0
        let seen = 0
        res.on('data', (/** @type {Buffer} */ c) => {
          const from = Math.max(0, skip - seen)
          seen += c.length
          if (from >= c.length) return
          const part = c.subarray(from, from + (length - got))
          chunks.push(part)
          got += part.length
          if (got >= length) {
            res.destroy()
            resolve(Buffer.concat(chunks))
          }
        })
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      })
      req.on('error', reject)
    })
  return { read, size: () => size }
}

// ---------- EBML / Matroska ----------

const EBML_ID = 0x1a45dfa3
const SEGMENT = 0x18538067
const SEEKHEAD = 0x114d9b74
const SEEK = 0x4dbb
const SEEK_ID = 0x53ab
const SEEK_POS = 0x53ac
const INFO = 0x1549a966
const TIMESTAMP_SCALE = 0x2ad7b1
const DURATION = 0x4489
const TRACKS = 0x1654ae6b
const TRACK_ENTRY = 0xae
const TRACK_NUMBER = 0xd7
const TRACK_TYPE = 0x83
const CUES = 0x1c53bb6b
const CUE_POINT = 0xbb
const CUE_TIME = 0xb3
const CUE_TRACK_POSITIONS = 0xb7
const CUE_TRACK = 0xf7
const CLUSTER = 0x1f43b675

/**
 * Cabecera de un elemento EBML: id (con el marcador, como en la spec), tamaño (-1 = desconocido) y largo de la
 * cabecera. null si no entra en el buffer o es inválida.
 * @param {Buffer} buf
 * @param {number} pos
 */
export function ebmlHeader(buf, pos) {
  if (pos >= buf.length) return null
  const b0 = buf[pos]
  const idLen = b0 >= 0x80 ? 1 : b0 >= 0x40 ? 2 : b0 >= 0x20 ? 3 : b0 >= 0x10 ? 4 : 0
  if (!idLen || pos + idLen >= buf.length) return null
  let id = 0
  for (let i = 0; i < idLen; i++) id = id * 256 + buf[pos + i]
  const s0 = buf[pos + idLen]
  let sizeLen = 0
  for (let i = 0; i < 8; i++) {
    if (s0 & (0x80 >> i)) {
      sizeLen = i + 1
      break
    }
  }
  if (!sizeLen || pos + idLen + sizeLen > buf.length) return null
  let size = s0 & (0xff >> sizeLen)
  let allOnes = size === 0xff >> sizeLen
  for (let i = 1; i < sizeLen; i++) {
    const b = buf[pos + idLen + i]
    if (b !== 0xff) allOnes = false
    size = size * 256 + b
  }
  return { id, size: allOnes ? -1 : size, headLen: idLen + sizeLen }
}

/** @param {Buffer} buf @param {number} pos @param {number} len */
function readUint(buf, pos, len) {
  let v = 0
  for (let i = 0; i < len; i++) v = v * 256 + buf[pos + i]
  return v
}

/** @param {Buffer} buf @param {number} pos @param {number} len */
function readFloat(buf, pos, len) {
  if (len === 4) return buf.readFloatBE(pos)
  if (len === 8) return buf.readDoubleBE(pos)
  return NaN
}

/**
 * Hijos directos de un elemento ya leído entero.
 * @param {Buffer} buf
 * @param {number} start
 * @param {number} end
 * @returns {Generator<{ id: number, data: number, size: number }>}
 */
function* children(buf, start, end) {
  let pos = start
  while (pos < end) {
    const h = ebmlHeader(buf, pos)
    if (!h || h.size < 0) return
    const data = pos + h.headLen
    if (data + h.size > end) return
    yield { id: h.id, data, size: h.size }
    pos = data + h.size
  }
}

/**
 * Keyframes de un MKV/WebM a partir de las Cues de la pista de video.
 * @param {ReadFn} read
 * @returns {Promise<KeyframeIndex | null>}
 */
export async function mkvKeyframes(read) {
  const head = await read(0, HEAD_BYTES)
  const ebml = ebmlHeader(head, 0)
  if (!ebml || ebml.id !== EBML_ID || ebml.size < 0) return null
  const segPos = ebml.headLen + ebml.size
  const seg = ebmlHeader(head, segPos)
  if (!seg || seg.id !== SEGMENT) return null
  const segData = segPos + seg.headLen

  let scale = 1_000_000
  /** @type {number | undefined} */
  let duration
  /** @type {number | undefined} */
  let videoTrack
  /** @type {number | undefined} */
  let cuesPos
  /** @type {number[]} */
  const seekHeads = []
  let infoPos = -1
  let tracksPos = -1

  /** Lee un elemento de primer nivel entero (si no está en `head`). @param {number} pos */
  const element = async (pos) => {
    let buf = head
    let base = 0
    let h = ebmlHeader(head, pos)
    if (!h || pos + (h?.headLen ?? 0) + (h?.size ?? 0) > head.length) {
      const top = await read(pos, 16)
      h = ebmlHeader(top, 0)
      if (!h || h.size < 0 || h.size > MAX_INDEX_BYTES) return null
      buf = await read(pos, h.headLen + h.size)
      base = pos
      if (buf.length < h.headLen + h.size) return null
    }
    return { buf, id: h.id, data: pos - base + h.headLen, size: h.size }
  }

  // Primer nivel hasta el primer Cluster (lo que suele estar en la cabecera).
  let pos = segData
  for (let i = 0; i < 64 && pos < head.length; i++) {
    const h = ebmlHeader(head, pos)
    if (!h || h.size < 0 || h.id === CLUSTER) break
    if (h.id === SEEKHEAD) seekHeads.push(pos)
    else if (h.id === INFO) infoPos = pos
    else if (h.id === TRACKS) tracksPos = pos
    else if (h.id === CUES) cuesPos = pos
    pos += h.headLen + h.size
  }

  /** @param {number} at */
  const readSeekHead = async (at) => {
    const el = await element(at)
    if (!el || el.id !== SEEKHEAD) return
    for (const s of children(el.buf, el.data, el.data + el.size)) {
      if (s.id !== SEEK) continue
      let id = 0
      let p = -1
      for (const f of children(el.buf, s.data, s.data + s.size)) {
        if (f.id === SEEK_ID) id = readUint(el.buf, f.data, f.size)
        else if (f.id === SEEK_POS) p = segData + readUint(el.buf, f.data, f.size)
      }
      if (p < 0) continue
      if (id === CUES && cuesPos === undefined) cuesPos = p
      else if (id === INFO && infoPos < 0) infoPos = p
      else if (id === TRACKS && tracksPos < 0) tracksPos = p
      else if (id === SEEKHEAD && !seekHeads.includes(p) && seekHeads.length < 4) seekHeads.push(p)
    }
  }
  for (let i = 0; i < seekHeads.length; i++) await readSeekHead(seekHeads[i])

  if (infoPos >= 0) {
    const el = await element(infoPos)
    if (el && el.id === INFO) {
      let rawDuration
      for (const f of children(el.buf, el.data, el.data + el.size)) {
        if (f.id === TIMESTAMP_SCALE) scale = readUint(el.buf, f.data, f.size) || scale
        else if (f.id === DURATION) rawDuration = readFloat(el.buf, f.data, f.size)
      }
      if (rawDuration !== undefined && Number.isFinite(rawDuration)) duration = (rawDuration * scale) / 1e9
    }
  }
  if (tracksPos >= 0) {
    const el = await element(tracksPos)
    if (el && el.id === TRACKS) {
      for (const t of children(el.buf, el.data, el.data + el.size)) {
        if (t.id !== TRACK_ENTRY) continue
        let num = 0
        let type = 0
        for (const f of children(el.buf, t.data, t.data + t.size)) {
          if (f.id === TRACK_NUMBER) num = readUint(el.buf, f.data, f.size)
          else if (f.id === TRACK_TYPE) type = readUint(el.buf, f.data, f.size)
        }
        if (type === 1 && videoTrack === undefined) videoTrack = num
      }
    }
  }
  if (videoTrack === undefined || cuesPos === undefined) return null
  const el = await element(cuesPos)
  if (!el || el.id !== CUES) return null
  /** @type {number[]} */
  const times = []
  for (const cp of children(el.buf, el.data, el.data + el.size)) {
    if (cp.id !== CUE_POINT) continue
    let time = -1
    let isVideo = false
    for (const f of children(el.buf, cp.data, cp.data + cp.size)) {
      if (f.id === CUE_TIME) time = readUint(el.buf, f.data, f.size)
      else if (f.id === CUE_TRACK_POSITIONS) {
        for (const g of children(el.buf, f.data, f.data + f.size)) {
          if (g.id === CUE_TRACK && readUint(el.buf, g.data, g.size) === videoTrack) isVideo = true
        }
      }
    }
    if (isVideo && time >= 0) times.push((time * scale) / 1e9)
  }
  if (!times.length) return null
  return { keyframes: uniqSorted(times), duration }
}

// ---------- ISO BMFF / MP4 ----------

/**
 * Cajas hijas de una caja leída entera.
 * @param {Buffer} buf
 * @param {number} start
 * @param {number} end
 * @returns {Generator<{ type: string, data: number, end: number }>}
 */
function* boxes(buf, start, end) {
  let pos = start
  while (pos + 8 <= end) {
    let size = buf.readUInt32BE(pos)
    const type = buf.toString('latin1', pos + 4, pos + 8)
    let head = 8
    if (size === 1) {
      if (pos + 16 > end) return
      size = Number(buf.readBigUInt64BE(pos + 8))
      head = 16
    } else if (size === 0) size = end - pos
    if (size < head || pos + size > end) return
    yield { type, data: pos + head, end: pos + size }
    pos += size
  }
}

/** @param {Buffer} buf @param {number} start @param {number} end @param {string} type */
function child(buf, start, end, type) {
  for (const b of boxes(buf, start, end)) if (b.type === type) return b
  return undefined
}

/**
 * Keyframes (PTS en segundos, como los da ffmpeg) de la primera pista de video de un MP4/MOV no fragmentado.
 * @param {ReadFn} read
 * @param {number} size  tamaño del archivo (para recorrer las cajas de primer nivel)
 * @returns {Promise<KeyframeIndex | null>}
 */
export async function mp4Keyframes(read, size) {
  let pos = 0
  /** @type {Buffer | undefined} */
  let moov
  for (let i = 0; i < 64 && (size < 0 || pos + 8 <= size); i++) {
    const h = await read(pos, 16)
    if (h.length < 8) break
    let boxSize = h.readUInt32BE(0)
    const type = h.toString('latin1', 4, 8)
    if (!/^[\x20-\x7e]{4}$/.test(type)) return null
    if (boxSize === 1) {
      if (h.length < 16) return null
      boxSize = Number(h.readBigUInt64BE(8))
    } else if (boxSize === 0) {
      if (size < 0) return null
      boxSize = size - pos
    }
    if (boxSize < 8) return null
    if (type === 'moov') {
      if (boxSize > MAX_INDEX_BYTES) return null
      moov = await read(pos, boxSize)
      if (moov.length < boxSize) return null
      break
    }
    pos += boxSize
  }
  if (!moov) return null
  const mvhd = child(moov, 8, moov.length, 'mvhd')
  if (!mvhd) return null
  const movieScale = moov[mvhd.data] === 1 ? moov.readUInt32BE(mvhd.data + 20) : moov.readUInt32BE(mvhd.data + 12)
  for (const trak of boxes(moov, 8, moov.length)) {
    if (trak.type !== 'trak') continue
    const mdia = child(moov, trak.data, trak.end, 'mdia')
    if (!mdia) continue
    const hdlr = child(moov, mdia.data, mdia.end, 'hdlr')
    if (!hdlr || moov.toString('latin1', hdlr.data + 8, hdlr.data + 12) !== 'vide') continue
    return mp4Track(moov, trak, mdia, movieScale)
  }
  return null
}

/**
 * @param {Buffer} m
 * @param {{ data: number, end: number }} trak
 * @param {{ data: number, end: number }} mdia
 * @param {number} movieScale
 * @returns {KeyframeIndex | null}
 */
function mp4Track(m, trak, mdia, movieScale) {
  const mdhd = child(m, mdia.data, mdia.end, 'mdhd')
  const minf = child(m, mdia.data, mdia.end, 'minf')
  const stbl = minf && child(m, minf.data, minf.end, 'stbl')
  if (!mdhd || !stbl) return null
  const v1 = m[mdhd.data] === 1
  const scale = v1 ? m.readUInt32BE(mdhd.data + 20) : m.readUInt32BE(mdhd.data + 12)
  const mediaDuration = v1 ? Number(m.readBigUInt64BE(mdhd.data + 24)) : m.readUInt32BE(mdhd.data + 16)
  if (!scale) return null
  const stts = child(m, stbl.data, stbl.end, 'stts')
  const stsz = child(m, stbl.data, stbl.end, 'stsz') ?? child(m, stbl.data, stbl.end, 'stz2')
  if (!stts || !stsz) return null
  const count = m.readUInt32BE(stsz.data + 8)
  if (!count) return null // fragmentado: las muestras están en los moof
  // DTS de cada muestra.
  const dts = new Float64Array(count)
  {
    const n = m.readUInt32BE(stts.data + 4)
    let i = 0
    let t = 0
    for (let e = 0; e < n && i < count; e++) {
      const c = m.readUInt32BE(stts.data + 8 + e * 8)
      const d = m.readUInt32BE(stts.data + 12 + e * 8)
      for (let k = 0; k < c && i < count; k++, i++) {
        dts[i] = t
        t += d
      }
    }
  }
  // Composición (B-frames): pts = dts + ctts.
  const ctts = child(m, stbl.data, stbl.end, 'ctts')
  const pts = Float64Array.from(dts)
  if (ctts) {
    const n = m.readUInt32BE(ctts.data + 4)
    let i = 0
    for (let e = 0; e < n && i < count; e++) {
      const c = m.readUInt32BE(ctts.data + 8 + e * 8)
      const off = m.readInt32BE(ctts.data + 12 + e * 8)
      for (let k = 0; k < c && i < count; k++, i++) pts[i] += off
    }
  }
  // Lista de edición: la primera edición vacía corre todo; la primera con media_time es el cero.
  let shift = 0
  let mediaStart = 0
  const edts = child(m, trak.data, trak.end, 'edts')
  const elst = edts && child(m, edts.data, edts.end, 'elst')
  if (elst) {
    const ver = m[elst.data]
    const n = m.readUInt32BE(elst.data + 4)
    let p = elst.data + 8
    for (let e = 0; e < n; e++) {
      const segDur = ver === 1 ? Number(m.readBigUInt64BE(p)) : m.readUInt32BE(p)
      const mediaTime = ver === 1 ? Number(m.readBigInt64BE(p + 8)) : m.readInt32BE(p + 4)
      p += ver === 1 ? 20 : 12
      if (mediaTime === -1) {
        shift += movieScale ? segDur / movieScale : 0
        continue
      }
      mediaStart = mediaTime
      break
    }
  }
  const stss = child(m, stbl.data, stbl.end, 'stss')
  /** @type {number[]} */
  const times = []
  const toSec = (/** @type {number} */ t) => (t - mediaStart) / scale + shift
  if (stss) {
    const n = m.readUInt32BE(stss.data + 4)
    for (let e = 0; e < n; e++) {
      const s = m.readUInt32BE(stss.data + 8 + e * 4) - 1
      if (s >= 0 && s < count) times.push(toSec(pts[s]))
    }
  } else {
    for (let i = 0; i < count; i++) times.push(toSec(pts[i]))
  }
  const kept = times.filter((t) => t >= -1e-6)
  if (!kept.length) return null
  return { keyframes: uniqSorted(kept.map((t) => Math.max(0, t))), duration: mediaDuration / scale }
}

/** @param {number[]} list */
function uniqSorted(list) {
  const s = [...list].sort((a, b) => a - b)
  return s.filter((t, i) => i === 0 || t - s[i - 1] > 1e-6)
}

/**
 * Índice según el contenedor que dio ffprobe (`format_name`).
 * @param {string} formatName
 * @param {string} url  URL local (del motor) del archivo
 * @param {AbortSignal} [signal]
 * @returns {Promise<KeyframeIndex | null>}
 */
export async function keyframeIndex(formatName, url, signal) {
  const r = httpReader(url, signal)
  try {
    if (formatName.includes('matroska')) return await mkvKeyframes(r.read)
    if (formatName.includes('mp4') || formatName.includes('mov')) {
      await r.read(0, 16)
      return await mp4Keyframes(r.read, r.size())
    }
  } catch {
    return null
  }
  return null
}
