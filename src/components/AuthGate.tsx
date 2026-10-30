import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { JoinPage } from '../pages/auth/JoinPage'
import { Login } from '../pages/auth/Login'
import { Spinner } from './Spinner'

/**
 * Con casas (v0.17), la app pide entrar antes de mostrar nada. Sin la base en el sitio (o en local con
 * Vite) `useAuth()` dice `disabled` y todo sigue como siempre.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const { pathname } = useLocation()
  if (auth.status === 'loading') {
    return (
      <main className="login" aria-busy="true">
        <Spinner />
      </main>
    )
  }
  // Sin entrar, solo la pantalla de entrada (o la de la invitación): nada de asistente ni protector encima.
  if (auth.status === 'out') return pathname === '/unirse' ? <JoinPage /> : <Login needsSetup={auth.needsSetup} />
  return <>{children}</>
}
