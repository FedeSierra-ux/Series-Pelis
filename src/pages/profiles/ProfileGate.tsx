import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { SCREENSAVER_CLOSED } from '../../lib/idle'
import { OPEN_PROFILES, PROFILE_FROM_LAUNCH, profilePicked } from '../../lib/profiles'
import { useProfiles } from '../../lib/profileSwitch'
import { useTvMode } from '../../lib/tv'
import { WhoIsWatching } from './WhoIsWatching'

type Open = { auto: boolean; manage: boolean } | undefined

/**
 * Cuándo aparece "¿Quién está mirando?" (v0.18, variante D):
 * - En la TV, con más de un perfil: al abrir la app y al cerrarse el protector (entra solo a los 10 s).
 * - En PC y celular se recuerda el último perfil: solo se abre desde "Vos" o Ajustes.
 * - Con un solo perfil, nunca se abre solo (todo igual que antes).
 */
export function ProfileGate() {
  const tv = useTvMode()
  const multi = useProfiles().length > 1
  const { pathname } = useLocation()
  const watching = pathname.startsWith('/watch')
  const [open, setOpen] = useState<Open>(() => (tv && multi && !watching && !profilePicked() ? { auto: true, manage: false } : undefined))

  useEffect(() => {
    const onOpen = (e: Event) => setOpen({ auto: false, manage: !!(e as CustomEvent<{ manage?: boolean }>).detail?.manage })
    // Abierta desde una tarjeta del inicio de la TV: el perfil ya viene elegido, no se pregunta.
    const onLaunch = () => setOpen((o) => (o?.auto ? undefined : o))
    window.addEventListener(OPEN_PROFILES, onOpen)
    window.addEventListener(PROFILE_FROM_LAUNCH, onLaunch)
    return () => {
      window.removeEventListener(OPEN_PROFILES, onOpen)
      window.removeEventListener(PROFILE_FROM_LAUNCH, onLaunch)
    }
  }, [])

  useEffect(() => {
    if (!tv || !multi || watching) return
    const onClosed = () => setOpen((o) => o ?? { auto: true, manage: false })
    window.addEventListener(SCREENSAVER_CLOSED, onClosed)
    return () => window.removeEventListener(SCREENSAVER_CLOSED, onClosed)
  }, [tv, multi, watching])

  if (!open) return null
  return <WhoIsWatching auto={open.auto} startManaging={open.manage} onClose={() => setOpen(undefined)} />
}
