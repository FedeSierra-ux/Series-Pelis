import { Suspense, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { LazyJoinPage, LazyLogin } from '../pages/auth/lazyAuth'
import { Spinner } from './Spinner'

const loading = (
  <main className="login" aria-busy="true">
    <Spinner />
  </main>
)

/**
 * Con casas (v0.17), la app pide entrar antes de mostrar nada. Sin la base en el sitio (o en local con
 * Vite) `useAuth()` dice `disabled` y todo sigue como siempre.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const { pathname } = useLocation()
  if (auth.status === 'loading') return loading
  // Sin entrar, solo la pantalla de entrada (o la de la invitación): nada de asistente ni protector encima.
  // Se bajan con carga diferida (v0.36): quien ya entró no las trae.
  if (auth.status === 'out') {
    return <Suspense fallback={loading}>{pathname === '/unirse' ? <LazyJoinPage /> : <LazyLogin needsSetup={auth.needsSetup} />}</Suspense>
  }
  return <>{children}</>
}
