import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Search, Save, Undo2 } from 'lucide-react'
import type { MosaicUiState, SessionSaveState, ValidationRecord } from '../types'
import { ClassificationChange } from './ClassificationChange'
import { SpriteCrop } from './SpriteCrop'
import { brandColor } from '../utils/catalog'
import { getEffectiveClassification, getMosaicDisplayState, isHiddenFromView, isPendingLike, isPendingModel, isResolved } from '../utils/record'
import type { MosaicDisplayState } from '../utils/record'

interface MosaicViewProps {
  records: ValidationRecord[]
  displayCatalog: Record<string, string[]>
  persistedUi: MosaicUiState | null
  onPersistUi: (ui: MosaicUiState) => void
  active?: boolean
  canUndo: boolean
  onUndo: () => void
  onApprove: (ids: string[]) => void
  onHideCrops: (ids: string[]) => void
  onCorrectBrand: (ids: string[], brand: string) => void
  onCorrectModel: (ids: string[], brand: string, model: string) => void
  onOpenDetail: (index: number, navigationIds: string[]) => void
  bootstrapUi?: MosaicUiState | null
  remoteSaveEnabled?: boolean
  sessionDirty?: boolean
  sessionSaveState?: SessionSaveState
  sessionSaveError?: string | null
  onSaveSession?: (ui: MosaicUiState) => void | Promise<void>
  onMarkSessionDirty?: () => void
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

const TILE_SYMBOL: Partial<Record<MosaicDisplayState, string>> = {
  approved: '✓',
  corrected: '↺',
  discarded: '⌀',
  'pending-model': 'M',
}

const TILE_MIN_WIDTH = 148
const TILE_GAP = 12
const TILE_ROW = 194

function useWindowedGrid(itemCount: number, enabled: boolean) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(4)
  const [start, setStart] = useState(0)
  const [end, setEnd] = useState(Math.min(itemCount, 48))

  useEffect(() => {
    if (!enabled) return

    const measure = () => {
      const element = containerRef.current
      if (!element) return
      const width = element.clientWidth
      const nextCols = Math.max(1, Math.floor((width + TILE_GAP) / (TILE_MIN_WIDTH + TILE_GAP)))
      const rect = element.getBoundingClientRect()
      const viewTop = Math.max(0, -rect.top)
      const viewBottom = viewTop + window.innerHeight
      const startRow = Math.max(0, Math.floor(viewTop / TILE_ROW) - 2)
      const endRow = Math.ceil(viewBottom / TILE_ROW) + 3
      setCols(nextCols)
      setStart(startRow * nextCols)
      setEnd(Math.min(itemCount, Math.max(startRow * nextCols + nextCols, endRow * nextCols)))
    }

    measure()
    window.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    const observer = new ResizeObserver(measure)
    if (containerRef.current) observer.observe(containerRef.current)
    return () => {
      window.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [enabled, itemCount])

  return {
    containerRef,
    cols,
    start,
    end,
    rows: Math.max(1, Math.ceil(itemCount / cols)),
  }
}

const DEFAULT_UI: MosaicUiState = {
  brandFilter: 'all',
  modelFilter: 'all',
  statusFilter: 'all',
  confFilter: 'all',
  scrollY: 0,
  selectedIds: [],
}

function resolveUi(ui: MosaicUiState | null): MosaicUiState {
  if (!ui) return DEFAULT_UI
  return {
    ...DEFAULT_UI,
    ...ui,
    modelFilter: ui.modelFilter || 'all',
  }
}

export function MosaicView({
  records,
  displayCatalog,
  persistedUi,
  onPersistUi,
  active = true,
  canUndo,
  onUndo,
  onApprove,
  onHideCrops,
  onCorrectBrand,
  onCorrectModel,
  onOpenDetail,
  bootstrapUi,
  remoteSaveEnabled = false,
  sessionDirty = false,
  sessionSaveState = 'idle',
  sessionSaveError,
  onSaveSession,
  onMarkSessionDirty,
}: MosaicViewProps) {
  const initial = resolveUi(persistedUi)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial.selectedIds))
  const [brandFilter, setBrandFilter] = useState(initial.brandFilter)
  const [modelFilter, setModelFilter] = useState(initial.modelFilter)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved'>(initial.statusFilter)
  const [confFilter, setConfFilter] = useState(initial.confFilter)
  const [brandMenuOpen, setBrandMenuOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [brandFilterOpen, setBrandFilterOpen] = useState(false)
  const [modelFilterOpen, setModelFilterOpen] = useState(false)
  const [newBrand, setNewBrand] = useState('')
  const [newModel, setNewModel] = useState('')
  const lastClickedIndexRef = useRef<number | null>(null)
  const mosaicUndoRef = useRef<Array<{ type: 'selection' | 'action'; previous: string[] }>>([])
  const [mosaicUndoCount, setMosaicUndoCount] = useState(0)
  const skipUiDirtyRef = useRef(true)
  const bootstrapAppliedRef = useRef(false)

  useEffect(() => {
    if (!bootstrapUi || bootstrapAppliedRef.current) return
    bootstrapAppliedRef.current = true
    skipUiDirtyRef.current = true
    const ui = resolveUi(bootstrapUi)
    setSelected(new Set(ui.selectedIds))
    setBrandFilter(ui.brandFilter)
    setModelFilter(ui.modelFilter)
    setStatusFilter(ui.statusFilter)
    setConfFilter(ui.confFilter)
    if (ui.scrollY > 0) {
      requestAnimationFrame(() => window.scrollTo(0, ui.scrollY))
    }
  }, [bootstrapUi])

  useEffect(() => {
    if (!onMarkSessionDirty || skipUiDirtyRef.current) {
      skipUiDirtyRef.current = false
      return
    }
    onMarkSessionDirty()
  }, [brandFilter, confFilter, modelFilter, onMarkSessionDirty, selected, statusFilter])

  const snapshotUi = useCallback((): MosaicUiState => ({
    brandFilter,
    modelFilter,
    statusFilter,
    confFilter,
    scrollY: window.scrollY,
    selectedIds: [...selected],
  }), [brandFilter, confFilter, modelFilter, selected, statusFilter])

  const snapshotRef = useRef(snapshotUi)
  snapshotRef.current = snapshotUi
  const persistRef = useRef(onPersistUi)
  persistRef.current = onPersistUi

  useEffect(() => {
    persistRef.current(snapshotUi())
  }, [snapshotUi])

  useEffect(() => {
    if (!active) return
    const onScroll = () => {
      const ui = snapshotRef.current()
      persistRef.current({ ...ui, scrollY: window.scrollY })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      persistRef.current(snapshotRef.current())
      window.removeEventListener('scroll', onScroll)
    }
  }, [active])

  const catalogBrands = useMemo(
    () => Object.keys(displayCatalog).sort((a, b) => a.localeCompare(b, 'es')),
    [displayCatalog],
  )

  const catalogModels = useMemo(
    () => (brandFilter === 'all' ? [] : [...(displayCatalog[brandFilter] ?? [])].sort((a, b) => a.localeCompare(b, 'es'))),
    [brandFilter, displayCatalog],
  )

  const chooseBrandFilter = (brand: string) => {
    setBrandFilter(brand)
    setModelFilter('all')
    setBrandFilterOpen(false)
    setModelFilterOpen(false)
  }

  const chooseModelFilter = (model: string) => {
    setModelFilter(model)
    setModelFilterOpen(false)
  }

  useEffect(() => {
    if (!brandFilterOpen && !modelFilterOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.closest('.catalog-filter')) return
      setBrandFilterOpen(false)
      setModelFilterOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [brandFilterOpen, modelFilterOpen])

  const hiddenCropCount = useMemo(
    () => records.filter((record) => isHiddenFromView(record)).length,
    [records],
  )

  const visible = useMemo(() => records.filter((record) => {
    if (isHiddenFromView(record)) return false
    const effective = getEffectiveClassification(record)
    if (brandFilter !== 'all' && effective.brand !== brandFilter) return false
    if (modelFilter !== 'all' && effective.model !== modelFilter) return false
    if (statusFilter === 'pending' && !isPendingLike(record, displayCatalog)) return false
    if (statusFilter === 'approved' && !isResolved(record, displayCatalog)) return false
    if (confFilter !== 'all') {
      const pct = record.confidence * 100
      const [min, max] = confFilter.split('-').map(Number)
      if (!(pct >= min && pct < (max === 100 ? 100.01 : max))) return false
    }
    return true
  }), [brandFilter, confFilter, displayCatalog, modelFilter, records, statusFilter])

  const windowed = useWindowedGrid(visible.length, active)

  const selectedBrand = useMemo(() => {
    const brands = new Set<string>()
    records.forEach((record) => {
      if (selected.has(record.personId)) brands.add(getEffectiveClassification(record).brand)
    })
    return brands.size === 1 ? [...brands][0] : null
  }, [records, selected])

  const sameSelection = (a: Set<string>, b: Iterable<string>) => {
    const other = b instanceof Set ? b : new Set(b)
    if (a.size !== other.size) return false
    for (const id of a) if (!other.has(id)) return false
    return true
  }

  const pushMosaicUndo = (type: 'selection' | 'action', previous: Iterable<string>) => {
    mosaicUndoRef.current = [
      ...mosaicUndoRef.current.slice(-49),
      { type, previous: [...previous] },
    ]
    setMosaicUndoCount(mosaicUndoRef.current.length)
  }

  const commitSelection = (next: Set<string>, current: Set<string> = selected) => {
    if (sameSelection(current, next)) return
    pushMosaicUndo('selection', current)
    setSelected(next)
  }

  const runDecision = (action: (ids: string[]) => void, ids: string[] = [...selected]) => {
    if (!ids.length) return
    pushMosaicUndo('action', ids)
    action(ids)
    setSelected(new Set())
  }

  const handleUndo = () => {
    const stack = mosaicUndoRef.current
    if (stack.length > 0) {
      const last = stack[stack.length - 1]!
      mosaicUndoRef.current = stack.slice(0, -1)
      setMosaicUndoCount(mosaicUndoRef.current.length)
      setSelected(new Set(last.previous))
      if (last.type === 'action') onUndo()
      return
    }
    if (canUndo) onUndo()
  }

  const canUndoNow = mosaicUndoCount > 0 || canUndo

  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const visibleRef = useRef(visible)
  visibleRef.current = visible
  const recordsRef = useRef(records)
  recordsRef.current = records
  const onOpenDetailRef = useRef(onOpenDetail)
  onOpenDetailRef.current = onOpenDetail

  const selectTile = useCallback((id: string, visibleIndex: number, shiftKey: boolean) => {
    const current = selectedRef.current
    if (shiftKey && lastClickedIndexRef.current !== null) {
      const start = Math.min(lastClickedIndexRef.current, visibleIndex)
      const end = Math.max(lastClickedIndexRef.current, visibleIndex)
      const next = new Set(current)
      const list = visibleRef.current
      for (let i = start; i <= end; i += 1) {
        next.add(list[i]!.personId)
      }
      commitSelection(next, current)
    } else {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      commitSelection(next, current)
      lastClickedIndexRef.current = visibleIndex
    }
  }, [])

  const openDetail = useCallback((personId: string) => {
    persistRef.current({ ...snapshotRef.current(), scrollY: window.scrollY })
    const index = recordsRef.current.findIndex((record) => record.personId === personId)
    if (index >= 0) {
      onOpenDetailRef.current(index, visibleRef.current.map((item) => item.personId))
    }
  }, [])

  const handleUndoRef = useRef(handleUndo)
  handleUndoRef.current = handleUndo
  const runDecisionRef = useRef(runDecision)
  runDecisionRef.current = runDecision
  const commitSelectionRef = useRef(commitSelection)
  commitSelectionRef.current = commitSelection
  const onApproveRef = useRef(onApprove)
  onApproveRef.current = onApprove
  const onHideCropsRef = useRef(onHideCrops)
  onHideCropsRef.current = onHideCrops

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!active) return
      const target = event.target as HTMLElement
      if (target.matches('input, select, textarea')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        handleUndoRef.current()
        return
      }
      const current = selectedRef.current
      if (!current.size) return
      const ids = [...current]
      const key = event.key.toLowerCase()
      if (key === 'a') runDecisionRef.current(onApproveRef.current, ids)
      if (key === 'r' || key === 'd') runDecisionRef.current(onHideCropsRef.current, ids)
      if (event.key === 'Escape') commitSelectionRef.current(new Set())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active])

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
        <div className="catalog-filters">
          <div className={`catalog-filter ${brandFilterOpen ? 'open' : ''}`}>
            <span className="lab">MARCA</span>
            <div className="catalog-select-wrap">
              <button
                type="button"
                className="catalog-select"
                aria-haspopup="listbox"
                aria-expanded={brandFilterOpen}
                onClick={() => { setBrandFilterOpen((open) => !open); setModelFilterOpen(false) }}
              >
                <span>{brandFilter === 'all' ? 'Todas las marcas' : brandFilter}</span>
                <span className="caret" aria-hidden>▾</span>
              </button>
              {brandFilterOpen && (
                <div className="catalog-pop" role="listbox">
                  <button type="button" className={brandFilter === 'all' ? 'on' : ''} onClick={() => chooseBrandFilter('all')}>
                    Todas las marcas
                  </button>
                  {catalogBrands.map((brand) => (
                    <button key={brand} type="button" className={brandFilter === brand ? 'on' : ''} onClick={() => chooseBrandFilter(brand)}>
                      {brand}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className={`catalog-filter ${modelFilterOpen ? 'open' : ''}`}>
            <span className="lab">MODELO</span>
            <div className="catalog-select-wrap">
              <button
                type="button"
                className="catalog-select"
                aria-haspopup="listbox"
                aria-expanded={modelFilterOpen}
                onClick={() => { setModelFilterOpen((open) => !open); setBrandFilterOpen(false) }}
              >
                <span>{modelFilter === 'all' ? 'Todos los modelos' : modelFilter}</span>
                <span className="caret" aria-hidden>▾</span>
              </button>
              {modelFilterOpen && (
                <div className={`catalog-pop${brandFilter === 'all' ? ' is-empty' : ''}`} role="listbox">
                  {brandFilter !== 'all' && (
                    <>
                      <button type="button" className={modelFilter === 'all' ? 'on' : ''} onClick={() => chooseModelFilter('all')}>
                        Todos los modelos
                      </button>
                      {catalogModels.map((model) => (
                        <button key={model} type="button" className={modelFilter === model ? 'on' : ''} onClick={() => chooseModelFilter(model)}>
                          {model}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
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
        <span className="li" title="Falso positivo o recorte inválido"><span className="dot discarded" />Descartado</span>
        <span className="li"><span className="dot selected" />Seleccionado</span>
      </div>

      <div className="vtoolbar">
        <span className="sel"><b>{selected.size}</b> seleccionados</span>
        <button className="vbtn" disabled={!canUndoNow} onClick={handleUndo} title="Deshacer (Ctrl+Z)">
          <Undo2 size={14} strokeWidth={2} aria-hidden /> Deshacer
        </button>
        <button className="vbtn ok" disabled={!selected.size} onClick={() => runDecision(onApprove)}>✓ Aprobar <kbd>A</kbd></button>
        <div className={`menu ${brandMenuOpen ? 'open' : ''}`}>
          <button className="vbtn" disabled={!selected.size} onClick={() => { setBrandMenuOpen((v) => !v); setModelMenuOpen(false) }}>↺ Reasignar marca ▾</button>
          <div className="menu-pop">
            <div className="menu-lab">MARCAS</div>
            {Object.keys(displayCatalog).map((brand) => (
              <button key={brand} onClick={() => { runDecision((ids) => onCorrectBrand(ids, brand)); setBrandMenuOpen(false) }}>
                <span className="bdot" style={{ background: brandColor(brand) }} />{brand}
              </button>
            ))}
            <div className="menu-new">
              <input type="text" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="Nueva marca…" />
              <button type="button" className="add" onClick={(e) => { e.stopPropagation(); if (newBrand.trim()) { runDecision((ids) => onCorrectBrand(ids, newBrand.trim())); setNewBrand(''); setBrandMenuOpen(false) } }}>＋</button>
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
                  <button key={model} onClick={() => { runDecision((ids) => onCorrectModel(ids, selectedBrand, model)); setModelMenuOpen(false) }}>
                    {model}
                  </button>
                ))}
                <div className="menu-new">
                  <input type="text" value={newModel} onChange={(e) => setNewModel(e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="Nuevo modelo…" />
                  <button type="button" className="add" onClick={(e) => { e.stopPropagation(); if (newModel.trim()) { runDecision((ids) => onCorrectModel(ids, selectedBrand, newModel.trim())); setNewModel(''); setModelMenuOpen(false) } }}>＋</button>
                </div>
              </>
            ) : (
              <div className="menu-lab warn">Seleccioná recortes de una sola marca para reasignar el modelo.</div>
            )}
          </div>
        </div>
        <button className="vbtn" disabled={!selected.size} onClick={() => runDecision(onHideCrops)} title="Elimina las zapatillas seleccionadas del mosaico y del dashboard">⌀ Eliminar zapatilla <kbd>D</kbd></button>
        <button className="vbtn" disabled={!selected.size} onClick={() => commitSelection(new Set())}>Limpiar selección</button>
        {remoteSaveEnabled && (
          <>
            <button
              type="button"
              className={`vbtn save${sessionDirty ? ' is-dirty' : ''}`}
              disabled={!sessionDirty || sessionSaveState === 'saving'}
              onClick={() => void onSaveSession?.(snapshotUi())}
              title="Guardar decisiones y preferencias del mosaico en la nube"
            >
              <Save size={14} strokeWidth={2} aria-hidden />
              {sessionSaveState === 'saving' ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <span className={`session-save-hint${sessionSaveState === 'error' ? ' error' : ''}`}>
              {sessionSaveState === 'error' && sessionSaveError
                ? sessionSaveError
                : sessionDirty
                  ? 'Cambios sin guardar · autoguardado cada 5 min'
                  : sessionSaveState === 'saved'
                    ? 'Guardado en la nube'
                    : ''}
            </span>
          </>
        )}
      </div>

      <div
        className="mosaic-window"
        ref={windowed.containerRef}
        style={{ height: active ? windowed.rows * TILE_ROW : undefined }}
      >
        <div
          className="mosaic"
          style={{
            transform: active ? `translateY(${Math.floor(windowed.start / windowed.cols) * TILE_ROW}px)` : undefined,
            gridTemplateColumns: `repeat(${windowed.cols}, minmax(0, 1fr))`,
          }}
        >
        {active &&
          visible.slice(windowed.start, windowed.end).map((record, offset) => {
            const visibleIndex = windowed.start + offset
            const displayState = getMosaicDisplayState(record, displayCatalog)
            return (
              <MosaicTile
                key={record.personId}
                record={record}
                displayCatalog={displayCatalog}
                displayState={displayState}
                symbol={TILE_SYMBOL[displayState] ?? ''}
                selected={selected.has(record.personId)}
                visibleIndex={visibleIndex}
                onSelect={selectTile}
                onOpenDetail={openDetail}
              />
            )
          })}
        </div>
      </div>
      <div className="vscale">
        Mostrando {visible.length} recortes
        {hiddenCropCount > 0 ? ` · ${hiddenCropCount.toLocaleString('es-PE')} ocultos (sin vistas)` : ''}
        {' '}
        · orden por confianza · <kbd>Shift</kbd>+clic para rango
      </div>
    </section>
  )
}

interface MosaicTileProps {
  record: ValidationRecord
  displayCatalog: Record<string, string[]>
  displayState: MosaicDisplayState
  symbol: string
  selected: boolean
  visibleIndex: number
  style?: CSSProperties
  onSelect: (id: string, visibleIndex: number, shiftKey: boolean) => void
  onOpenDetail: (personId: string) => void
}

const MosaicTile = memo(function MosaicTile({
  record,
  displayCatalog,
  displayState,
  symbol,
  selected,
  visibleIndex,
  style,
  onSelect,
  onOpenDetail,
}: MosaicTileProps) {
  const [slotIndex, setSlotIndex] = useState(0)
  const [slotCount, setSlotCount] = useState(0)
  const canCycle = slotCount > 1
  const safeIndex = slotCount > 0 ? Math.min(slotIndex, slotCount - 1) : 0

  const cycle = (step: number) => {
    if (!canCycle) return
    setSlotIndex((current) => (current + step + slotCount) % slotCount)
  }

  return (
    <article
      className={`vtile ${displayState}${selected ? ' sel' : ''}`}
      style={style}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        const target = event.target as HTMLElement
        if (target.closest('button, .vtile-nav')) return
        event.preventDefault()
        onSelect(record.personId, visibleIndex, event.shiftKey)
      }}
    >
      <span className="st">{symbol}</span>
      <div className="vtile-nav" onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="vtile-nav-btn"
          aria-label="Perspectiva anterior"
          disabled={!canCycle}
          onClick={(event) => {
            event.stopPropagation()
            cycle(-1)
          }}
        >
          ‹
        </button>
        <button
          type="button"
          className="vtile-nav-btn"
          aria-label="Perspectiva siguiente"
          disabled={!canCycle}
          onClick={(event) => {
            event.stopPropagation()
            cycle(1)
          }}
        >
          ›
        </button>
      </div>
      <button
        type="button"
        className="open"
        aria-label="Ver detalle"
        onClick={(event) => {
          event.stopPropagation()
          onOpenDetail(record.personId)
        }}
      >
        <Search size={14} strokeWidth={2} />
      </button>
      <SpriteCrop
        spriteUrl={record.spriteUrl}
        image={record.image}
        slotIndex={safeIndex}
        hiddenSlotIndexes={record.hiddenSlotIndexes}
        className="mosaic-crop"
        onSlotCount={setSlotCount}
      />
      <div className="cap">
        <ClassificationChange record={record} displayCatalog={displayCatalog} compact />
      </div>
    </article>
  )
})
