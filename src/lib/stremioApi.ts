import { fetchWithTimeout } from './abort'
import { cached } from './cache'
import type { StremioAddonDescriptor, StremioLibraryItem } from './stremioLibrary'

// Cliente mínimo de la API oficial de Stremio (api.strem.io). Responde con CORS abierto,
// así que se usa directo desde el navegador. La contraseña y el authKey nunca se guardan.

export const STREMIO_API = 'https://api.strem.io/api/'

const TIMEOUT = 20000

export class StremioApiError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message)
  }
}

const MESSAGES: Record<number, string> = {
  1: 'La sesión no es válida o venció. Volvé a iniciar sesión.',
  2: 'No hay ninguna cuenta de Stremio con ese email.',
  3: 'La contraseña no es correcta.',
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  let res: Response
  try {
    // Sin `AbortSignal.timeout`: en las TVs viejas (Chromium < 103) no existe y el importador y el
    // explorador de addons nunca andaban (auditoría #9).
    res = await fetchWithTimeout(STREMIO_API + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: TIMEOUT,
    })
  } catch {
    throw new StremioApiError('No se pudo conectar con Stremio. Revisá la conexión e intentá de nuevo.')
  }
  let json: { result?: T; error?: { code?: number; message?: string } }
  try {
    json = await res.json()
  } catch {
    throw new StremioApiError(`Stremio respondió algo inesperado (HTTP ${res.status}).`)
  }
  if (json.error) {
    const code = json.error.code
    throw new StremioApiError((code !== undefined && MESSAGES[code]) || json.error.message || 'Stremio devolvió un error.', code)
  }
  if (!res.ok || json.result === undefined) throw new StremioApiError(`Stremio respondió con un error (HTTP ${res.status}).`)
  return json.result
}

/** Devuelve el authKey de la sesión. */
export async function stremioLogin(email: string, password: string): Promise<string> {
  const result = await call<{ authKey?: string }>('login', { type: 'Login', email, password, facebook: false })
  if (!result.authKey) throw new StremioApiError('Stremio no devolvió una sesión.')
  return result.authKey
}

/** Cierra la sesión que se abrió solo para importar (si falla no importa). */
export function stremioLogout(authKey: string) {
  call('logout', { type: 'Logout', authKey }).catch(() => {})
}

/** Addons instalados en la cuenta, o la colección oficial si `authKey` es null. */
export async function stremioAddonCollection(authKey: string | null): Promise<StremioAddonDescriptor[]> {
  const result = await call<{ addons?: StremioAddonDescriptor[] }>('addonCollectionGet', { type: 'AddonCollectionGet', authKey, update: true })
  return Array.isArray(result.addons) ? result.addons : []
}

export async function stremioLibrary(authKey: string): Promise<StremioLibraryItem[]> {
  const result = await call<StremioLibraryItem[]>('datastoreGet', { authKey, collection: 'libraryItem', ids: [], all: true })
  return Array.isArray(result) ? result : []
}

const DAY = 24 * 60 * 60 * 1000

/** Colección oficial de addons de Stremio, cacheada un día (y la vieja si no hay red). */
export function officialAddons(): Promise<StremioAddonDescriptor[]> {
  return cached('stremio:official-addons', () => stremioAddonCollection(null), DAY)
}
