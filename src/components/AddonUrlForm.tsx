import { useEffect, useId, useRef, useState } from 'react'
import { normalizeManifestUrl } from '../lib/addons'
import { addonUrlProblem, errorText } from '../lib/errors'
import { useAddons } from '../lib/hooks'
import { installAddon, setAddonEnabled } from '../lib/store'
import { useTvMode } from '../lib/tv'
import { KeyboardToggle } from './OnScreenKeyboard'

type Msg = { ok: boolean; text: string; enableUrl?: string }

/**
 * Campo para pegar la URL de un addon (Ajustes). Es `type="text"` a propósito: con
 * `type="url"` el navegador frena "addon.com/manifest.json" con su propio cartel antes de que la limpiemos.
 */
export function AddonUrlForm({ disableEmpty }: { disableEmpty?: boolean }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>()
  const tv = useTvMode()
  const errorId = useId()
  const failed = !!msg && !msg.ok

  // Si se quita un addon, el "Listo" o el "Activar" de antes ya no tienen que ver (uso-07).
  const count = useAddons().length
  const lastCount = useRef(count)
  useEffect(() => {
    if (count < lastCount.current) setMsg(undefined)
    lastCount.current = count
  }, [count])

  const change = (value: string) => {
    setUrl(value)
    // El "Listo" del addon anterior no tiene que quedar mientras se escribe otro.
    if (msg) setMsg(undefined)
  }

  const add = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (busy) return
    // Con el campo vacío Enter y "Agregar" no hacían nada (uso-08): ahora dicen qué falta.
    if (!url.trim()) {
      setMsg({ ok: false, text: 'Pegá la URL del manifest del addon (termina en /manifest.json).' })
      return
    }
    setBusy(true)
    setMsg(undefined)
    try {
      const transportUrl = normalizeManifestUrl(url)
      const problem = addonUrlProblem(transportUrl)
      if (problem) {
        setMsg({ ok: false, text: problem })
        return
      }
      const { manifest, status } = await installAddon(transportUrl)
      if (status === 'disabled') {
        setMsg({ ok: true, text: `“${manifest.name}” ya estaba instalado y está apagado, así que sigue apagado.`, enableUrl: transportUrl })
      } else {
        setMsg({ ok: true, text: status === 'updated' ? `“${manifest.name}” ya estaba instalado: se actualizó.` : `Listo: se agregó “${manifest.name}”.` })
      }
      setUrl('')
    } catch (err) {
      setMsg({ ok: false, text: `No se pudo agregar: ${errorText(err)}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form className="inline-form" onSubmit={add} noValidate>
        <input
          type="text"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://…/manifest.json"
          value={url}
          onChange={(e) => change(e.target.value)}
          aria-label="URL del manifest"
          aria-invalid={failed || undefined}
          aria-describedby={failed ? errorId : undefined}
          // Con el control remoto el campo queda fuera de las flechas (tv-11): enfocarlo abría el teclado del
          // sistema de Android TV. Se escribe con el botón "Teclado".
          tabIndex={tv ? -1 : undefined}
          data-nav-skip={tv || undefined}
        />
        <button className="btn btn-primary" disabled={busy || (disableEmpty && !url.trim())}>
          {busy ? 'Agregando…' : 'Agregar'}
        </button>
      </form>
      <KeyboardToggle value={url} onChange={change} onDone={() => add()} doneLabel="Agregar" label="Teclado para la URL del addon" />
      {msg && (
        <p id={failed ? errorId : undefined} className={msg.ok ? 'ok' : 'error-text'} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
          {msg.enableUrl && (
            <>
              {' '}
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setAddonEnabled(msg.enableUrl!, true)
                  setMsg({ ok: true, text: 'Listo: quedó activado.' })
                }}
              >
                Activar
              </button>
            </>
          )}
        </p>
      )}
    </>
  )
}
