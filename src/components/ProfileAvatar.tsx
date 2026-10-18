import { useState } from 'react'
import { avatarById, avatarUrl } from '../lib/avatars'
import { initialOf, type Profile } from '../lib/profileModel'
import './profile-avatar.css'

/** Avatar de un perfil: el personaje elegido (o la inicial) sobre su color (v0.18; personajes desde la v0.24). */
export function ProfileAvatar({ profile, size = 40, className = '' }: { profile: Pick<Profile, 'name' | 'color' | 'avatar'>; size?: number; className?: string }) {
  const [broken, setBroken] = useState<string>()
  const avatar = avatarById(profile.avatar)?.id
  const show = avatar && avatar !== broken ? avatar : undefined
  return (
    <span className={`pf-avatar ${className}`} style={{ width: size, height: size, fontSize: size * 0.46, background: profile.color }} aria-hidden>
      {show ? <img src={avatarUrl(show)} alt="" decoding="async" draggable={false} onError={() => setBroken(show)} /> : initialOf(profile.name)}
    </span>
  )
}
