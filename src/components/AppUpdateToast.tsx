import { useEffect, useState, type KeyboardEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { appUpdatePostponed, checkAppUpdate, formatSize, installAppUpdate, postponeAppUpdate, useAppUpdate, type AppUpdateState } from '../lib/appUpdate'
import { isDesktopApp } from '../lib/desktop'
import { isNativeApp } from '../lib/native'
import './update-toast.css'

const BACK_KEYS = new Set(['Escape', 'GoBack', 'BrowserBack', 'Backspace'])

/**
 * "Hay una versión nueva de la app" (v0.21, solo en la app de Android TV). Al abrir se pregunta a GitHub
 * Releases; "Actualizar" baja el APK y abre el instalador de Android, y ahí solo queda tocar "Instalar".
 * Igual que UpdateToast: no roba el foco y Atrás lo cierra. Mientras se mira algo no aparece.
 * v0.30: también en la app de Windows ("Actualizar" baja el instalador, cierra Flix e instala).
 */
export function AppUpdateToast() {
  const desktop = isDesktopApp()
  const native = isNativeApp() || desktop
  const state = useAppUpdate()
  const { pathname } = useLocation()
  const [closed, setClosed] = useState(false)

  useEffect(() => {
    if (native) void checkAppUpdate()
  }, [native])

  if (!native || closed || pathname.startsWith('/watch')) return null
  const version = 'info' in state ? state.info?.latest : undefined
  if (state.step === 'available' && appUpdatePostponed(version)) return null
  const text = desktop && state.step === 'installer' ? 'Flix se cierra para instalar la versión nueva…' : toastText(state)
  if (!text) return null

  const later = () => {
    postponeAppUpdate(version)
    setClosed(true)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!BACK_KEYS.has(e.key) || e.altKey || e.ctrlKey || e.metaKey) return
    e.preventDefault()
    e.stopPropagation()
    if (state.step === 'available') later()
    else setClosed(true)
  }

  return (
    <div className="update-toast" role="status" aria-live="polite" onKeyDown={onKeyDown}>
      <span className="update-toast-text">{text}</span>
      {state.step === 'downloading' && (
        <progress className="update-toast-progress" max={1} value={state.progress} aria-label="Descarga" />
      )}
      <div className="update-toast-actions">
        {(state.step === 'available' || state.step === 'error' || (state.step === 'installer' && !desktop)) && (
          <button type="button" className="btn btn-primary btn-small" onClick={() => void installAppUpdate()}>
            {state.step === 'available' ? 'Actualizar' : state.step === 'installer' ? 'Abrir el instalador' : 'Reintentar'}
          </button>
        )}
        <button type="button" className="btn btn-small" onClick={state.step === 'available' ? later : () => setClosed(true)}>
          {state.step === 'available' ? 'Después' : 'Cerrar'}
        </button>
      </div>
    </div>
  )
}

function toastText(s: AppUpdateState): string | undefined {
  switch (s.step) {
    case 'available': {
      const size = formatSize(s.info.size)
      return `Hay una versión nueva de la app${s.info.latest ? ` (${s.info.latest})` : ''}${size ? ` · ${size}` : ''}`
    }
    case 'downloading':
      return `Bajando la actualización… ${Math.round(s.progress * 100)} %`
    case 'verifying':
      return 'Revisando la actualización…'
    case 'permission':
      return 'Dale permiso a Flix para instalar apps y volvé: la actualización sigue sola'
    case 'installer':
      return 'Tocá “Instalar” para terminar'
    case 'error':
      // Un error de la búsqueda automática no se muestra (sin internet, GitHub caído…): solo en Ajustes.
      return 'info' in s && s.info?.available ? s.message : undefined
    default:
      return undefined
  }
}
