import { useEffect, useState, type FormEvent } from 'react'
import { createHouse, deleteHouse, inviteLink, listHouses, renameHouse, revokeInvite, rotateInvite, useAuth, type HouseInfo } from '../../lib/auth'
import { authErrorText, DeviceList } from './HouseSettings'
import '../auth/auth.css'

/** Enlace de invitación con "Copiar" (si el portapapeles no deja, el texto queda seleccionable). */
function InviteBox({ code }: { code: string }) {
  const link = inviteLink(code)
  const [copied, setCopied] = useState(false)
  return (
    <div className="house-invite">
      <code>{link}</code>
      <button
        type="button"
        className="btn btn-small"
        onClick={() => {
          navigator.clipboard?.writeText(link).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        }}
      >
        {copied ? '✓ Copiado' : 'Copiar'}
      </button>
      <span className="muted small">
        Código: <strong>{code}</strong>. Se ve una sola vez: guardalo o mandalo ahora.
      </span>
    </div>
  )
}

function HouseCard({ house, onChange }: { house: HouseInfo; onChange: () => void }) {
  const [invite, setInvite] = useState<string>()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(house.name)
  const [confirm, setConfirm] = useState<'delete' | 'revoke'>()
  const [showDevices, setShowDevices] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(undefined)
    try {
      await fn()
    } catch (err) {
      setError(authErrorText(err))
    } finally {
      setBusy(false)
      setConfirm(undefined)
    }
  }

  const rename = (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    void act(async () => {
      await renameHouse(house.id, n)
      setRenaming(false)
      onChange()
    })
  }

  return (
    <li className="house-card">
      {renaming ? (
        <form className="inline-form" onSubmit={rename}>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Nombre de la casa" autoFocus />
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            Guardar
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setRenaming(false)}>
            Cancelar
          </button>
        </form>
      ) : (
        <h3>
          {house.name} {house.isAdmin && <span className="chip small">Tu casa</span>}
        </h3>
      )}
      <p className="muted small">
        {house.devices === 1 ? '1 aparato' : `${house.devices} aparatos`} · {house.hasInvite ? 'Invitación activa' : 'Sin invitación'}
      </p>
      {invite && <InviteBox code={invite} />}
      <div className="house-item-actions">
        <button type="button" className="btn btn-small" disabled={busy} onClick={() => void act(async () => {
          setInvite(await rotateInvite(house.id))
          onChange()
        })}>
          {house.hasInvite ? 'Nueva invitación' : 'Crear invitación'}
        </button>
        {house.hasInvite &&
          (confirm === 'revoke' ? (
            <span className="confirm-inline">
              <span className="small">¿Anular la invitación? Los que ya entraron siguen.</span>
              <button type="button" className="btn btn-small danger" disabled={busy} onClick={() => void act(async () => {
                await revokeInvite(house.id)
                setInvite(undefined)
                onChange()
              })}>
                Sí, anular
              </button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirm(undefined)}>
                No
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirm('revoke')}>
              Anular invitación
            </button>
          ))}
        <button type="button" className="btn btn-small btn-ghost" onClick={() => setShowDevices((v) => !v)} aria-expanded={showDevices}>
          {showDevices ? 'Ocultar aparatos' : 'Ver aparatos'}
        </button>
        {!renaming && (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setRenaming(true)}>
            Renombrar
          </button>
        )}
        {!house.isAdmin &&
          (confirm === 'delete' ? (
            <span className="confirm-inline">
              <span className="small">¿Borrar la casa? Se cierran sus aparatos y se borra lo sincronizado (historial, lista…).</span>
              <button type="button" className="btn btn-small danger" disabled={busy} onClick={() => void act(async () => {
                await deleteHouse(house.id)
                onChange()
              })}>
                Sí, borrar
              </button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => setConfirm(undefined)}>
                No
              </button>
            </span>
          ) : (
            <button type="button" className="btn btn-small btn-ghost danger" onClick={() => setConfirm('delete')}>
              Borrar casa
            </button>
          ))}
      </div>
      {showDevices && <DeviceList house={house.id} onChange={onChange} />}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </li>
  )
}

/** Ajustes → Casas (solo el admin): crear casas, invitaciones y aparatos de cada una. */
export function HousesSettings() {
  const auth = useAuth()
  const isAdmin = auth.status === 'in' && auth.house.isAdmin
  const [houses, setHouses] = useState<HouseInfo[]>()
  const [round, setRound] = useState(0)
  const [name, setName] = useState('')
  const [created, setCreated] = useState<{ name: string; invite: string }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!isAdmin) return
    let alive = true
    listHouses().then(
      (h) => {
        if (alive) setHouses(h)
      },
      (err) => {
        if (alive) setError(authErrorText(err))
      },
    )
    return () => {
      alive = false
    }
  }, [isAdmin, round])

  if (!isAdmin) return null

  const create = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n || busy) return
    setBusy(true)
    setError(undefined)
    try {
      const r = await createHouse(n)
      setCreated({ name: r.house.name, invite: r.invite })
      setName('')
      setRound((x) => x + 1)
    } catch (err) {
      setError(authErrorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-section">
      <h2>Casas</h2>
      <p className="muted">
        Cada casa tiene su historial, su lista y sus ajustes. Los addons son los mismos para todas y solo vos los cambiás. Para
        sumar una casa, creala y mandale el enlace de invitación.
      </p>
      <form className="inline-form" onSubmit={create}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej. Casa de la abuela)" maxLength={40} aria-label="Nombre de la casa nueva" />
        <button className="btn btn-primary" disabled={busy || !name.trim()}>
          Crear casa
        </button>
      </form>
      {created && (
        <div className="house-card">
          <h3>✓ Casa “{created.name}” creada</h3>
          <p className="small">Mandale este enlace por chat. Con él entran todos los aparatos de esa casa.</p>
          <InviteBox code={created.invite} />
        </div>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!houses ? (
        !error && <div className="spinner" />
      ) : (
        <ul className="house-list">
          {houses.map((h) => (
            <HouseCard key={h.id} house={h} onChange={() => setRound((x) => x + 1)} />
          ))}
        </ul>
      )}
    </section>
  )
}
