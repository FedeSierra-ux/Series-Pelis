import { useEffect, useMemo, useRef, useState } from 'react'
import { nativeHomeSync, nativeInfo } from '../lib/native'
import { buildHomeData, HOME_LIST_MAX } from '../lib/nativeHome'
import { activeProfileId } from '../lib/profiles'
import { continueWatching, progressStore, useStore, watchlistStore } from '../lib/store'
import { continueRowItems, unstartedWatchlist, useUpNext } from '../lib/upNext'

/** Espera para juntar cambios seguidos (el progreso se guarda cada pocos segundos mientras se mira). */
const DEBOUNCE_MS = 5000

/**
 * Filas propias en el inicio de Android TV (v0.21): manda "Seguir viendo" (a la fila "A continuación" del
 * sistema) y "Mi lista" (canal de la app) al APK. Solo dentro de la app y si el aparato tiene esas filas.
 */
export function NativeHomeSync() {
  const [home, setHome] = useState(false)
  useEffect(() => {
    let alive = true
    void nativeInfo().then((info) => alive && setHome(info.home === true))
    return () => {
      alive = false
    }
  }, [])
  return home ? <HomeSync /> : null
}

function HomeSync() {
  const progress = useStore(progressStore)
  const watchlist = useStore(watchlistStore)
  const { data } = useUpNext()
  const payload = useMemo(
    () =>
      buildHomeData(
        activeProfileId(),
        continueRowItems(continueWatching(progress), data?.next ?? []),
        unstartedWatchlist(watchlist, progress, HOME_LIST_MAX),
      ),
    [progress, watchlist, data],
  )
  const sent = useRef('')
  const latest = useRef(payload)
  latest.current = payload

  useEffect(() => {
    const flush = () => {
      const json = JSON.stringify(latest.current)
      if (json === sent.current) return
      sent.current = json
      nativeHomeSync(latest.current).catch(() => {
        sent.current = ''
      })
    }
    const timer = setTimeout(flush, DEBOUNCE_MS)
    // Al irse al inicio de la TV, que la fila ya esté al día.
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [payload])

  return null
}
