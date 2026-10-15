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

/** Solo al arrancar (antes de leer los datos) o justo antes de recargar. */
export function setActiveProfileId(id: string) {
  current = isProfileId(id) ? id : MAIN_PROFILE
  try {
    localStorage.setItem(KEY, current)
  } catch {
    // Sin localStorage: vale hasta cerrar la pestaña.
  }
}

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

export function openProfilePicker(manage = false) {
  window.dispatchEvent(new CustomEvent(OPEN_PROFILES, { detail: { manage } }))
}
