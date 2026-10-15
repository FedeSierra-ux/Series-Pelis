// Perfiles (v0.18): crear, cambiar, editar y borrar. El modelo está en profileModel.ts y el perfil
// activo del aparato en profiles.ts.

import { useMemo } from 'react'
import { flushCloudSync, forgetProfileSync, stopCloudSync } from './cloudSync'
import { cleanName, listProfiles, MAIN_PROFILE, MAX_PROFILES, newProfileId, nextColor, type Profile } from './profileModel'
import { activeProfileId, markProfilePicked, setActiveProfileId } from './profiles'
import { forgetProfileData, profilesStore, useStore } from './store'

export function useProfiles(): Profile[] {
  const stored = useStore(profilesStore)
  return useMemo(() => listProfiles(stored), [stored])
}

export function useActiveProfile(): Profile {
  const list = useProfiles()
  const id = activeProfileId()
  return list.find((p) => p.id === id) ?? list[0]
}

let switching = false

/**
 * Pasa a otro perfil. Sube lo pendiente, frena la sincronización y recarga: así cada store relee lo suyo
 * y nada del perfil anterior queda a medio escribir.
 */
export async function switchProfile(id: string) {
  markProfilePicked()
  if (id === activeProfileId() || switching) return
  switching = true
  await flushCloudSync(4000)
  stopCloudSync()
  setActiveProfileId(id)
  location.replace('/')
}

export function createProfile(fields: { name: string; color?: string; art?: string }): Profile | undefined {
  const name = cleanName(fields.name)
  const list = listProfiles(profilesStore.get())
  if (!name || list.length >= MAX_PROFILES) return undefined
  const profile: Profile = { id: newProfileId(), name, color: fields.color ?? nextColor(list), ...(fields.art ? { art: fields.art } : {}), at: Date.now() }
  profilesStore.set((all) => ({ ...all, [profile.id]: profile }))
  return profile
}

export function updateProfile(id: string, fields: { name: string; color: string; art?: string }) {
  const name = cleanName(fields.name)
  if (!name) return
  profilesStore.set((all) => {
    const cur = listProfiles(all).find((p) => p.id === id)
    if (!cur) return all
    const { art: _art, ...rest } = cur
    return { ...all, [id]: { ...rest, name, color: fields.color, ...(fields.art ? { art: fields.art } : {}), at: Date.now() } }
  })
}

/** Borra un perfil en todos los aparatos (sus datos se van del servidor). El principal no se borra. */
export async function deleteProfile(id: string) {
  if (id === MAIN_PROFILE) return
  profilesStore.set((all) => {
    if (!(id in all)) return all
    const { [id]: _gone, ...rest } = all
    return rest
  })
  // Lo de este aparato se borra en `initProfileWatch` (igual que cuando lo borran desde otro).
}

/**
 * Cuando un perfil sale de la lista (lo borraron acá o en otro aparato) se borran sus datos de este aparato.
 * Si era el activo, se pasa al principal.
 */
export function initProfileWatch() {
  let prev = new Set(Object.keys(profilesStore.get()))
  profilesStore.subscribe(() => {
    const next = new Set(Object.keys(profilesStore.get()))
    const gone = [...prev].filter((id) => !next.has(id) && id !== MAIN_PROFILE)
    prev = next
    if (!gone.length) return
    void (async () => {
      const wasActive = gone.includes(activeProfileId())
      if (wasActive) {
        // La lápida tiene que llegar al servidor antes de recargar.
        switching = true
        await flushCloudSync(4000)
        stopCloudSync()
      }
      await Promise.all(gone.flatMap((id) => [forgetProfileData(id), forgetProfileSync(id)]))
      if (wasActive) {
        setActiveProfileId(MAIN_PROFILE)
        location.replace('/')
      }
    })()
  })
}
