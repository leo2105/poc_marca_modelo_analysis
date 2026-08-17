import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ValidationRecord } from '../types'
import { useSpriteAnalysis } from '../hooks/useSpriteAnalysis'
import { brandColor } from '../utils/catalog'
import { getClassificationChanges } from '../utils/record'
import { getSpriteSource, spriteCropStyle } from '../utils/sprites'

interface DetailViewProps {
  records: ValidationRecord[]
  index: number
  displayCatalog: Record<string, string[]>
  onIndexChange: (index: number) => void
  onBackToMosaic: () => void
  onApprove: (id: string) => void
  onDiscard: (id: string) => void
  onCorrectBrand: (id: string, brand: string) => void
  onCorrectModel: (id: string, brand: string, model: string) => void
}

const STATE_LABEL: Record<ValidationRecord['state'], string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  corrected: 'Corregido',
  rejected: 'Descartado',
  discarded: 'Descartado',
}

export function DetailView({
  records,
  index,
  displayCatalog,
  onIndexChange,
  onBackToMosaic,
  onApprove,
  onDiscard,
  onCorrectBrand,
  onCorrectModel,
}: DetailViewProps) {
  const record = records[index]
  const [perspectiveIndex, setPerspectiveIndex] = useState(0)
  const [brandMenuOpen, setBrandMenuOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [newBrand, setNewBrand] = useState('')
  const [newModel, setNewModel] = useState('')

  useEffect(() => {
    setPerspectiveIndex(0)
  }, [index, record?.personId])

  if (!record) {
    return <section className="view active"><div className="empty-state">No hay recortes para revisar.</div></section>
  }

  const move = (step: number) => onIndexChange((index + step + records.length) % records.length)
  const spriteSource = getSpriteSource(record)
  const { analysis, loading, error } = useSpriteAnalysis(spriteSource)
  const perspectiveCount = analysis?.activeSlots.length ?? 0
  const framesUsed = loading ? '—' : Math.max(perspectiveCount, 1)
  const activePerspective = perspectiveCount > 0 ? Math.min(perspectiveIndex, perspectiveCount - 1) : 0
  const { effective, brandChanged, modelChanged, corrected, pendingModel } = getClassificationChanges(record, displayCatalog)
  const stateLabel = pendingModel ? 'Pendiente modelo' : STATE_LABEL[record.state]

  return (
    <section className="view active">
      <div className="topbar">
        <div className="topbar-left">
          <button type="button" className="btn-ghost back-to-mosaic" onClick={onBackToMosaic}>
            <ArrowLeft size={16} strokeWidth={2} aria-hidden />
            Volver al mosaico
          </button>
          <h2>Validación · detalle</h2>
        </div>
        <div className="top-actions"><span>Recorte {index + 1} de {records.length}</span></div>
      </div>

      <div className="detail-wrap">
        <div className="detail-visual">
          <div className="detail-img">
            <button type="button" className="navb prev" onClick={() => move(-1)}>‹</button>
            <div className="detail-img-frame">
              {loading ? (
                <div className="sprite-crop loading detail-sprite" aria-label="Cargando perspectivas" />
              ) : analysis && analysis.activeSlots.length > 0 ? (
                <div
                  className="sprite-crop detail-sprite"
                  style={spriteCropStyle(analysis, analysis.activeSlots[activePerspective])}
                  role="img"
                  aria-label={`Perspectiva ${activePerspective + 1} de ${analysis.activeSlots.length}`}
                />
              ) : (
                <img src={spriteSource} alt="" className="detail-sprite-fallback" title={error ?? undefined} />
              )}
            </div>
            <button type="button" className="navb next" onClick={() => move(1)}>›</button>
          </div>
          {!loading && perspectiveCount > 1 && (
            <div className="perspective-dots" role="tablist" aria-label="Perspectivas de la zapatilla">
              {Array.from({ length: perspectiveCount }, (_, dotIndex) => (
                <button
                  key={dotIndex}
                  type="button"
                  role="tab"
                  aria-selected={dotIndex === activePerspective}
                  aria-label={`Perspectiva ${dotIndex + 1}`}
                  className={`perspective-dot ${dotIndex === activePerspective ? 'active' : ''}`}
                  onClick={() => setPerspectiveIndex(dotIndex)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h3><span className="bdot" style={{ background: brandColor(effective.brand) }} />{effective.brand}</h3>
            <span className="mono">{record.personId}</span>
          </div>

          <div className="meta-row"><span className="k">Corredor</span><span className="v mono">{record.personId}</span></div>
          <div className="meta-row">
            <span className="k">Marca de la zapatilla</span>
            <span className="v">
              {brandChanged ? (
                <span className="cap-change inline-change">
                  <span className="bdot" style={{ background: brandColor(record.detected.brand) }} />
                  <span className="was">{record.detected.brand}</span>
                  <span className="chg-arrow">→</span>
                  <span className="bdot" style={{ background: brandColor(effective.brand) }} />
                  <span className="now">{effective.brand}</span>
                </span>
              ) : (
                <>
                  <span className="bdot" style={{ background: brandColor(effective.brand) }} />
                  {effective.brand}
                </>
              )}
            </span>
          </div>
          <div className="meta-row">
            <span className="k">Modelo de la zapatilla</span>
            <span className="v">
              {modelChanged ? (
                <span className="cap-change inline-change">
                  <span className="was">{record.detected.model}</span>
                  <span className="chg-arrow">→</span>
                  <span className="now">{effective.model}</span>
                </span>
              ) : (
                effective.model
              )}
            </span>
          </div>
          <div className="meta-row">
            <span className="k">Score de la zapatilla</span>
            <span className="v mono">
              {record.confidence.toFixed(2)}
              {record.confidence < 0.7 ? '  ⚠' : ''}
            </span>
          </div>
          <div className="meta-row">
            <span className="k">Validación</span>
            <span className={`v${pendingModel ? ' tag-pending-model' : ''}`}>{stateLabel}</span>
          </div>
          <div className="meta-row"><span className="k">Frames usados</span><span className="v mono">{framesUsed}</span></div>
          <div className="meta-row"><span className="k">Cámara · Timestamp</span><span className="v mono">{record.camera} · {record.capturedAt}</span></div>

          {pendingModel && (
            <div className="correction-note pending-model-note">
              <div className="correction-title">⏳ Pendiente modelo</div>
              <p>
                La marca fue reasignada a <b>{effective.brand}</b>, pero el modelo{' '}
                <b>{effective.model}</b> no está en el catálogo de esa marca. Elegí un modelo válido para completar la corrección.
              </p>
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

          <div className="dactions">
            <button className="vbtn ok" disabled={pendingModel} onClick={() => { onApprove(record.personId); move(1) }}>✓ Aprobar clasificación <kbd>A</kbd></button>
            <div className={`menu full ${brandMenuOpen ? 'open' : ''}`}>
              <button className="vbtn dark full" onClick={() => { setBrandMenuOpen((v) => !v); setModelMenuOpen(false) }}>↺ Corregir marca ▾</button>
              <div className="menu-pop left">
                <div className="menu-lab">MARCAS</div>
                {Object.keys(displayCatalog).map((brand) => (
                  <button key={brand} onClick={() => { onCorrectBrand(record.personId, brand); setBrandMenuOpen(false) }}>
                    <span className="bdot" style={{ background: brandColor(brand) }} />{brand}
                  </button>
                ))}
                <div className="menu-new">
                  <input
                    type="text"
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Nueva marca…"
                  />
                  <button type="button" className="add" onClick={(e) => { e.stopPropagation(); if (newBrand.trim()) { onCorrectBrand(record.personId, newBrand.trim()); setNewBrand(''); setBrandMenuOpen(false) } }}>＋</button>
                </div>
              </div>
            </div>
            <div className={`menu full ${modelMenuOpen ? 'open' : ''}`}>
              <button className="vbtn full" onClick={() => { setModelMenuOpen((v) => !v); setBrandMenuOpen(false) }}>↺ Corregir modelo ▾</button>
              <div className="menu-pop left">
                <div className="menu-lab">MODELOS · {effective.brand}</div>
                {(displayCatalog[effective.brand] ?? []).map((model) => (
                  <button key={model} onClick={() => { onCorrectModel(record.personId, effective.brand, model); setModelMenuOpen(false) }}>
                    {model}
                  </button>
                ))}
                <div className="menu-new">
                  <input
                    type="text"
                    value={newModel}
                    onChange={(e) => setNewModel(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Nuevo modelo…"
                  />
                  <button type="button" className="add" onClick={(e) => { e.stopPropagation(); if (newModel.trim()) { onCorrectModel(record.personId, effective.brand, newModel.trim()); setNewModel(''); setModelMenuOpen(false) } }}>＋</button>
                </div>
              </div>
            </div>
            <div className="detail-split">
              <button className="vbtn" onClick={() => { onDiscard(record.personId); move(1) }}>⌀ Descartar <kbd>D</kbd></button>
            </div>
          </div>

          <div className="note">Atajos: <b>A</b> aprobar · <b>D</b> descartar · <b>← →</b> navegar. Cada decisión queda registrada en el log de auditoría.</div>
        </div>
      </div>
    </section>
  )
}
