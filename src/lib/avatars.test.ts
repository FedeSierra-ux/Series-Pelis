import { describe, expect, it } from 'vitest'
import { AVATAR_GROUPS, AVATARS, avatarUrl, isAvatarId, randomAvatar } from './avatars'

// Las imágenes que hay en public/avatars (Vite las lista en el build del test).
const files = new Set(Object.keys(import.meta.glob('../../public/avatars/*.webp')).map((f) => f.replace('../../public', '')))

describe('avatares', () => {
  it('cada uno tiene su imagen en public/ y un grupo conocido, sin ids repetidos', () => {
    const groups = new Set(AVATAR_GROUPS.map((g) => g.id))
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(AVATARS.length)
    for (const a of AVATARS) {
      expect(a.id).toMatch(/^[a-z0-9-]+$/)
      expect(groups.has(a.group)).toBe(true)
      expect(files.has(avatarUrl(a.id)), a.id).toBe(true)
    }
  })

  it('no sobran imágenes sin usar', () => {
    expect(files.size).toBe(AVATARS.length)
  })

  it('valida ids', () => {
    expect(isAvatarId('fox')).toBe(true)
    expect(isAvatarId('https://x/y.png')).toBe(false)
    expect(isAvatarId(undefined)).toBe(false)
  })

  it('al azar evita los que ya se usan', () => {
    const taken = AVATARS.slice(1).map((a) => a.id)
    expect(randomAvatar(taken, () => 0.99)).toBe(AVATARS[0].id)
    // Si están todos usados, cualquiera.
    expect(isAvatarId(randomAvatar(AVATARS.map((a) => a.id)))).toBe(true)
  })
})
