import { authRequestHeaders } from '../auth/cognito'
import type { AccountRole } from '../auth/roles'
import { readApiError } from './validationSession'

export interface AccountUser {
  username: string
  email: string
  role: AccountRole
  enabled: boolean
  status: string
}

function apiBase(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, '') ?? ''
  if (!base) throw new Error('API no configurada')
  return base
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiBase()}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        ...authRequestHeaders(),
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('No se pudo conectar con el servidor. Revisa la red o vuelve a intentar.')
    }
    throw err
  }
  if (!response.ok) {
    throw new Error(await readApiError(response, `Error ${response.status}`))
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function listAccountUsers(): Promise<{ users: AccountUser[] }> {
  return request('/admin/users')
}

export function inviteAccountUser(email: string, role: AccountRole): Promise<{ ok: boolean; email: string; role: AccountRole }> {
  return request('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  })
}

export function updateAccountUser(
  username: string,
  patch: { role?: AccountRole; enabled?: boolean },
): Promise<{ ok: boolean }> {
  return request(`/admin/users/${encodeURIComponent(username)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}
