import type { ValidationSummary } from '../types'

interface PublishViewProps {
  summary: ValidationSummary
  published: boolean
  onPublish: () => void
  onExportJson: () => void
}

export function PublishView({ summary, published, onPublish, onExportJson }: PublishViewProps) {
  const checks = [
    ['Todos los recortes revisados (sin pendientes)', summary.pending === 0],
    ['Conflictos de baja confianza resueltos', summary.conflict === 0],
    [`${summary.approved + summary.corrected} recortes aprobados listos para consolidar`, true],
  ] as const

  const ready = summary.pending === 0

  return (
    <section className="view active">
      <div className="topbar">
        <h2>Publicación</h2>
        <div className="top-actions">
          <button type="button" className="btn-ghost" onClick={onExportJson}>
            Exportar JSON
          </button>
        </div>
      </div>
      <div className="mvp-banner">
        <span className="admin-tag">GATE</span>
        <span>Al publicar, solo los recortes <b>aprobados y corregidos</b> se consolidan y la reportería se libera al dashboard del cliente.</span>
      </div>
      <div className="card publish-card">
        <div className="card-head"><h3>Verificación previa</h3>{published && <span className="tag">Publicado</span>}</div>
        {checks.map(([label, ok]) => (
          <div className="checkline" key={label}>
            <span className={`ic ${ok ? 'ok' : 'no'}`}>{ok ? '✓' : '!'}</span>
            <span>{label}</span>
          </div>
        ))}
        <button className="btn-dark publish-btn" disabled={!ready || published} onClick={onPublish}>
          PUBLICAR AL DASHBOARD DEL CLIENTE
        </button>
        <p className="publish-hint">
          {published
            ? 'La corrida ya fue publicada. La reportería aprobada está disponible para el cliente.'
            : ready
              ? 'Todo listo. Al publicar, la reportería se libera al dashboard del cliente.'
              : `Quedan ${summary.pending} recortes pendientes de validar antes de poder publicar.`}
        </p>
      </div>
    </section>
  )
}
