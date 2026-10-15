import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { KeyboardToggle } from '../../components/OnScreenKeyboard'
import { ProfileAvatar } from '../../components/ProfileAvatar'
import { MAIN_PROFILE, MAX_NAME, PROFILE_COLORS, type Profile } from '../../lib/profileModel'
import { createProfile, deleteProfile, updateProfile } from '../../lib/profileSwitch'
import { progressStore, useStore, watchlistStore } from '../../lib/store'

const ART_MAX = 12

/** Imágenes para el avatar: fondos de lo último que se vio y pósters de Mi lista (del perfil activo). */
function useArtChoices(current?: string): string[] {
  const progress = useStore(progressStore)
  const list = useStore(watchlistStore)
  return useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    const add = (url?: string) => {
      if (!url || !url.startsWith('https://') || seen.has(url) || out.length >= ART_MAX) return
      seen.add(url)
      out.push(url)
    }
    add(current)
    Object.values(progress)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .forEach((e) => add(e.background))
    Object.values(list)
      .sort((a, b) => b.addedAt - a.addedAt)
      .forEach((e) => add(e.poster))
    return out
  }, [progress, list, current])
}

/**
 * Crear o editar un perfil: nombre, color o fondo de una peli. Borrar pide confirmar acá mismo
 * (el principal no se borra).
 */
export function ProfileEditor({ profile, defaultColor, onClose }: { profile?: Profile; defaultColor: string; onClose: () => void }) {
  const [name, setName] = useState(profile?.name ?? '')
  const [color, setColor] = useState(profile?.color ?? defaultColor)
  const [art, setArt] = useState(profile?.art)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string>()
  const arts = useArtChoices(profile?.art)
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
    if (profile) updateProfile(profile.id, { name, color, art })
    else if (!createProfile({ name, color, art })) {
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
        <ProfileAvatar profile={{ name: name || '?', color, art }} size={96} />
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
        <legend className="pf-label">Color</legend>
        <div className="pf-swatches">
          {PROFILE_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              className="pf-swatch"
              style={{ background: c }}
              aria-pressed={!art && color === c}
              aria-label={`Color ${i + 1}`}
              onClick={() => {
                setColor(c)
                setArt(undefined)
              }}
            />
          ))}
        </div>
      </fieldset>

      {arts.length > 0 && (
        <fieldset className="pf-field">
          <legend className="pf-label">O el fondo de algo que viste</legend>
          <div className="pf-arts">
            {arts.map((url) => (
              <button key={url} type="button" className="pf-art" aria-pressed={art === url} aria-label="Usar este fondo" onClick={() => setArt(url)}>
                <img src={url} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        </fieldset>
      )}

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
