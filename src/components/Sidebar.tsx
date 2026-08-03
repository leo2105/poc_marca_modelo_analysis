import type { ValidationView } from '../types'

interface SidebarProps {
  activeView: ValidationView
  pending: number
  onNavigate: (view: ValidationView) => void
}

export function Sidebar({ activeView, pending, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="logo">
        <img src="/len-logo.png" alt="LEN" className="logo-img" />
        <span>CONSOLA ADMIN · VALIDACIÓN</span>
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
          <div className="avatar">OP</div>
          <div><b>LEN Ops</b><small>Cuenta administrativa</small></div>
        </div>
        <div className="ds">Corrida <span className="mono">nb15k-2026</span><br />Motor <span className="mono">marca v1</span></div>
      </div>
    </aside>
  )
}
