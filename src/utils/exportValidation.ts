import type { Catalog, ValidationRecord, ValidationRun } from '../types'
import { catalogKeyToLabel, labelToCatalogKey, modelKeyToLabel } from './catalog'
import {
  getClassificationChanges,
  getMosaicDisplayState,
  getPanelBucket,
  isPendingModel,
} from './record'
import { loadSpriteAnalysis } from './sprites'

type DisplayCatalog = Record<string, string[]>

const LOW_SCORE_THRESHOLD = 0.7

type ExportFlag =
  | 'brand_changed'
  | 'model_changed'
  | 'low_confidence'
  | 'false_positive'
  | 'new_brand_from_catalog'
  | 'new_model_from_catalog'

export interface ValidationExportParams {
  records: ValidationRecord[]
  catalog: Catalog
  baseCatalog: Catalog
  displayCatalog: DisplayCatalog
  validationRun: ValidationRun
  published: boolean
}

function buildCatalogAdditions(
  catalog: Catalog,
  baseCatalog: Catalog,
  actor: string,
  generatedAt: string,
) {
  const additions: Array<{
    type: 'brand' | 'model'
    brand: string
    model: string | null
    added_by: string
    added_at: string
  }> = []

  for (const [brandKey, models] of Object.entries(catalog)) {
    const brandLabel = catalogKeyToLabel(brandKey)
    if (!baseCatalog[brandKey]) {
      additions.push({
        type: 'brand',
        brand: brandLabel,
        model: null,
        added_by: actor,
        added_at: generatedAt,
      })
    }
    for (const modelKey of models) {
      if (!(baseCatalog[brandKey] ?? []).includes(modelKey)) {
        additions.push({
          type: 'model',
          brand: brandLabel,
          model: modelKeyToLabel(modelKey),
          added_by: actor,
          added_at: generatedAt,
        })
      }
    }
  }

  return additions
}

function isCatalogBrandNew(brand: string, baseCatalog: Catalog): boolean {
  return !baseCatalog[labelToCatalogKey(brand)]
}

function isCatalogModelNew(brand: string, model: string, baseCatalog: Catalog): boolean {
  const brandKey = labelToCatalogKey(brand)
  const modelKey = model.toLowerCase().replaceAll(' ', '-')
  return !(baseCatalog[brandKey] ?? []).includes(modelKey)
}

function buildFlags(
  record: ValidationRecord,
  displayCatalog: DisplayCatalog,
  baseCatalog: Catalog,
): ExportFlag[] {
  const flags: ExportFlag[] = []
  const { brandChanged, modelChanged, effective } = getClassificationChanges(record, displayCatalog)

  if (brandChanged) flags.push('brand_changed')
  if (modelChanged) flags.push('model_changed')
  if (record.confidence < LOW_SCORE_THRESHOLD) flags.push('low_confidence')
  if (record.state === 'discarded' || record.state === 'rejected') flags.push('false_positive')

  if (record.curated) {
    if (isCatalogBrandNew(record.curated.brand, baseCatalog)) {
      flags.push('new_brand_from_catalog')
    }
    if (isCatalogModelNew(record.curated.brand, record.curated.model, baseCatalog)) {
      flags.push('new_model_from_catalog')
    }
  } else if (brandChanged && isCatalogBrandNew(effective.brand, baseCatalog)) {
    flags.push('new_brand_from_catalog')
  }

  return flags
}

function exportCurated(record: ValidationRecord, displayCatalog: DisplayCatalog) {
  const pendingModel = isPendingModel(record, displayCatalog)
  if (record.state === 'discarded' || record.state === 'rejected' || pendingModel) return null
  if (record.state === 'approved' || record.state === 'corrected') {
    return record.curated ?? record.detected
  }
  return null
}

function exportIncludedInReport(record: ValidationRecord, displayCatalog: DisplayCatalog): boolean {
  const pendingModel = isPendingModel(record, displayCatalog)
  if (pendingModel) return false
  return record.state === 'approved' || record.state === 'corrected'
}

function exportDecision(record: ValidationRecord, validationRun: ValidationRun, generatedAt: string) {
  if (record.decision) {
    return {
      actor: record.decision.actor,
      decided_at: record.decision.decidedAt,
      method: record.decision.method,
      note: record.decision.note ?? null,
    }
  }
  return {
    actor: validationRun.actor,
    decided_at: generatedAt,
    method: 'individual' as const,
    note: null,
  }
}

async function resolvePerspectiveCount(record: ValidationRecord): Promise<number> {
  const spriteUrl = record.spriteUrl ?? record.image
  if (!spriteUrl.includes('/imgs/sprites/')) return 1
  try {
    const analysis = await loadSpriteAnalysis(spriteUrl)
    return Math.max(analysis.activeSlots.length, 1)
  } catch {
    return 1
  }
}

export async function buildValidationExport({
  records,
  catalog,
  baseCatalog,
  displayCatalog,
  validationRun,
  published,
}: ValidationExportParams) {
  const generatedAt = new Date().toISOString()
  const catalogAdditions = buildCatalogAdditions(catalog, baseCatalog, validationRun.actor, generatedAt)
  const recordExtensions: Record<string, object> = {}
  const perspectiveCounts = await Promise.all(records.map((record) => resolvePerspectiveCount(record)))

  const exportRecords = records.map((record, index) => {
    const { brandChanged, modelChanged, effective, pendingModel } = getClassificationChanges(
      record,
      displayCatalog,
    )
    const mosaicState = getMosaicDisplayState(record, displayCatalog)
    const panelBucket = getPanelBucket(record, displayCatalog)
    const perspectiveCount = perspectiveCounts[index]

    recordExtensions[record.personId] = {
      sprite_url: record.spriteUrl ?? record.image,
      preview_url: record.image,
      perspective_urls: record.perspectives,
      perspective_count: perspectiveCount,
      camera_id: record.camera,
      captured_at: record.capturedAt,
      mosaic_display_state: mosaicState,
      panel_bucket: panelBucket,
      pending_model: pendingModel,
      shoe_brand: effective.brand,
      shoe_model: effective.model,
      brand_changed: brandChanged,
      model_changed: modelChanged,
      shoe_score: record.confidence,
      low_score: record.confidence < LOW_SCORE_THRESHOLD,
      shoe_flagged_wrong: record.wrong,
    }

    return {
      person_id: record.personId,
      crop_key: record.cropKey,
      state: record.state === 'rejected' ? 'discarded' : record.state,
      score: record.confidence,
      detected: record.detected,
      curated: exportCurated(record, displayCatalog),
      included_in_report: exportIncludedInReport(record, displayCatalog),
      flags: buildFlags(record, displayCatalog, baseCatalog),
      decision: exportDecision(record, validationRun, generatedAt),
    }
  })

  const summary = {
    total: records.length,
    pending: 0,
    approved: 0,
    corrected: 0,
    discarded: 0,
    included_in_report: 0,
  }

  for (const record of records) {
    const pendingModel = isPendingModel(record, displayCatalog)
    if (pendingModel || record.state === 'pending') summary.pending += 1
    else if (record.state === 'approved') summary.approved += 1
    else if (record.state === 'corrected') summary.corrected += 1
    else if (record.state === 'discarded' || record.state === 'rejected') summary.discarded += 1
    if (exportIncludedInReport(record, displayCatalog)) summary.included_in_report += 1
  }

  return {
    schema_version: validationRun.schemaVersion,
    event_id: validationRun.eventId,
    run_id: validationRun.runId,
    source_run_id: validationRun.sourceRunId,
    generated_at: generatedAt,
    catalog_version: validationRun.catalogVersion,
    published,
    summary,
    catalog_additions: catalogAdditions,
    records: exportRecords,
    record_extensions: recordExtensions,
  }
}

export async function downloadValidationJson(params: ValidationExportParams) {
  const payload = await buildValidationExport(params)
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `validation-${params.validationRun.eventId}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}
