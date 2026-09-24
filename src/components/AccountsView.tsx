import { useCallback, useEffect, useState } from 'react'
import { inviteAccountUser, listAccountUsers, updateAccountUser, type AccountUser } from '../api/adminUsers'
import { useAuth } from '../auth/AuthGate'
import { ACCOUNT_ROLES, roleLabel, type AccountRole } from '../auth/roles'

const ROLE_PERMISSIONS: Record<AccountRole, { edit: true; publish: boolean; accounts: boolean }> = {
  administrador: { edit: true, publish: true, accounts: true },
  mantenedor: { edit: true, publish: false, accounts: false },
  validador: { edit: true, publish: false, accounts: false },
}

function statusLabel(user: AccountUser) {
  if (!user.enabled) return 'Desactivada'
  if (user.status === 'FORCE_CHANGE_PASSWORD') return 'Debe cambiar la contraseña'
  if (user.status === 'RESET_REQUIRED') return 'Debe restablecer'
  if (user.status === 'CONFIRMED') return 'Activa'
  return user.status
}

export function AccountsView() {
  const auth = useAuth()
  const selfEmail = auth?.session.email?.toLowerCase() ?? ''
  const [users, setUsers] = useState<AccountUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AccountRole>('validador')
  const [inviting, setInviting] = useState(false)
  const [pendingUser, setPendingUser] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listAccountUsers()
      setUsers(result.users)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las cuentas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const invite = async () => {
    const nextEmail = email.trim().toLowerCase()
    if (!nextEmail) return
    setInviting(true)
    setError(null)
    setNotice(null)
    try {
      await inviteAccountUser(nextEmail, role)
      setEmail('')
      setRole('validador')
      setNotice(`Invitación enviada a ${nextEmail}.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo invitar')
    } finally {
      setInviting(false)
    }
  }

  const changeRole = async (user: AccountUser, next: AccountRole) => {
    if (next === user.role) return
    setPendingUser(user.username)
    setError(null)
    setNotice(null)
    try {
      await updateAccountUser(user.username, { role: next })
      setUsers((current) => current.map((item) => (item.username === user.username ? { ...item, role: next } : item)))
      setNotice(`${user.email} ahora es ${roleLabel(next).toLowerCase()}. Debe volver a entrar para ver el cambio.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el nivel')
    } finally {
      setPendingUser(null)
    }
  }

  const toggleEnabled = async (user: AccountUser) => {
    setPendingUser(user.username)
    setError(null)
    setNotice(null)
    try {
      await updateAccountUser(user.username, { enabled: !user.enabled })
      setUsers((current) =>
        current.map((item) => (item.username === user.username ? { ...item, enabled: !item.enabled } : item)),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar la cuenta')
    } finally {
      setPendingUser(null)
    }
  }

  return (
    <section className="view active">
      <div className="topbar">
        <h2>Permisos y roles</h2>
      </div>
      <div className="mvp-banner">
        <span className="admin-tag">ADMIN</span>
        <span>Cambia el rol de cada cuenta y, con él, si puede publicar al dashboard y administrar usuarios. Todas editan su propio espacio.</span>
      </div>
      {error && <p className="accounts-msg error">{error}</p>}
      {notice && <p className="accounts-msg ok">{notice}</p>}
      <div className="card">
        <div className="card-head"><h3>Nueva cuenta</h3></div>
        <form
          className="accounts-form"
          onSubmit={(event) => {
            event.preventDefault()
            void invite()
          }}
        >
          <label>
            Correo
            <input
              type="email"
              required
              value={email}
              placeholder="ana@empresa.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Rol
            <select value={role} onChange={(event) => setRole(event.target.value as AccountRole)}>
              {ACCOUNT_ROLES.map((item) => (
                <option key={item} value={item}>{roleLabel(item)}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-dark" disabled={inviting}>
            {inviting ? 'Enviando…' : 'Invitar'}
          </button>
        </form>
        <p className="publish-hint">Cognito envía una contraseña temporal. En el primer ingreso hay que cambiarla.</p>
      </div>
      <div className="card accounts-list">
        <div className="card-head"><h3>Personas con acceso</h3></div>
        {loading ? (
          <p className="publish-hint">Cargando cuentas…</p>
        ) : users.length === 0 ? (
          <p className="publish-hint">Todavía no hay cuentas.</p>
        ) : (
          <table className="accounts-table">
            <thead>
              <tr>
                <th>Correo</th>
                <th>Rol</th>
                <th>Permisos</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.email.toLowerCase() === selfEmail
                const busy = pendingUser === user.username
                return (
                  <tr key={user.username}>
                    <td>{user.email}</td>
                    <td>
                      <select
                        aria-label={`Rol de ${user.email}`}
                        value={user.role}
                        disabled={busy || isSelf}
                        onChange={(event) => void changeRole(user, event.target.value as AccountRole)}
                      >
                        {ACCOUNT_ROLES.map((item) => (
                          <option key={item} value={item}>{roleLabel(item)}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="perm-list">
                        <label>
                          <input type="checkbox" checked disabled />
                          Editar su espacio
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={ROLE_PERMISSIONS[user.role].publish}
                            disabled={busy || isSelf}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? 'administrador'
                                : user.role === 'administrador'
                                  ? 'mantenedor'
                                  : user.role
                              void changeRole(user, next)
                            }}
                          />
                          Publicar al dashboard
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={ROLE_PERMISSIONS[user.role].accounts}
                            disabled={busy || isSelf}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? 'administrador'
                                : user.role === 'administrador'
                                  ? 'mantenedor'
                                  : user.role
                              void changeRole(user, next)
                            }}
                          />
                          Administrar cuentas
                        </label>
                      </div>
                    </td>
                    <td>{statusLabel(user)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={busy || isSelf}
                        onClick={() => void toggleEnabled(user)}
                      >
                        {user.enabled ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
