import { useEffect, useMemo, useState } from 'react'
import catalogData from '../../marcas-modelos-lista.json'
import { createDemoRecords, validationRun } from '../data/demoData'
import type { Catalog, DecisionMethod, ValidationRecord, ValidationState, ValidationSummary } from '../types'
import { buildDisplayCatalog, catalogKeyToLabel, ensureCatalogEntry, labelToCatalogKey, modelKeyToLabel, UNKNOWN_BRAND_LABEL, UNKNOWN_MODEL_LABEL } from '../utils/catalog'
import { downloadValidationJson } from '../utils/exportValidation'
import { getPanelBucket, getRecordPerspectives, isModelInCatalog, isPendingModel, withPendingModelState } from '../utils/record'

const BASE_CATALOG = catalogData as Catalog

const STORAGE_KEY = 'len-validation-console-v7'
const LEGACY_STORAGE_KEYS = ['len-validation-console-v6', 'len-validation-console-v5', 'len-validation-console-v4', 'len-validation-console-v3', 'len-validation-console-v2']

type DisplayCatalog = Record<string, string[]>

function sanitizeDetected(detected: { brand: string; model: string }) {
  return {
    brand: detected.brand.trim() || UNKNOWN_BRAND_LABEL,
    model: detected.model.trim() || UNKNOWN_MODEL_LABEL,
  }
}

function normalizeRecord(record: ValidationRecord): ValidationRecord {
  const perspectives = getRecordPerspectives(record)
  const spriteUrl = record.spriteUrl ?? (record.image.startsWith('/imgs/sprites/') ? record.image : undefined)
  const detected = sanitizeDetected(record.detected)
  const curated = record.curated ? sanitizeDetected(record.curated) : null
  return {
    ...record,
    spriteUrl,
    image: spriteUrl ?? perspectives[0] ?? record.image,
    perspectives: spriteUrl ? [spriteUrl] : perspectives,
    detected,
    curated,
  }
}

function hydrateRecords(parsed: ValidationRecord[], displayCatalog: DisplayCatalog): ValidationRecord[] {
  const demoRecords = createDemoRecords()
  const storedMap = new Map(parsed.map((record) => [record.personId, record]))

  return demoRecords.map((demo) => {
    const stored = storedMap.get(demo.personId)
    if (!stored) return demo

    return withPendingModelState(
      normalizeRecord({
        ...demo,
        state: stored.state,
        curated: stored.curated,
        includedInReport: stored.includedInReport,
        decision: stored.decision,
      }),
      displayCatalog,
    )
  })
}

function loadRecords(displayCatalog: DisplayCatalog): ValidationRecord[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return hydrateRecords(JSON.parse(stored) as ValidationRecord[], displayCatalog)

    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const legacy = localStorage.getItem(legacyKey)
      if (legacy) return hydrateRecords(JSON.parse(legacy) as ValidationRecord[], displayCatalog)
    }
  } catch {
    // ignore
  }
  return createDemoRecords()
}

function syncRecords(records: ValidationRecord[], displayCatalog: DisplayCatalog): ValidationRecord[] {
  return records.map((record) => withPendingModelState(record, displayCatalog))
}

function summarize(records: ValidationRecord[], displayCatalog: DisplayCatalog): ValidationSummary {
  const summary = {
    total: records.length,
    pending: 0,
    approved: 0,
    corrected: 0,
    rejected: 0,
    discarded: 0,
    includedInReport: 0,
    conflict: 0,
  }
  for (const record of records) {
    const pendingModel = isPendingModel(record, displayCatalog)
    const bucket = getPanelBucket(record, displayCatalog)
    summary[bucket] += 1
    if (record.state === 'rejected') summary.rejected += 1
    if (record.wrong || pendingModel) summary.conflict += 1
    if (record.includedInReport && !pendingModel) summary.includedInReport += 1
  }
  return summary
}

export function useValidationStore() {
  const [catalog, setCatalog] = useState<Catalog>(catalogData as Catalog)
  const displayCatalog = useMemo(() => buildDisplayCatalog(catalog), [catalog])
  const [records, setRecords] = useState<ValidationRecord[]>(() => loadRecords(buildDisplayCatalog(catalogData as Catalog)))
  const [published, setPublished] = useState(validationRun.published)
  const [detailIndex, setDetailIndex] = useState(0)

  const summary = useMemo(() => summarize(records, displayCatalog), [records, displayCatalog])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  }, [records])

  const applyDecision = (
    ids: Iterable<string>,
    state: ValidationState,
    curated?: { brand: string; model: string } | null,
    method: DecisionMethod = 'bulk_mosaic',
  ) => {
    const idSet = new Set(ids)
    const decidedAt = new Date().toISOString()
    setRecords((current) =>
      syncRecords(
        current.map((record) => {
        if (!idSet.has(record.personId)) return record
        const nextCurated =
          state === 'approved'
            ? record.curated ?? record.detected
            : state === 'corrected'
              ? curated ?? record.curated ?? record.detected
              : null
        return {
          ...record,
          state,
          curated: nextCurated,
          includedInReport: state === 'approved' || state === 'corrected',
          decision: {
            actor: validationRun.actor,
            decidedAt,
            method,
            note: null,
          },
        }
      }),
        displayCatalog,
      ),
    )
  }

  const approveRecords = (ids: Iterable<string>, method: DecisionMethod = 'bulk_mosaic') => {
    applyDecision(ids, 'approved', null, method)
  }

  const rejectRecords = (ids: Iterable<string>, method: DecisionMethod = 'bulk_mosaic') => {
    applyDecision(ids, 'rejected', null, method)
  }

  const discardRecords = (ids: Iterable<string>, method: DecisionMethod = 'bulk_mosaic') => {
    applyDecision(ids, 'discarded', null, method)
  }

  const correctBrand = (ids: Iterable<string>, brand: string, method: DecisionMethod = 'bulk_mosaic') => {
    const nextCatalog = ensureCatalogEntry(catalog, brand)
    setCatalog(nextCatalog)
    const nextDisplayCatalog = buildDisplayCatalog(nextCatalog)
    const idSet = new Set(ids)
    setRecords((current) =>
      syncRecords(
        current.map((record) => {
        if (!idSet.has(record.personId)) return record
        const model = record.curated?.model ?? record.detected.model
        const modelValid = isModelInCatalog(brand, model, nextDisplayCatalog)
        const curated = { brand, model }
        return {
          ...record,
          state: modelValid ? ('corrected' as const) : ('pending' as const),
          curated,
          includedInReport: modelValid,
          decision: {
            actor: validationRun.actor,
            decidedAt: new Date().toISOString(),
            method,
            note: modelValid ? null : 'pending_model',
          },
        }
      }),
        nextDisplayCatalog,
      ),
    )
  }

  const correctModel = (ids: Iterable<string>, brand: string, model: string, method: DecisionMethod = 'bulk_mosaic') => {
    const nextCatalog = ensureCatalogEntry(catalog, brand, model)
    setCatalog(nextCatalog)
    applyDecision(ids, 'corrected', { brand, model }, method)
  }

  const resetSession = () => {
    localStorage.removeItem(STORAGE_KEY)
    setRecords(createDemoRecords())
    setCatalog(catalogData as Catalog)
    setPublished(false)
    setDetailIndex(0)
  }

  const exportValidationJson = () => {
    void downloadValidationJson({
      records,
      catalog,
      baseCatalog: BASE_CATALOG,
      displayCatalog,
      validationRun,
      published,
    })
  }

  return {
    records,
    setRecords,
    catalog,
    displayCatalog,
    published,
    setPublished,
    summary,
    detailIndex,
    setDetailIndex,
    approveRecords,
    rejectRecords,
    discardRecords,
    correctBrand,
    correctModel,
    resetSession,
    exportValidationJson,
    validationRun,
    catalogKeyToLabel,
    labelToCatalogKey,
    modelKeyToLabel,
  }
}
