// Al salir del reproductor después de pasar solo al siguiente episodio, la ficha que quedó atrás en el
// historial todavía tiene marcado el episodio anterior (?video=…). El reproductor deja anotado cuál se vio
// último y la ficha lo toma una sola vez al volver.

const KEY = 'sp-return-video'

export interface ReturnVideo {
  metaId: string
  videoId: string
  season?: number
}

export function setReturnVideo(v: ReturnVideo) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    // sessionStorage bloqueado: la ficha queda como estaba
  }
}

/** Devuelve y borra lo anotado, solo si es de este título. */
export function takeReturnVideo(metaId: string): ReturnVideo | undefined {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return undefined
    const v = JSON.parse(raw) as ReturnVideo
    if (v.metaId !== metaId) return undefined
    sessionStorage.removeItem(KEY)
    return v
  } catch {
    return undefined
  }
}
