import { useCallback, useEffect, useState } from 'react'
import { invalidate } from '../../lib/cache'
import { useAddons } from '../../lib/hooks'
import { typeLabel } from '../../lib/i18n'
import { officialAddons } from '../../lib/stremioApi'
import { isImportableAddon, toInstalledAddon, type StremioAddonDescriptor } from '../../lib/stremioLibrary'
import { addInstalledAddons, installAddon } from '../../lib/store'
import { errorText } from '../../lib/errors'

const RESOURCE_LABEL: Record<string, string> = {
  catalog: 'catálogos',
  meta: 'info',
  stream: 'streams',
  subtitles: 'subtítulos',
}

/** Algunos logos de la colección vienen por http o ya no existen: mostramos la inicial. */
function AddonLogo({ src, name }: { src?: string; name: string }) {
  const [broken, setBroken] = useState(false)
  const url = src?.replace(/^http:\/\//, 'https://')
  if (!url || broken) return <div className="addon-logo placeholder">{name[0]}</div>
  return <img src={url} alt="" className="addon-logo" loading="lazy" onError={() => setBroken(true)} />
}

/** "Explorar addons": la colección oficial de Stremio, para instalar con un toque. */
export function AddonExplorer() {
  const installed = useAddons()
  const [list, setList] = useState<StremioAddonDescriptor[]>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState<string>()
  const [failed, setFailed] = useState<Record<string, string>>({})

  const load = useCallback((force = false) => {
    setError(undefined)
    setList(undefined)
    ;(force ? invalidate('stremio:official-addons') : Promise.resolve())
      .then(officialAddons)
      .then((all) => setList(all.filter(isImportableAddon)))
      .catch(() => setError('No se pudo traer la colección oficial de Stremio. Puede que no haya conexión o que el servicio no responda.'))
  }, [])

  useEffect(() => load(), [load])

  const isInstalled = (d: StremioAddonDescriptor) =>
    installed.some((a) => a.transportUrl === d.transportUrl || a.manifest.id === d.manifest.id)

  const install = async (d: StremioAddonDescriptor) => {
    setBusy(d.transportUrl)
    setFailed(({ [d.transportUrl]: _old, ...rest }) => rest)
    try {
      // Con el manifest al día; si el addon no responde ahora, usamos el que vino en la colección.
      await installAddon(d.transportUrl).catch(() => addInstalledAddons([toInstalledAddon(d)]))
    } catch (err) {
      setFailed((f) => ({ ...f, [d.transportUrl]: errorText(err) }))
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <div className="addon-explorer">
      <h3>Explorar addons</h3>
      <p className="muted small">Los addons oficiales de Stremio. Para otros, pegá su URL arriba.</p>
      {error && (
        <div className="addon-explorer-error">
          <p className="error-text">{error}</p>
          <button className="btn btn-small" onClick={() => load(true)}>
            Reintentar
          </button>
        </div>
      )}
      {!list && !error && <div className="spinner" aria-label="Cargando addons" />}
      {list && list.length === 0 && <p className="muted">La colección oficial vino vacía.</p>}
      {list && list.length > 0 && (
        <ul className="addon-list">
          {list.map((d) => {
            const m = d.manifest
            const done = isInstalled(d)
            const resources = (m.resources ?? []).map((r) => (typeof r === 'string' ? r : r.name)).filter((r) => RESOURCE_LABEL[r])
            return (
              <li key={d.transportUrl} className="addon-item">
                <AddonLogo src={m.logo} name={m.name} />
                <div className="addon-text">
                  <strong>
                    {m.name} {d.flags?.official && <span className="chip small addon-official">Oficial</span>}
                  </strong>
                  {m.description && <span className="muted small addon-desc">{m.description}</span>}
                  <span className="chips">
                    {(m.types ?? []).map((t) => (
                      <span key={`t-${t}`} className="chip small">
                        {t === 'channel' ? 'Canales' : t === 'other' ? 'Otros' : typeLabel(t)}
                      </span>
                    ))}
                    {resources.map((r) => (
                      <span key={`r-${r}`} className="chip small addon-resource">
                        {RESOURCE_LABEL[r]}
                      </span>
                    ))}
                  </span>
                  {failed[d.transportUrl] && <span className="error-text small">No se pudo instalar: {failed[d.transportUrl]}</span>}
                </div>
                <div className="addon-actions">
                  {done ? (
                    <span className="addon-installed">✓ Instalado</span>
                  ) : (
                    <button className="btn btn-primary" disabled={busy === d.transportUrl} onClick={() => install(d)}>
                      {busy === d.transportUrl ? 'Instalando…' : 'Instalar'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
