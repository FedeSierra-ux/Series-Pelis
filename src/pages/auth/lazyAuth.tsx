import { lazy } from 'react'
// Su CSS va en el CSS inicial (lo comparten Login, la invitación y Ajustes → Casa): así la cascada es la de siempre.
import './auth.css'

// v0.36 (sistema-13): la entrada (Login + código QR) y la invitación no forman parte del camino de Inicio,
// Películas ni la ficha: se bajan recién cuando hacen falta (con un aparato ya vinculado, nunca).
export const LazyLogin = lazy(() => import('./Login').then((m) => ({ default: m.Login })))
export const LazyJoinPage = lazy(() => import('./JoinPage').then((m) => ({ default: m.JoinPage })))
