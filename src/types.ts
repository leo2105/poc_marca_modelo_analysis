export type Catalog = Record<string, string[]>

export type ValidationState = 'pending' | 'approved' | 'corrected' | 'rejected' | 'discarded'

export type ValidationView = 'panel' | 'mosaic' | 'detail' | 'publish'

export interface MosaicUiState {
  brandFilter: string
  statusFilter: 'all' | 'pending' | 'approved'
  confFilter: string
  scrollY: number
  selectedIds: string[]
}

export type DecisionMethod = 'individual' | 'bulk_mosaic'

export interface ValidationRecord {
  personId: string
  cropKey: string
  /** Sprite 2×2 en public/imgs/sprites/<carrera>/, URL /imgs/sprites/… */
  spriteUrl?: string
  image: string
  /** Hasta 4 recortes de la misma zapatilla (1–4 según disponibilidad). */
  perspectives: string[]
  state: ValidationState
  confidence: number
  detected: { brand: string; model: string }
  curated: { brand: string; model: string } | null
  includedInReport: boolean
  wrong: boolean
  frames: string
  camera: string
  capturedAt: string
  decision?: {
    actor: string
    decidedAt: string
    method: DecisionMethod
    note?: string | null
  }
}

export interface ValidationRun {
  schemaVersion: '1.0'
  eventId: string
  runId: string
  sourceRunId: string
  catalogVersion: string
  published: boolean
  actor: string
}

export interface ValidationSummary {
  total: number
  pending: number
  approved: number
  corrected: number
  discarded: number
  includedInReport: number
  conflict: number
}

export interface ValidationDecisionDelta {
  state: ValidationState
  curated: { brand: string; model: string } | null
  includedInReport: boolean
  wrong?: boolean
  decision?: ValidationRecord['decision']
}

export interface ValidationSessionSnapshot {
  schemaVersion: '1.0'
  eventId: string
  sessionEpoch: string
  catalog: Catalog
  decisions: Record<string, ValidationDecisionDelta>
  ui: MosaicUiState | null
  published: boolean
  detailIndex: number
  savedAt: string
}

export type SessionSaveState = 'idle' | 'saving' | 'saved' | 'error'
