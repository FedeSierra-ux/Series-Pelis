import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isNativeApp, listenNative, nativeTakeLaunch, type NativeLaunch as Launch } from '../lib/native'
import { parseLaunchPath, savePendingLaunch, takePendingLaunch, type LaunchTarget } from '../lib/nativeLaunch'
import { isProfileId, listProfiles } from '../lib/profileModel'
import { activeProfileId, markProfilePicked, PROFILE_FROM_LAUNCH } from '../lib/profiles'
import { switchProfile } from '../lib/profileSwitch'
import { profilesStore } from '../lib/store'
import { useDirectPlay } from '../pages/home/useDirectPlay'

/**
 * Abrir la app desde una tarjeta del inicio de Android TV (v0.21). Si la tarjeta es de otro perfil, se pasa
 * a ese perfil (recarga) y se sigue después; "¿Quién está mirando?" no se pregunta, ya se eligió.
 */
export function NativeLaunch() {
  return isNativeApp() ? <LaunchHandler /> : null
}

function LaunchHandler() {
  const navigate = useNavigate()
  const { pending, play, cancel } = useDirectPlay()

  useEffect(() => {
    const open = (target: LaunchTarget) => {
      if (target.play) {
        const key = `launch:${target.play.videoId ?? target.play.metaId}`
        void play(key, target.play, target.path)
      } else {
        navigate(target.path)
      }
    }
    const handle = (launch: Launch) => {
      const target = parseLaunchPath(launch.path)
      if (!target) return
      const profile = launch.profile
      if (profile && isProfileId(profile) && profile !== activeProfileId() && listProfiles(profilesStore.get()).some((p) => p.id === profile)) {
        savePendingLaunch(launch.path!)
        void switchProfile(profile)
        return
      }
      markProfilePicked()
      window.dispatchEvent(new Event(PROFILE_FROM_LAUNCH))
      open(target)
    }
    const take = () => {
      void nativeTakeLaunch().then(handle)
    }
    const after = takePendingLaunch()
    if (after) handle({ path: after })
    else take()
    return listenNative('open', take)
    // Una sola vez: `play` cambia con cada búsqueda y la primera ya cancela la anterior sola.
  }, [])

  if (!pending) return null
  return (
    <div className="update-toast" role="status" aria-live="polite">
      <span className="update-toast-text">Buscando fuente…</span>
      <div className="update-toast-actions">
        <button type="button" className="btn btn-small" onClick={cancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}
