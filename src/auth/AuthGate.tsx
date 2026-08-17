import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  beginLogin,
  clearSession,
  completeLoginFromRedirect,
  getCognitoConfig,
  loadSession,
  logout as cognitoLogout,
  setCookieFromSession,
  type AuthSession,
} from './cognito'

interface AuthContextValue {
  session: AuthSession
  logout: () => void
}

const AuthSessionContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue | null {
  return useContext(AuthSessionContext)
}

interface AuthGateProps {
  children: ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const config = getCognitoConfig()
  const [session, setSession] = useState<AuthSession | null>(() => (config.enabled ? loadSession() : null))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isCallback = typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/callback')

  useEffect(() => {
    if (!config.enabled) return
    if (!isCallback) return

    let cancelled = false
    setBusy(true)
    completeLoginFromRedirect()
      .then((next) => {
        if (cancelled) return
        setSession(next)
        window.history.replaceState({}, '', '/')
      })
      .catch((err: Error) => {
        if (cancelled) return
        clearSession()
        setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })

    return () => {
      cancelled = true
    }
  }, [config.enabled, isCallback])

  useEffect(() => {
    if (!config.enabled || !session) return
    setCookieFromSession(session)
  }, [config.enabled, session])

  if (!config.enabled) {
    return <>{children}</>
  }

  if (busy || (isCallback && !session && !error)) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <img src="/len-logo.png" alt="LEN" className="auth-logo" />
          <h1>Validando sesión…</h1>
          <p>Espera un momento.</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <img src="/len-logo.png" alt="LEN" className="auth-logo" />
          <h1>Consola de validación</h1>
          <p>Acceso restringido al equipo. Inicia sesión con tu cuenta Cognito.</p>
          {error && <p className="auth-error">{error}</p>}
          <button type="button" className="btn-dark" onClick={() => void beginLogin()}>
            Iniciar sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <AuthSessionContext.Provider value={{ session, logout: cognitoLogout }}>
      {children}
    </AuthSessionContext.Provider>
  )
}
