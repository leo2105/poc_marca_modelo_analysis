const COOKIE_NAME = 'len_id_token'
const STORAGE_PREFIX = 'len.cognito.'

export interface CognitoConfig {
  enabled: boolean
  region: string
  userPoolId: string
  clientId: string
  domain: string
  redirectUri: string
  logoutUri: string
}

export interface AuthSession {
  idToken: string
  accessToken: string
  refreshToken: string
  expiresAt: number
  email?: string
}

function readEnv(name: string): string {
  return (import.meta.env[name] as string | undefined)?.trim() ?? ''
}

export function getCognitoConfig(): CognitoConfig {
  const userPoolId = readEnv('VITE_COGNITO_USER_POOL_ID')
  const clientId = readEnv('VITE_COGNITO_CLIENT_ID')
  const domain = readEnv('VITE_COGNITO_DOMAIN').replace(/\/$/, '')
  const region = readEnv('VITE_COGNITO_REGION') || userPoolId.split('_')[0] || 'us-east-1'
  const enabledFlag = readEnv('VITE_COGNITO_ENABLED')
  const enabled =
    enabledFlag === 'true' ||
    (enabledFlag !== 'false' && Boolean(userPoolId && clientId && domain))

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
  return {
    enabled,
    region,
    userPoolId,
    clientId,
    domain,
    redirectUri: `${origin}/auth/callback`,
    logoutUri: `${origin}/`,
  }
}

function base64UrlEncode(bytes: ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(length = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(values, (v) => chars[v % chars.length]).join('')
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncode(digest)
}

function setCookie(token: string, maxAgeSeconds: number) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`
}

export function setCookieFromSession(session: AuthSession) {
  setCookie(session.idToken, Math.max(60, session.expiresAt - Math.floor(Date.now() / 1000)))
}

function clearCookie() {
  document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`
}

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}session`)
    if (!raw) return null
    const session = JSON.parse(raw) as AuthSession
    if (!session.idToken || !session.expiresAt) return null
    if (session.expiresAt * 1000 < Date.now() + 30_000) {
      clearSession()
      return null
    }
    setCookie(session.idToken, Math.max(60, session.expiresAt - Math.floor(Date.now() / 1000)))
    return session
  } catch {
    return null
  }
}

function saveSession(session: AuthSession) {
  localStorage.setItem(`${STORAGE_PREFIX}session`, JSON.stringify(session))
  setCookie(session.idToken, Math.max(60, session.expiresAt - Math.floor(Date.now() / 1000)))
}

export function clearSession() {
  localStorage.removeItem(`${STORAGE_PREFIX}session`)
  sessionStorage.removeItem(`${STORAGE_PREFIX}pkce`)
  clearCookie()
}

export function getIdToken(): string | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}session`)
    if (!raw) return null
    const session = JSON.parse(raw) as AuthSession
    if (!session.idToken || !session.expiresAt) return null
    if (session.expiresAt * 1000 < Date.now() + 30_000) return null
    return session.idToken
  } catch {
    return null
  }
}

export function authRequestHeaders(): HeadersInit {
  const token = getIdToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1]
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
  return JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')))
}

export async function beginLogin(): Promise<void> {
  const config = getCognitoConfig()
  if (!config.enabled) return

  const verifier = randomString(64)
  const challenge = await pkceChallenge(verifier)
  const state = randomString(24)
  sessionStorage.setItem(`${STORAGE_PREFIX}pkce`, JSON.stringify({ verifier, state }))

  const url = new URL(`${config.domain}/oauth2/authorize`)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'openid email profile')
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('code_challenge', challenge)
  window.location.assign(url.toString())
}

export async function completeLoginFromRedirect(): Promise<AuthSession> {
  const config = getCognitoConfig()
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  const error = params.get('error')
  if (error) throw new Error(params.get('error_description') || error)
  if (!code) throw new Error('No authorization code')

  const pkceRaw = sessionStorage.getItem(`${STORAGE_PREFIX}pkce`)
  if (!pkceRaw) throw new Error('PKCE state missing — vuelve a iniciar sesión')
  const pkce = JSON.parse(pkceRaw) as { verifier: string; state: string }
  if (state !== pkce.state) throw new Error('State mismatch')

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: pkce.verifier,
  })

  const response = await fetch(`${config.domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Token exchange failed: ${text}`)
  }

  const tokens = (await response.json()) as {
    id_token: string
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  const payload = decodeJwtPayload(tokens.id_token)
  const session: AuthSession = {
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? '',
    expiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in || 3600),
    email: typeof payload.email === 'string' ? payload.email : undefined,
  }
  sessionStorage.removeItem(`${STORAGE_PREFIX}pkce`)
  saveSession(session)
  return session
}

export function logout(): void {
  const config = getCognitoConfig()
  clearSession()
  if (!config.enabled) {
    window.location.assign('/')
    return
  }
  const url = new URL(`${config.domain}/logout`)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('logout_uri', config.logoutUri)
  window.location.assign(url.toString())
}
