import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Theme2Icon, type Theme2IconName } from './Theme2Icons'
import './empty-state.css'

interface Action {
  label: string
  /** Ruta a la que lleva el botón (o, en su lugar, `onClick`). */
  to?: string
  onClick?: () => void
}

interface Props {
  icon: Theme2IconName
  title: string
  /** Texto de apoyo (admite enlaces y otros elementos). */
  text?: ReactNode
  action?: Action
}

/**
 * Estado vacío con ícono, título, texto y (opcional) un botón: "Tu lista está vacía → Explorar películas".
 * Usa las variables del tema, así se ve bien en el Tema 1 y en el 2. El botón se enfoca con las flechas.
 */
export function EmptyState({ icon, title, text, action }: Props) {
  return (
    <div className="empty-state" role="status">
      <span className="empty-state-icon" aria-hidden>
        <Theme2Icon name={icon} size={28} />
      </span>
      <h2 className="empty-state-title">{title}</h2>
      {text && <p className="empty-state-text">{text}</p>}
      {action &&
        (action.to ? (
          <Link to={action.to} className="btn btn-primary empty-state-action">
            {action.label}
          </Link>
        ) : (
          <button type="button" className="btn btn-primary empty-state-action" onClick={action.onClick}>
            {action.label}
          </button>
        ))}
    </div>
  )
}
