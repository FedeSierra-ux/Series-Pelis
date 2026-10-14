import { storageIssueStore, useStorageIssue } from '../lib/store'
import './update-toast.css'

/**
 * Aviso cuando el navegador no deja guardar el progreso ni los ajustes (cuota llena, auditoría #5).
 * Antes fallaba con un `console.warn` y el progreso dejaba de guardarse sin que nadie se enterara.
 * Antes de avisar, el store ya probó liberar la caché de catálogos y fichas.
 */
export function StorageWarning() {
  const issue = useStorageIssue()
  if (!issue) return null
  return (
    <div className="update-toast" role="alert">
      <span className="update-toast-text">{issue}</span>
      <div className="update-toast-actions">
        <button type="button" className="btn btn-small" onClick={storageIssueStore.dismiss}>
          Entendido
        </button>
      </div>
    </div>
  )
}
