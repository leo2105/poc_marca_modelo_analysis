import { authRequestHeaders, getCognitoConfig } from '../auth/cognito'
import type { ValidationSessionSnapshot } from '../types'

function readApiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, '') ?? ''
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
      const text = await response.text()
      throw new Error(text || `Error ${response.status} al cargar sesión`)
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
      const text = await response.text()
      throw new Error(text || `Error ${response.status} al guardar`)
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
      const text = await response.text()
      throw new Error(text || `Error ${response.status} al borrar sesión`)
    }
  } catch (err) {
    throw wrapNetworkError(err)
  }
}
