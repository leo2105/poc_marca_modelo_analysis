import { useEffect, useState } from 'react'
import { fetchCanonicalPublished, isRemoteSessionEnabled } from '../api/validationSession'
import type { ValidationSummary } from '../types'

interface PublishViewProps {
  summary: ValidationSummary
  published: boolean
  canPublish: boolean
  eventId: string
  onPublish: (value: boolean) => Promise<void>
  onExportJson: () => void
}

export function PublishView({ summary, published, canPublish, eventId, onPublish, onExportJson }: PublishViewProps) {
  const checks = [
    ['Todos los recortes revisados (sin pendientes)', summary.pending === 0],
    ['Conflictos de baja confianza resueltos', summary.conflict === 0],
    [`${summary.approved + summary.corrected} recortes aprobados listos para consolidar`, true],
  ] as const

  const ready = summary.pending === 0
  const [busy, setBusy] = useState(false)
  const [canonicalPublished, setCanonicalPublished] = useState<boolean | null>(null)

  useEffect(() => {
    if (!isRemoteSessionEnabled()) {
      setCanonicalPublished(null)
      return
    }
    let cancelled = false
    void fetchCanonicalPublished(eventId)
      .then((value) => {
        if (!cancelled) setCanonicalPublished(value)
      })
      .catch(() => {
        if (!cancelled) setCanonicalPublished(null)
      })
    return () => {
      cancelled = true
    }
  }, [eventId, published])

  const run = async (value: boolean) => {
    setBusy(true)
    try {
      await onPublish(value)
    } finally {
      setBusy(false)
    }
  }

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
        {canPublish && !published && (
          <button className="btn-dark publish-btn" disabled={!ready || busy} onClick={() => void run(true)}>
            {busy ? 'PUBLICANDO…' : 'PUBLICAR AL DASHBOARD DEL CLIENTE'}
          </button>
        )}
        {canPublish && published && (
          <button className="btn-ghost publish-btn" disabled={busy} onClick={() => void run(false)}>
            {busy ? 'ACTUALIZANDO…' : 'DESPUBLICAR DEL DASHBOARD'}
          </button>
        )}
        <p className="publish-hint">
          {!canPublish
            ? 'Puedes revisar y guardar tu espacio. Solo un administrador publica esta versión al dashboard.'
            : published
              ? 'Tu espacio está publicado. Los cambios que guardes actualizan la reportería del cliente.'
              : ready
                ? 'Todo listo. Al publicar, tu espacio se libera al dashboard del cliente.'
                : `Quedan ${summary.pending} recortes pendientes de validar antes de poder publicar.`}
          {canonicalPublished !== null && (
            <> {canonicalPublished ? 'El dashboard ya muestra una corrida publicada.' : 'El dashboard todavía no tiene una corrida publicada.'}</>
          )}
        </p>
      </div>
    </section>
  )
}
