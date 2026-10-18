// Perfiles de una casa (v0.18), sin red ni IndexedDB: lo puro, para poder probarlo.
//
// Cada casa tiene un perfil "main" que siempre existe (es el de la v0.17: sus datos quedan donde estaban).
// Los demás tienen un id al azar. Cada perfil tiene su historial, seguir viendo, mi lista, estrellas,
// "no me interesa", diario y metas; lo demás es de la casa o del aparato.

import { isAvatarId } from './avatars'

export const MAIN_PROFILE = 'main'
export const MAX_PROFILES = 6
export const MAX_NAME = 20

/** Colores del perfil: fondo del avatar o de la inicial (sobre ellos va texto oscuro). */
export const PROFILE_COLORS = ['#c4b0ff', '#ffb4a2', '#ffd57e', '#9be7c4', '#8fd3ff', '#f5a3d0', '#b8e986', '#d7c4a3'] as const

export interface Profile {
  id: string
  name: string
  color: string
  /** Avatar fijo (`lib/avatars.ts`) sobre el color; sin él, la inicial. Desde la v0.24 (antes, `art`: el fondo de una peli). */
  avatar?: string
  /** Cuándo se creó o cambió (para la sincronización: gana el más nuevo). */
  at: number
}

/** Lo que cambia según el perfil: historial y seguir viendo (`progress`), lista, estrellas, etc. */
export const PROFILE_STORES = ['progress', 'watchlist', 'ratings', 'notInterested', 'diary', 'goals'] as const

const ID_RE = /^(main|[a-z0-9]{6,32})$/

export const isProfileId = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v)

export function newProfileId(rand: () => number = Math.random): string {
  let id = ''
  while (id.length < 10) id += Math.floor(rand() * 36).toString(36)
  return id
}

/** Clave de IndexedDB de un store según el perfil. El principal usa la de siempre (no hay que migrar nada). */
export const profileStorageKey = (base: string, profile: string) => (profile === MAIN_PROFILE ? base : `p:${profile}:${base}`)

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export const cleanName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)

/** Valida un perfil guardado o que llegó de otro aparato; `undefined` si no sirve. */
export function cleanProfile(id: string, raw: unknown): Profile | undefined {
  if (!isProfileId(id) || !isPlain(raw)) return undefined
  const name = typeof raw.name === 'string' ? cleanName(raw.name) : ''
  if (!name) return undefined
  const color = typeof raw.color === 'string' && (PROFILE_COLORS as readonly string[]).includes(raw.color) ? raw.color : PROFILE_COLORS[0]
  const avatar = isAvatarId(raw.avatar) ? raw.avatar : undefined
  const at = typeof raw.at === 'number' && Number.isFinite(raw.at) && raw.at >= 0 ? raw.at : 0
  return { id, name, color, ...(avatar ? { avatar } : {}), at }
}

export const DEFAULT_MAIN: Profile = { id: MAIN_PROFILE, name: 'Principal', color: PROFILE_COLORS[0], at: 0 }

/** Los perfiles en orden: primero el principal (aunque nunca se haya editado), después por creación. */
export function listProfiles(stored: Record<string, Profile>): Profile[] {
  const main = stored[MAIN_PROFILE] ?? DEFAULT_MAIN
  const rest = Object.values(stored)
    .filter((p) => p.id !== MAIN_PROFILE)
    .sort((a, b) => (a.at - b.at) || a.id.localeCompare(b.id))
  return [main, ...rest]
}

/** Primer color que no usa nadie (o el que sigue en la ronda). */
export function nextColor(profiles: Profile[]): string {
  const used = new Set(profiles.map((p) => p.color))
  return PROFILE_COLORS.find((c) => !used.has(c)) ?? PROFILE_COLORS[profiles.length % PROFILE_COLORS.length]
}

export const initialOf = (name: string) => [...name.trim()][0]?.toLocaleUpperCase('es-AR') ?? '?'
