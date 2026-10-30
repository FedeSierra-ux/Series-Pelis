import { storageIssueStore, useStorageIssue } from '../lib/store'
import { NoticeCard } from './NoticeCard'

/**
 * Aviso cuando el navegador no deja guardar el progreso ni los ajustes (cuota llena, auditoría #5).
 * Antes fallaba con un `console.warn` y el progreso dejaba de guardarse sin que nadie se enterara.
 * Antes de avisar, el store ya probó liberar la caché de catálogos y fichas.
 */
export function StorageWarning() {
  const issue = useStorageIssue()
  if (!issue) return null
  return (
    <NoticeCard text={issue} role="alert">
      <button type="button" className="btn btn-small" onClick={storageIssueStore.dismiss}>
        Entendido
      </button>
    </NoticeCard>
  )
}
