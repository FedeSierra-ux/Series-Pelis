// Los navegadores solo entienden subtítulos WebVTT; la mayoría de los addons dan SRT.

export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .trim()
  return 'WEBVTT\n\n' + body + '\n'
}

const blobUrls = new Map<string, string>()

/** Descarga el subtítulo, lo convierte a VTT si hace falta y devuelve una URL local. */
export async function loadSubtitle(url: string): Promise<string> {
  const hit = blobUrls.get(url)
  if (hit) return hit
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buffer = await res.arrayBuffer()
  let text = new TextDecoder('utf-8').decode(buffer)
  // Muchos .srt en español vienen en Windows-1252: si hay caracteres inválidos, reintentamos.
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buffer)
  const vtt = text.trimStart().startsWith('WEBVTT') ? text : srtToVtt(text)
  const blobUrl = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))
  blobUrls.set(url, blobUrl)
  return blobUrl
}
