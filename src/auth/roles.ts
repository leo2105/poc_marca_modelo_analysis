import { decodeJwtPayload, getCognitoConfig, getIdToken } from './cognito'

export const ACCOUNT_ROLES = ['administrador', 'mantenedor', 'validador'] as const
export type AccountRole = (typeof ACCOUNT_ROLES)[number]

const RANK: Record<AccountRole, number> = {
  administrador: 3,
  mantenedor: 2,
  validador: 1,
}

/** Cuentas que administran aunque el token todavía no traiga el grupo. */
const BOOTSTRAP_ADMINS = ['lleonv@uni.pe']

function isRole(value: string): value is AccountRole {
  return (ACCOUNT_ROLES as readonly string[]).includes(value)
}

export function normalizeGroups(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw !== 'string') return []
  const trimmed = raw.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      /* claim en texto plano */
    }
  }
  return trimmed.split(/[,\s]+/).filter(Boolean)
}

export function highestRole(groups: unknown): AccountRole {
  let best: AccountRole = 'validador'
  for (const raw of normalizeGroups(groups)) {
    const group = raw === 'invitado' ? 'validador' : raw
    if (isRole(group) && RANK[group] > RANK[best]) best = group
  }
  return best
}

function claims(): Record<string, unknown> | null {
  const token = getIdToken()
  if (!token) return null
  try {
    return decodeJwtPayload(token)
  } catch {
    return null
  }
}

function emailOf(tokenClaims: Record<string, unknown> | null): string {
  const email = tokenClaims?.email
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

export function getAccountRole(): AccountRole {
  if (!getCognitoConfig().enabled) return 'administrador'
  const tokenClaims = claims()
  const fromGroup = highestRole(tokenClaims?.['cognito:groups'])
  if (fromGroup === 'administrador' || BOOTSTRAP_ADMINS.includes(emailOf(tokenClaims))) {
    return 'administrador'
  }
  return fromGroup
}

export function canPublish(): boolean {
  return getAccountRole() === 'administrador'
}

export function sessionOwnerId(): string | null {
  if (!getCognitoConfig().enabled) return null
  const sub = claims()?.sub
  return typeof sub === 'string' && sub ? sub : null
}

export function sessionActorEmail(): string | null {
  if (!getCognitoConfig().enabled) return null
  const email = claims()?.email
  return typeof email === 'string' && email.includes('@') ? email : null
}

export function roleLabel(role: AccountRole): string {
  if (role === 'administrador') return 'Administrador'
  if (role === 'mantenedor') return 'Mantenedor'
  return 'Validador'
}
