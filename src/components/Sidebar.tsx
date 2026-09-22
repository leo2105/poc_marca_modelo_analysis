import type { ValidationView } from '../types'
import type { RaceDefinition } from '../data/races'
import { useAuth } from '../auth/AuthGate'
import { getCognitoConfig } from '../auth/cognito'
import { RaceSelect } from './RaceSelect'

interface SidebarProps {
  activeView: ValidationView
  pending: number
  race: RaceDefinition
  races: RaceDefinition[]
  raceLoading?: boolean
  onSelectEvent: (eventId: string) => void
  onNavigate: (view: ValidationView) => void
}

export function Sidebar({
  activeView,
  pending,
  race,
  races,
  raceLoading = false,
  onSelectEvent,
  onNavigate,
}: SidebarProps) {
  const auth = useAuth()
  const cognitoEnabled = getCognitoConfig().enabled
  const email = auth?.session.email

  return (
    <aside className="sidebar">
      <div className="logo">
        <img src="/len-logo.png" alt="LEN" className="logo-img" />
        <span>CONSOLA ADMIN · VALIDACIÓN</span>
      </div>
      <div className="nav-label">CARRERA</div>
      <div className="race-select-wrap">
        <RaceSelect
          id="sidebar-race-select"
          races={races}
          value={race.eventId}
          disabled={raceLoading}
          onChange={onSelectEvent}
        />
      </div>
      <div className="nav-label">CORRIDA</div>
      <nav className="nav">
        <button className={activeView === 'panel' ? 'active' : ''} onClick={() => onNavigate('panel')}>
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" /><rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" /></svg>
          Panel de corrida
        </button>
        <button className={activeView === 'mosaic' ? 'active' : ''} onClick={() => onNavigate('mosaic')}>
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
          Validación · mosaico {pending > 0 && <b>{pending}</b>}
        </button>
        <button className={activeView === 'detail' ? 'active' : ''} onClick={() => onNavigate('detail')}>
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          Validación · detalle
        </button>
        <button className={activeView === 'publish' ? 'active' : ''} onClick={() => onNavigate('publish')}>
          <svg viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
          Publicación
        </button>
      </nav>
      <div className="side-foot">
        <div className="who">
          <div className="avatar">{email ? email.slice(0, 2).toUpperCase() : 'OP'}</div>
          <div>
            <b>{email ?? 'LEN Ops'}</b>
            <small>{cognitoEnabled ? 'Sesión Cognito' : 'Cuenta administrativa'}</small>
          </div>
        </div>
        {cognitoEnabled && auth && (
          <button type="button" className="logout-btn" onClick={() => auth.logout()}>
            Cerrar sesión
          </button>
        )}
      </div>
    </aside>
  )
}
