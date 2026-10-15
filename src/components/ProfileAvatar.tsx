import { useState } from 'react'
import { initialOf, type Profile } from '../lib/profileModel'
import './profile-avatar.css'

/** Avatar de un perfil: el fondo de una peli o la inicial sobre su color (v0.18). */
export function ProfileAvatar({ profile, size = 40, className = '' }: { profile: Pick<Profile, 'name' | 'color' | 'art'>; size?: number; className?: string }) {
  const [broken, setBroken] = useState<string>()
  const art = profile.art && profile.art !== broken ? profile.art : undefined
  return (
    <span className={`pf-avatar ${className}`} style={{ width: size, height: size, fontSize: size * 0.46, background: profile.color }} aria-hidden>
      {art ? <img src={art} alt="" loading="lazy" decoding="async" onError={() => setBroken(art)} /> : initialOf(profile.name)}
    </span>
  )
}
