import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ProfileAvatar } from '../../components/ProfileAvatar'
import { Theme2Icon } from '../../components/Theme2Icons'
import { MAX_PROFILES, nextColor, spokenCountdown, type Profile } from '../../lib/profileModel'
import { activeProfileId, markProfilePicked } from '../../lib/profiles'
import { switchProfile, useProfiles } from '../../lib/profileSwitch'
import { focusInitialTarget, isTv } from '../../lib/spatialNav'
import { ProfileEditor } from './ProfileEditor'
import './profiles.css'

const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
/** Lo enfocable que se ve dentro de la capa (para que Tab dé la vuelta adentro). */
const focusables = (root: Element | null | undefined) => Array.from(root?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.getClientRects().length > 0)
/** En la TV, si nadie elige, entra solo con el perfil marcado. */
export const AUTO_ENTER_S = 10

type Editing = { profile?: Profile } | undefined

/**
 * "¿Quién está mirando?" (v0.18). Con `auto` (la TV al abrir o después del protector) cuenta 10 s y entra
 * con el perfil marcado; cualquier tecla reinicia la cuenta. "Administrar perfiles" deja crear, editar y borrar.
 */
export function WhoIsWatching({ auto, startManaging = false, onClose }: { auto: boolean; startManaging?: boolean; onClose: () => void }) {
  const profiles = useProfiles()
  const current = activeProfileId()
  const [manage, setManage] = useState(startManaging)
  const [editing, setEditing] = useState<Editing>()
  const [focused, setFocused] = useState(current)
  const [round, setRound] = useState(0)
  const [left, setLeft] = useState(AUTO_ENTER_S)
  const gridRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const counting = auto && !manage && !editing

  // Capa modal de verdad (a11y-02, tv-06): va en un portal y la página de atrás queda `inert` (ni Tab ni el lector
  // de pantalla la alcanzan, como el panel de filtros). Al cerrar, el foco vuelve a quien la abrió (el botón de
  // perfil) y, si no hay a quién (al abrir la app o tras el protector en la TV), a lo primero de la pantalla.
  useEffect(() => {
    const prev = document.activeElement
    const opener = prev instanceof HTMLElement && prev !== document.body ? prev : null
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    const body = document.body
    const prevOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    return () => {
      root?.removeAttribute('inert')
      body.style.overflow = prevOverflow
      // En el cuadro siguiente: recién ahí la capa ya no está y la página de atrás vuelve a ser enfocable.
      requestAnimationFrame(() => {
        const active = document.activeElement
        if (active && active !== document.body) return
        if (opener?.isConnected) opener.focus({ preventScroll: true })
        else if (isTv()) focusInitialTarget()
      })
    }
  }, [])

  const choose = (id: string) => {
    markProfilePicked()
    if (id === activeProfileId()) onClose()
    else void switchProfile(id)
  }

  // Al abrir (y al volver del editor), el foco va al perfil actual.
  useEffect(() => {
    if (editing) return
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-profile="${focused}"]`) ?? gridRef.current?.querySelector<HTMLElement>('button')
    el?.focus({ preventScroll: true })
  }, [editing, manage])

  // Cuenta regresiva: se reinicia con cada tecla o toque (`round`).
  useEffect(() => {
    if (!counting) return
    const end = Date.now() + AUTO_ENTER_S * 1000
    setLeft(AUTO_ENTER_S)
    const timer = setInterval(() => {
      const s = Math.ceil((end - Date.now()) / 1000)
      if (s > 0) {
        setLeft(s)
        return
      }
      clearInterval(timer)
      const el = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.profile : undefined
      choose(el ?? focused)
    }, 250)
    return () => clearInterval(timer)
  }, [counting, round])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (counting) setRound((r) => r + 1)
    if (e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      // Tab y Shift+Tab dan la vuelta dentro de la capa (las flechas ya se quedan por `data-nav-scope`).
      const els = focusables(boxRef.current)
      if (els.length === 0) return
      const i = els.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && i <= 0) {
        e.preventDefault()
        els[els.length - 1].focus()
      } else if (!e.shiftKey && i === els.length - 1) {
        e.preventDefault()
        els[0].focus()
      }
      return
    }
    if (!BACK_KEYS.has(e.key) || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    const t = e.target
    const typing = t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !['checkbox', 'radio', 'range', 'button', 'submit'].includes(t.type))
    if (typing) {
      e.stopPropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        t.blur()
      }
      return
    }
    // "Atrás": del editor a la grilla, de administrar a elegir, y si no, sigue con el perfil de ahora.
    e.preventDefault()
    e.stopPropagation()
    if (editing) setEditing(undefined)
    else if (manage && !startManaging) setManage(false)
    else {
      markProfilePicked()
      onClose()
    }
  }

  const focusedName = profiles.find((p) => p.id === focused)?.name
  return createPortal(
    <div className="pf-layer" data-nav-scope data-no-screensaver onKeyDown={onKeyDown} onPointerDown={() => counting && setRound((r) => r + 1)}>
      <div ref={boxRef} className="pf-box" role="dialog" aria-modal="true" aria-labelledby="pf-title">
        {editing ? (
          <ProfileEditor profile={editing.profile} defaultColor={nextColor(profiles)} takenAvatars={profiles.map((p) => p.avatar)} onClose={() => setEditing(undefined)} />
        ) : (
          <>
            <h1 id="pf-title" className="pf-title">
              {manage ? 'Administrar perfiles' : '¿Quién está mirando?'}
            </h1>
            <div ref={gridRef} className={`pf-grid${manage ? ' is-managing' : ''}`}>
              {profiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="pf-tile"
                  data-profile={p.id}
                  aria-current={p.id === current ? 'true' : undefined}
                  aria-label={manage ? `Editar ${p.name}` : p.name}
                  onFocus={() => setFocused(p.id)}
                  onClick={() => (manage ? setEditing({ profile: p }) : choose(p.id))}
                >
                  <span className="pf-tile-art">
                    <ProfileAvatar profile={p} size={112} />
                    {counting && p.id === focused && <span key={round} className="pf-ring" style={{ animationDuration: `${AUTO_ENTER_S}s` }} aria-hidden />}
                    {manage && (
                      <span className="pf-edit-badge" aria-hidden>
                        <Theme2Icon name="settings" size={18} />
                      </span>
                    )}
                  </span>
                  <span className="pf-name">{p.name}</span>
                </button>
              ))}
              {profiles.length < MAX_PROFILES && (
                <button type="button" className="pf-tile pf-add" onClick={() => setEditing({})}>
                  <span className="pf-tile-art">
                    <span className="pf-avatar pf-add-icon" aria-hidden>
                      +
                    </span>
                  </span>
                  <span className="pf-name">Agregar perfil</span>
                </button>
              )}
            </div>
            {/* Lo visible cuenta cada segundo y no se lee: el lector anunciaba 10 veces seguidas (a11y-14). */}
            {counting && focusedName && (
              <p className="pf-countdown muted" aria-hidden>
                Entrando como {focusedName} en {left} s
              </p>
            )}
            {counting && (
              <p className="pf-sr" role="status">
                {focusedName ? spokenCountdown(focusedName, left, AUTO_ENTER_S) : ''}
              </p>
            )}
            <div className="pf-actions pf-foot">
              {manage ? (
                <button type="button" className="btn btn-primary" onClick={() => (startManaging ? onClose() : setManage(false))}>
                  Listo
                </button>
              ) : (
                <button type="button" className="btn btn-ghost" onClick={() => setManage(true)}>
                  Administrar perfiles
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
