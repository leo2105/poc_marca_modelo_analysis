export type Catalog = Record<string, string[]>

export type ValidationState = 'pending' | 'approved' | 'corrected' | 'rejected' | 'discarded'

export type ValidationView = 'panel' | 'mosaic' | 'detail' | 'publish'

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
  rejected: number
  discarded: number
  includedInReport: number
  conflict: number
}
