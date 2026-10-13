// Reparto de TMDB: una persona por tarjeta aunque haga varios personajes.

export interface CastLike {
  id: number
  name: string
  character?: string
  roles?: { character: string }[]
  profile_path?: string | null
}

export interface CastPerson {
  id: number
  name: string
  /** "Rol 1 / Rol 2" si hace más de uno. */
  character?: string
  profile_path?: string | null
}

/**
 * Junta las entradas repetidas de la misma persona (pelis donde un actor hace varios papeles, o el
 * reparto "agregado" de una serie) y arma el personaje como "Rol 1 / Rol 2". Mantiene el orden de aparición.
 */
export function mergeCast(cast: CastLike[], max = Infinity): CastPerson[] {
  const byId = new Map<number, { person: CastPerson; characters: string[] }>()
  for (const c of cast) {
    const roles = (c.roles ? c.roles.map((r) => r.character) : [c.character]).map((r) => r?.trim()).filter((r): r is string => !!r)
    const cur = byId.get(c.id)
    if (cur) {
      for (const r of roles) if (!cur.characters.includes(r)) cur.characters.push(r)
      if (!cur.person.profile_path && c.profile_path) cur.person.profile_path = c.profile_path
      continue
    }
    byId.set(c.id, { person: { id: c.id, name: c.name, profile_path: c.profile_path }, characters: [...new Set(roles)] })
  }
  return [...byId.values()].slice(0, max).map(({ person, characters }) => ({
    ...person,
    character: characters.length > 0 ? characters.join(' / ') : undefined,
  }))
}
