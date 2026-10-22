// @ts-check
// Qué archivo del torrent se reproduce cuando el addon no lo dice (packs de temporada, carpetas con extras).

const VIDEO_EXT = /\.(mkv|mp4|m4v|avi|mov|wmv|webm|ts|m2ts|mts|mpg|mpeg|flv|ogv|3gp|divx|xvid)$/i
/** Muestras y extras: no se eligen si hay otro video. */
const EXTRA_RE = /(^|[\\/ ._\-[(])(sample|trailer|featurette|extras?)([\\/ ._\-\])]|$)/i

/** @param {string} name */
export function isVideoName(name) {
  return VIDEO_EXT.test(name)
}

/**
 * Temporada y episodios que nombra la ruta: `S01E02`, `S01E02E03`, `S01E02-E03`, `1x02`, o una carpeta
 * `Season 1`/`Temporada 1` con `E02`/`Ep 02`/`Episodio 02` en el nombre.
 * @param {string} path
 * @returns {{ season: number, episodes: number[] }[]}
 */
export function episodeTags(path) {
  /** @type {{ season: number, episodes: number[] }[]} */
  const out = []
  const s = path.replace(/\\/g, '/')
  for (const m of s.matchAll(/(?:^|[^a-z0-9])s(\d{1,2})[ ._-]?e(\d{1,3})((?:[ ._-]?-?[ ._-]?e\d{1,3})*)(?![0-9])/gi)) {
    const episodes = [Number(m[2])]
    for (const e of m[3].matchAll(/e(\d{1,3})/gi)) episodes.push(Number(e[1]))
    // `E01-E03` = del 1 al 3.
    if (episodes.length === 2 && /-/.test(m[3]) && episodes[1] > episodes[0] && episodes[1] - episodes[0] < 30) {
      for (let e = episodes[0] + 1; e < episodes[1]; e++) episodes.push(e)
    }
    out.push({ season: Number(m[1]), episodes })
  }
  for (const m of s.matchAll(/(?:^|[^a-z0-9])(\d{1,2})x(\d{2,3})(?![0-9])/gi)) {
    out.push({ season: Number(m[1]), episodes: [Number(m[2])] })
  }
  if (!out.length) {
    const season = /(?:season|temporada|staffel|saison)[ ._-]?(\d{1,2})(?![0-9])/i.exec(s)
    const base = s.slice(s.lastIndexOf('/') + 1)
    const ep = /(?:^|[^a-z0-9])(?:e|ep|episode|episodio|cap|capitulo|capítulo)[ ._-]?(\d{1,3})(?![0-9])/i.exec(base)
    if (season && ep) out.push({ season: Number(season[1]), episodes: [Number(ep[1])] })
  }
  return out
}

/**
 * Índice a reproducir: con temporada/episodio, el video más grande que los nombra; si no (o no hay ninguno), el
 * video más grande que no sea muestra. Sin videos, el archivo más grande.
 * @param {readonly { name?: string, path?: string, length: number }[]} files
 * @param {false | { season?: number, episode?: number } | undefined | null} guess
 * @returns {number}
 */
export function guessFileIdx(files, guess) {
  if (!files.length) return -1
  const idxs = files.map((_, i) => i)
  const pathOf = (/** @type {number} */ i) => files[i].path || files[i].name || ''
  const videos = idxs.filter((i) => isVideoName(pathOf(i)))
  const biggest = (/** @type {number[]} */ list) => list.reduce((a, b) => (files[b].length > files[a].length ? b : a))
  if (guess && Number.isFinite(guess.episode)) {
    const hit = videos.filter((i) =>
      episodeTags(pathOf(i)).some(
        (t) => t.episodes.includes(/** @type {number} */ (guess.episode)) && (!Number.isFinite(guess.season) || t.season === guess.season),
      ),
    )
    if (hit.length) return biggest(hit)
  }
  const main = videos.filter((i) => !EXTRA_RE.test(pathOf(i)))
  if (main.length) return biggest(main)
  if (videos.length) return biggest(videos)
  return biggest(idxs)
}

/** El video más grande (para `fileIdx = -1`). @param {readonly { name?: string, path?: string, length: number }[]} files */
export function largestVideoIdx(files) {
  return guessFileIdx(files, false)
}
