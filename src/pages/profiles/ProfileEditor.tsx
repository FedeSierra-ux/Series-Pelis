import { useEffect, useRef, useState, type FormEvent } from 'react'
import { KeyboardToggle } from '../../components/OnScreenKeyboard'
import { ProfileAvatar } from '../../components/ProfileAvatar'
import { AVATAR_GROUPS, AVATARS, avatarById, avatarUrl, randomAvatar, type AvatarGroup } from '../../lib/avatars'
import { MAIN_PROFILE, MAX_NAME, PROFILE_COLORS, type Profile } from '../../lib/profileModel'
import { createProfile, deleteProfile, updateProfile } from '../../lib/profileSwitch'

/**
 * Crear o editar un perfil: nombre, personaje (animales, personajes o criaturas, v0.24) y color de fondo.
 * Un perfil nuevo arranca con un personaje al azar que no use otro. Borrar pide confirmar acá mismo
 * (el principal no se borra).
 */
export function ProfileEditor({ profile, defaultColor, takenAvatars = [], onClose }: { profile?: Profile; defaultColor: string; takenAvatars?: (string | undefined)[]; onClose: () => void }) {
  const [name, setName] = useState(profile?.name ?? '')
  const [color, setColor] = useState(profile?.color ?? defaultColor)
  const [avatar, setAvatar] = useState<string | undefined>(() => (profile ? avatarById(profile.avatar)?.id : randomAvatar(takenAvatars)))
  const [group, setGroup] = useState<AvatarGroup>(() => avatarById(avatar)?.group ?? 'animales')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string>()
  const nameRef = useRef<HTMLInputElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    nameRef.current?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    if (confirming) deleteRef.current?.focus({ preventScroll: true })
  }, [confirming])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!name.trim()) {
      setError('Poné un nombre.')
      nameRef.current?.focus()
      return
    }
    if (profile) updateProfile(profile.id, { name, color, avatar })
    else if (!createProfile({ name, color, avatar })) {
      setError('No se pudo crear el perfil.')
      return
    }
    onClose()
  }

  const title = profile ? 'Editar perfil' : 'Nuevo perfil'
  return (
    <form className="pf-editor" onSubmit={submit} aria-labelledby="pf-editor-title">
      <h2 id="pf-editor-title">{title}</h2>
      <div className="pf-editor-top">
        <ProfileAvatar profile={{ name: name || '?', color, avatar }} size={96} />
        <div className="pf-editor-name">
          <label className="pf-label" htmlFor="pf-name">
            Nombre
          </label>
          <input
            id="pf-name"
            type="text"
            ref={nameRef}
            value={name}
            maxLength={MAX_NAME}
            autoComplete="off"
            onChange={(e) => {
              setName(e.target.value)
              setError(undefined)
            }}
          />
          <KeyboardToggle value={name} onChange={(v) => setName(v.slice(0, MAX_NAME))} onDone={() => submit()} doneLabel="Listo" label="Teclado para el nombre" />
        </div>
      </div>

      <fieldset className="pf-field">
        <legend className="pf-label">Personaje</legend>
        <div className="pf-groups">
          {AVATAR_GROUPS.map((g) => (
            <button key={g.id} type="button" className="pf-group" aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>
              {g.label}
            </button>
          ))}
        </div>
        <div className="pf-avatars">
          <button type="button" className="pf-pick pf-pick-initial" style={{ background: color }} aria-pressed={!avatar} aria-label="Sin personaje, la inicial" title="Sin personaje, la inicial" onClick={() => setAvatar(undefined)}>
            {name.trim() ? [...name.trim()][0].toLocaleUpperCase('es-AR') : 'Aa'}
          </button>
          {AVATARS.filter((a) => a.group === group).map((a) => (
            <button key={a.id} type="button" className="pf-pick" style={{ background: color }} aria-pressed={avatar === a.id} aria-label={a.label} title={a.label} onClick={() => setAvatar(a.id)}>
              <img src={avatarUrl(a.id)} alt="" loading="lazy" decoding="async" draggable={false} />
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="pf-field">
        <legend className="pf-label">Color de fondo</legend>
        <div className="pf-swatches">
          {PROFILE_COLORS.map((c, i) => (
            <button key={c} type="button" className="pf-swatch" style={{ background: c }} aria-pressed={color === c} aria-label={`Color ${i + 1}`} onClick={() => setColor(c)} />
          ))}
        </div>
      </fieldset>

      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}

      {confirming && profile ? (
        <div className="pf-confirm" role="alert">
          <p>
            ¿Borrar a <strong>{profile.name}</strong>? Se borra su historial, Mi lista, estrellas, diario y metas en todos los aparatos.
          </p>
          <div className="pf-actions">
            <button
              ref={deleteRef}
              type="button"
              className="btn pf-danger"
              onClick={() => {
                void deleteProfile(profile.id)
                onClose()
              }}
            >
              Borrar perfil
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
              No, dejarlo
            </button>
          </div>
        </div>
      ) : (
        <div className="pf-actions">
          <button type="submit" className="btn btn-primary">
            Guardar
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          {profile && profile.id !== MAIN_PROFILE && (
            <button type="button" className="btn btn-ghost pf-delete" onClick={() => setConfirming(true)}>
              Borrar perfil
            </button>
          )}
        </div>
      )}
    </form>
  )
}
