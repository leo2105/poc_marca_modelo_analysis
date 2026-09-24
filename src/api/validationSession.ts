import { authRequestHeaders, getCognitoConfig } from '../auth/cognito'
import type { ValidationSessionSnapshot } from '../types'

function readApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, '') ?? ''
}

export async function readApiError(response: Response, fallback: string): Promise<string> {
  const text = await response.text()
  try {
    const parsed = JSON.parse(text) as { error?: string }
    if (parsed.error) return parsed.error
  } catch {
    /* cuerpo que no es JSON */
  }
  return text || fallback
}

function wrapNetworkError(err: unknown): Error {
  if (err instanceof TypeError) {
    return new Error('No se pudo conectar con el servidor. Revisa la red o vuelve a intentar.')
  }
  return err instanceof Error ? err : new Error('Error de red')
}

export function isRemoteSessionEnabled(): boolean {
  const config = getCognitoConfig()
  return config.enabled && Boolean(readApiBaseUrl())
}

export async function fetchValidationSession(eventId: string): Promise<ValidationSessionSnapshot | null> {
  const base = readApiBaseUrl()
  if (!base) return null

  try {
    const response = await fetch(`${base}/sessions/${encodeURIComponent(eventId)}`, {
      cache: 'no-store',
      headers: {
        ...authRequestHeaders(),
        Accept: 'application/json',
      },
    })

    if (response.status === 404 || response.status === 304) return null
    if (!response.ok) {
      throw new Error(await readApiError(response, `Error ${response.status} al cargar sesión`))
    }

    return (await response.json()) as ValidationSessionSnapshot
  } catch (err) {
    throw wrapNetworkError(err)
  }
}

export async function putValidationSession(eventId: string, snapshot: ValidationSessionSnapshot): Promise<void> {
  const base = readApiBaseUrl()
  if (!base) throw new Error('API no configurada')

  try {
    const response = await fetch(`${base}/sessions/${encodeURIComponent(eventId)}`, {
      method: 'PUT',
      cache: 'no-store',
      headers: {
        ...authRequestHeaders(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(snapshot),
    })

    if (!response.ok) {
      throw new Error(await readApiError(response, `Error ${response.status} al guardar`))
    }
  } catch (err) {
    throw wrapNetworkError(err)
  }
}

export async function deleteValidationSession(eventId: string): Promise<void> {
  const base = readApiBaseUrl()
  if (!base) return

  try {
    const response = await fetch(`${base}/sessions/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      cache: 'no-store',
      headers: authRequestHeaders(),
    })

    if (!response.ok && response.status !== 404) {
      throw new Error(await readApiError(response, `Error ${response.status} al borrar sesión`))
    }
  } catch (err) {
    throw wrapNetworkError(err)
  }
}

export async function fetchCanonicalPublished(eventId: string): Promise<boolean> {
  const base = readApiBaseUrl()
  if (!base) return false

  try {
    const response = await fetch(`${base}/sessions/${encodeURIComponent(eventId)}/canonical`, {
      cache: 'no-store',
      headers: {
        ...authRequestHeaders(),
        Accept: 'application/json',
      },
    })
    if (response.status === 404) return false
    if (!response.ok) {
      throw new Error(await readApiError(response, `Error ${response.status} al consultar la publicación`))
    }
    const snapshot = (await response.json()) as ValidationSessionSnapshot
    return snapshot.published === true
  } catch (err) {
    throw wrapNetworkError(err)
  }
}
