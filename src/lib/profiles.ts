// El perfil activo de este aparato (v0.18). Se guarda en localStorage y vale para toda la página:
// cambiar de perfil recarga la app (ver profileSwitch.ts), así nada queda a medio escribir.

import { isProfileId, MAIN_PROFILE } from './profileModel'

const KEY = 'sp-profile'
/** En esta pestaña ya se eligió (o se pasó por "¿Quién está mirando?"): no se vuelve a preguntar al recargar. */
const PICKED_KEY = 'sp-profile-picked'

function read(): string {
  try {
    const v = localStorage.getItem(KEY)
    return isProfileId(v) ? v : MAIN_PROFILE
  } catch {
    return MAIN_PROFILE
  }
}

let current = read()

export const activeProfileId = () => current

/** Solo al arrancar, antes de leer los datos. Para cambiar de perfil está `persistProfileChoice` + recargar. */
export function setActiveProfileId(id: string) {
  current = isProfileId(id) ? id : MAIN_PROFILE
  persist(current)
}

/**
 * Deja elegido el perfil para la próxima carga sin cambiar el de esta página: lo que se guarde hasta
 * recargar (el progreso al salir del reproductor, por ejemplo) sigue yendo al perfil que se estaba usando.
 */
export function persistProfileChoice(id: string) {
  persist(isProfileId(id) ? id : MAIN_PROFILE)
}

function persist(id: string) {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Sin localStorage: vale hasta cerrar la pestaña.
  }
}

let frozen = false

/** Los datos del perfil activo se están borrando: hasta recargar no se guarda nada más de ese perfil. */
export function freezeProfileWrites() {
  frozen = true
}

export const profileWritesFrozen = () => frozen

export function profilePicked(): boolean {
  try {
    return sessionStorage.getItem(PICKED_KEY) === '1'
  } catch {
    return false
  }
}

export function markProfilePicked() {
  try {
    sessionStorage.setItem(PICKED_KEY, '1')
  } catch {
    // Nada.
  }
}

/** Si otra pestaña cambia de perfil, esta recarga con el nuevo (si no, escribiría en el perfil viejo). */
export function watchProfileChange() {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return
    const next = isProfileId(e.newValue) ? e.newValue : MAIN_PROFILE
    if (next !== current) location.reload()
  })
}

/** Evento de `window` para abrir "¿Quién está mirando?" (desde "Vos" o Ajustes). */
export const OPEN_PROFILES = 'sp-open-profiles'

/** Evento de `window` (v0.21): se abrió la app desde el inicio de la TV, que ya dice el perfil. */
export const PROFILE_FROM_LAUNCH = 'sp-profile-from-launch'

export function openProfilePicker(manage = false) {
  window.dispatchEvent(new CustomEvent(OPEN_PROFILES, { detail: { manage } }))
}
