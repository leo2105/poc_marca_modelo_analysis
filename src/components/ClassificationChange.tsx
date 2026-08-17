import type { ValidationRecord } from '../types'
import { brandColor } from '../utils/catalog'
import { getClassificationChanges } from '../utils/record'

interface ClassificationChangeProps {
  record: ValidationRecord
  displayCatalog?: Record<string, string[]>
  compact?: boolean
}

export function ClassificationChange({ record, displayCatalog, compact = false }: ClassificationChangeProps) {
  const { effective, brandChanged, modelChanged, corrected, pendingModel } = getClassificationChanges(
    record,
    displayCatalog,
  )

  if (compact) {
    return (
      <>
        <div className="capr">
          <span className="bdot" style={{ background: brandColor(effective.brand) }} />
          {(corrected || pendingModel) && brandChanged ? (
            <span className="cap-change">
              <span className="was">{record.detected.brand}</span>
              <span className="chg-arrow">→</span>
              <span className="now">{effective.brand}</span>
            </span>
          ) : (
            effective.brand
          )}
          <span className={`conf${record.confidence < 0.7 ? ' is-low' : ''}`}>{record.confidence.toFixed(2)}</span>
        </div>
        <div className="capm">
          {pendingModel ? (
            <span className="cap-pending-model">Pendiente modelo</span>
          ) : corrected && modelChanged ? (
            <span className="cap-change">
              <span className="was">{record.detected.model}</span>
              <span className="chg-arrow">→</span>
              <span className="now">{effective.model}</span>
            </span>
          ) : (
            effective.model
          )}
        </div>
      </>
    )
  }

  return (
    <>
      <div className="meta-row">
        <span className="k">Marca del motor</span>
        <span className="v">
          <span className="bdot" style={{ background: brandColor(record.detected.brand) }} />
          {record.detected.brand}
        </span>
      </div>
      <div className="meta-row">
        <span className="k">Modelo del motor</span>
        <span className="v">{record.detected.model}</span>
      </div>
      <div className="meta-row">
        <span className="k">Score del motor</span>
        <span className="v mono">
          {record.confidence.toFixed(2)}
          {record.confidence < 0.5 ? '  ⚠' : ''}
        </span>
      </div>
      {pendingModel && (
        <div className="correction-note pending-model-note">
          <div className="correction-title">⏳ Pendiente modelo</div>
          <p>
            La marca fue reasignada a <b>{effective.brand}</b>, pero el modelo{' '}
            <b>{effective.model}</b> no está en el catálogo de esa marca. Elegí un modelo válido para completar la corrección.
          </p>
          {brandChanged && (
            <div className="correction-change">
              <span className="label">Marca</span>
              <span className="from">{record.detected.brand}</span>
              <span className="arrow">→</span>
              <span className="to"><span className="bdot" style={{ background: brandColor(effective.brand) }} />{effective.brand}</span>
            </div>
          )}
        </div>
      )}
      {corrected && (
        <div className="correction-note">
          <div className="correction-title">↺ Clasificación corregida</div>
          {brandChanged && (
            <div className="correction-change">
              <span className="label">Marca</span>
              <span className="from">{record.detected.brand}</span>
              <span className="arrow">→</span>
              <span className="to"><span className="bdot" style={{ background: brandColor(effective.brand) }} />{effective.brand}</span>
            </div>
          )}
          {modelChanged && (
            <div className="correction-change">
              <span className="label">Modelo</span>
              <span className="from">{record.detected.model}</span>
              <span className="arrow">→</span>
              <span className="to">{effective.model}</span>
            </div>
          )}
        </div>
      )}
      {!corrected && !pendingModel && record.state === 'approved' && (
        <div className="meta-row">
          <span className="k">Validación</span>
          <span className="v ok-text">Clasificación del motor confirmada</span>
        </div>
      )}
    </>
  )
}
