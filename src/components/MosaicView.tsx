import { useEffect, useMemo, useRef, useState } from 'react'
import { DEMO_TOTAL } from '../data/demoData'
import type { ValidationRecord } from '../types'
import { ClassificationChange } from './ClassificationChange'
import { SpriteCrop } from './SpriteCrop'
import { brandColor } from '../utils/catalog'
import { getEffectiveClassification, getMosaicDisplayState, isPendingLike, isPendingModel, isResolved } from '../utils/record'

interface MosaicViewProps {
  records: ValidationRecord[]
  displayCatalog: Record<string, string[]>
  onApprove: (ids: string[]) => void
  onReject: (ids: string[]) => void
  onDiscard: (ids: string[]) => void
  onCorrectBrand: (ids: string[], brand: string) => void
  onCorrectModel: (ids: string[], brand: string, model: string) => void
  onOpenDetail: (index: number) => void
}

const STATUS_FILTERS = [
  ['all', 'Todos'],
  ['pending', 'Pendientes'],
  ['approved', 'Resueltos'],
] as const
const CONF_FILTERS = [
  ['all', 'Todas'],
  ['0-50', '<50%'],
  ['50-70', '50–70%'],
  ['70-85', '70–85%'],
  ['85-100', '85–100%'],
] as const

export function MosaicView({
  records,
  displayCatalog,
  onApprove,
  onReject,
  onDiscard,
  onCorrectBrand,
  onCorrectModel,
  onOpenDetail,
}: MosaicViewProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [brandFilter, setBrandFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved'>('all')
  const [confFilter, setConfFilter] = useState('all')
  const [brandMenuOpen, setBrandMenuOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [newBrand, setNewBrand] = useState('')
  const [newModel, setNewModel] = useState('')
  const brandTrackRef = useRef<HTMLDivElement>(null)
  const [brandScroll, setBrandScroll] = useState({ left: false, right: false })

  const brandFilters = useMemo(
    () => ['all', ...Object.keys(displayCatalog).sort((a, b) => a.localeCompare(b, 'es'))],
    [displayCatalog],
  )

  const updateBrandScroll = () => {
    const track = brandTrackRef.current
    if (!track) return
    setBrandScroll({
      left: track.scrollLeft > 4,
      right: track.scrollLeft + track.clientWidth < track.scrollWidth - 4,
    })
  }

  useEffect(() => {
    const frame = requestAnimationFrame(updateBrandScroll)
    window.addEventListener('resize', updateBrandScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateBrandScroll)
    }
  }, [brandFilters])

  useEffect(() => {
    const track = brandTrackRef.current
    if (!track) return
    const active = track.querySelector<HTMLButtonElement>(`[data-brand="${brandFilter}"]`)
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [brandFilter, brandFilters])

  const scrollBrands = (direction: -1 | 1) => {
    brandTrackRef.current?.scrollBy({ left: direction * 260, behavior: 'smooth' })
  }

  const visible = useMemo(() => records.filter((record) => {
    if (brandFilter !== 'all' && getEffectiveClassification(record).brand !== brandFilter) return false
    if (statusFilter === 'pending' && !isPendingLike(record, displayCatalog)) return false
    if (statusFilter === 'approved' && !isResolved(record, displayCatalog)) return false
    if (confFilter !== 'all') {
      const pct = record.confidence * 100
      const [min, max] = confFilter.split('-').map(Number)
      if (!(pct >= min && pct < (max === 100 ? 100.01 : max))) return false
    }
    return true
  }), [brandFilter, confFilter, displayCatalog, records, statusFilter])

  const selectedBrand = useMemo(() => {
    const brands = new Set<string>()
    records.forEach((record) => {
      if (selected.has(record.personId)) brands.add(getEffectiveClassification(record).brand)
    })
    return brands.size === 1 ? [...brands][0] : null
  }, [records, selected])

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedIds = [...selected]

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.matches('input, select, textarea')) return
      if (!selected.size) return
      const ids = [...selected]
      const key = event.key.toLowerCase()
      if (key === 'a') { onApprove(ids); setSelected(new Set()) }
      if (key === 'r') { onReject(ids); setSelected(new Set()) }
      if (event.key === 'Escape') setSelected(new Set())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onApprove, onReject, selected])

  return (
    <section className="view active">
      <div className="topbar">
        <h2>Validación · mosaico</h2>
        <div className="top-actions">
          <button className="btn-ghost" onClick={() => visible.filter((r) => r.state === 'pending' && !isPendingModel(r, displayCatalog)).forEach((r) => onApprove([r.personId]))}>
            Aprobar visibles
          </button>
        </div>
      </div>

      <div className="filters">
        <div className="brand-filter-row">
          <span className="lab">MARCA</span>
          <div className="brand-filter-nav">
            <button
              type="button"
              className="brand-scroll-btn"
              aria-label="Marcas anteriores"
              disabled={!brandScroll.left}
              onClick={() => scrollBrands(-1)}
            >
              ‹
            </button>
            <div className="brand-filter-track" ref={brandTrackRef} onScroll={updateBrandScroll}>
              {brandFilters.map((brand) => (
                <button
                  key={brand}
                  type="button"
                  data-brand={brand}
                  className={`chip ${brandFilter === brand ? 'on' : ''}`}
                  onClick={() => setBrandFilter(brand)}
                >
                  {brand === 'all' ? 'Todas' : brand}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="brand-scroll-btn"
              aria-label="Marcas siguientes"
              disabled={!brandScroll.right}
              onClick={() => scrollBrands(1)}
            >
              ›
            </button>
          </div>
        </div>
        <div className="filters-row">
          <span className="lab">ESTADO</span>
          {STATUS_FILTERS.map(([value, label]) => (
            <button key={value} type="button" className={`chip ${statusFilter === value ? 'on' : ''}`} onClick={() => setStatusFilter(value)}>
              {label}
            </button>
          ))}
          <span className="sep" />
          <span className="lab">CONFIANZA</span>
          {CONF_FILTERS.map(([value, label]) => (
            <button key={value} type="button" className={`chip ${confFilter === value ? 'on' : ''}`} onClick={() => setConfFilter(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="legend">
        <span className="li"><span className="dot ok" />Aprobado</span>
        <span className="li"><span className="dot corrected" />Corregido</span>
        <span className="li"><span className="dot pending-model" />Pendiente modelo</span>
        <span className="li"><span className="dot rejected" />Rechazado</span>
        <span className="li"><span className="dot discarded" />Descartado</span>
        <span className="li"><span className="dot selected" />Seleccionado</span>
      </div>

      <div className="vtoolbar">
        <span className="sel"><b>{selected.size}</b> seleccionados</span>
        <button className="vbtn ok" disabled={!selected.size} onClick={() => { onApprove(selectedIds); setSelected(new Set()) }}>✓ Aprobar <kbd>A</kbd></button>
        <button className="vbtn no" disabled={!selected.size} onClick={() => { onReject(selectedIds); setSelected(new Set()) }}>✕ Rechazar <kbd>R</kbd></button>
        <div className={`menu ${brandMenuOpen ? 'open' : ''}`}>
          <button className="vbtn" disabled={!selected.size} onClick={() => { setBrandMenuOpen((v) => !v); setModelMenuOpen(false) }}>↺ Reasignar marca ▾</button>
          <div className="menu-pop">
            <div className="menu-lab">MARCAS</div>
            {Object.keys(displayCatalog).map((brand) => (
              <button key={brand} onClick={() => { onCorrectBrand(selectedIds, brand); setSelected(new Set()); setBrandMenuOpen(false) }}>
                <span className="bdot" style={{ background: brandColor(brand) }} />{brand}
              </button>
            ))}
            <div className="menu-new">
              <input type="text" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="Nueva marca…" />
              <button type="button" className="add" onClick={(e) => { e.stopPropagation(); if (newBrand.trim()) { onCorrectBrand(selectedIds, newBrand.trim()); setNewBrand(''); setSelected(new Set()); setBrandMenuOpen(false) } }}>＋</button>
            </div>
          </div>
        </div>
        <div className={`menu ${modelMenuOpen ? 'open' : ''}`}>
          <button className="vbtn" disabled={!selected.size || !selectedBrand} onClick={() => { setModelMenuOpen((v) => !v); setBrandMenuOpen(false) }}>↺ Reasignar modelo ▾</button>
          <div className="menu-pop">
            {selectedBrand ? (
              <>
                <div className="menu-lab">MODELOS · {selectedBrand}</div>
                {(displayCatalog[selectedBrand] ?? []).map((model) => (
                  <button key={model} onClick={() => { onCorrectModel(selectedIds, selectedBrand, model); setSelected(new Set()); setModelMenuOpen(false) }}>
                    {model}
                  </button>
                ))}
                <div className="menu-new">
                  <input type="text" value={newModel} onChange={(e) => setNewModel(e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="Nuevo modelo…" />
                  <button type="button" className="add" onClick={(e) => { e.stopPropagation(); if (newModel.trim()) { onCorrectModel(selectedIds, selectedBrand, newModel.trim()); setNewModel(''); setSelected(new Set()); setModelMenuOpen(false) } }}>＋</button>
                </div>
              </>
            ) : (
              <div className="menu-lab warn">Seleccioná recortes de una sola marca para reasignar el modelo.</div>
            )}
          </div>
        </div>
        <button className="vbtn" disabled={!selected.size} onClick={() => { onDiscard(selectedIds); setSelected(new Set()) }}>⌀ Descartar</button>
        <button className="vbtn" disabled={!selected.size} onClick={() => setSelected(new Set())}>Limpiar</button>
      </div>

      <div className="mosaic">
        {visible.map((record) => {
          const displayState = getMosaicDisplayState(record, displayCatalog)
          const symbolMap: Partial<Record<ValidationRecord['state'] | 'pending-model', string>> = {
            approved: '✓',
            corrected: '↺',
            rejected: '✕',
            discarded: '⌀',
            'pending-model': 'M',
          }
          const symbol = symbolMap[displayState] ?? ''
          return (
            <article
              key={record.personId}
              className={`vtile ${displayState}${selected.has(record.personId) ? ' sel' : ''}`}
              onClick={() => toggle(record.personId)}
            >
              {record.confidence < 0.7 && <span className="low">{record.confidence.toFixed(2)}</span>}
              <span className="st">{symbol}</span>
              <button className="open" onClick={(event) => { event.stopPropagation(); onOpenDetail(records.indexOf(record)) }}>🔍 detalle</button>
              <SpriteCrop spriteUrl={record.spriteUrl} image={record.image} className="mosaic-crop" />
              <div className="cap">
                <ClassificationChange record={record} displayCatalog={displayCatalog} compact />
              </div>
            </article>
          )
        })}
      </div>
      <div className="vscale">Mostrando {visible.length} de {DEMO_TOTAL.toLocaleString('es-PE')} recortes de la corrida · orden por confianza</div>
    </section>
  )
}
