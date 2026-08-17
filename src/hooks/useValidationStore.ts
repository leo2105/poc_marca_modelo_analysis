import { useCallback, useEffect, useMemo, useState } from 'react'
import catalogData from '../../marcas-modelos-lista.json'
import { deleteValidationSession, fetchValidationSession, isRemoteSessionEnabled, putValidationSession } from '../api/validationSession'
import { createDemoRecords, EVENT_ID, VALIDATION_SESSION_EPOCH, validationRun } from '../data/demoData'
import { DEMO_SPRITE_COUNT, RACE_SPRITE_FOLDER } from '../data/spriteManifest'
import type { Catalog, DecisionMethod, MosaicUiState, SessionSaveState, ValidationRecord, ValidationState, ValidationSummary } from '../types'
import { buildDisplayCatalog, catalogKeyToLabel, ensureCatalogEntry, labelToCatalogKey, modelKeyToLabel, UNKNOWN_BRAND_LABEL, UNKNOWN_MODEL_LABEL } from '../utils/catalog'
import { downloadValidationJson } from '../utils/exportValidation'
import { clearSpriteAnalysisCache } from '../utils/sprites'
import { getPanelBucket, getRecordPerspectives, isModelInCatalog, isPendingModel, withPendingModelState } from '../utils/record'
import { applySessionSnapshot, buildSessionSnapshot, isSnapshotCompatible } from '../utils/sessionSnapshot'

const BASE_CATALOG = catalogData as Catalog

const STORAGE_KEY = `len-validation-${EVENT_ID}`
const STORAGE_META_KEY = `${STORAGE_KEY}--meta`
const OBSOLETE_STORAGE_KEYS = [
  'len-validation-console-v8',
  'len-validation-console-v7',
  'len-validation-console-v6',
  'len-validation-console-v5',
  'len-validation-console-v4',
  'len-validation-console-v3',
  'len-validation-console-v2',
]

interface StorageMeta {
  folder: string
  epoch: string
  count: number
}

function readStorageMeta(): StorageMeta | null {
  try {
    const raw = localStorage.getItem(STORAGE_META_KEY)
    return raw ? (JSON.parse(raw) as StorageMeta) : null
  } catch {
    return null
  }
}

function writeStorageMeta() {
  const meta: StorageMeta = {
    folder: RACE_SPRITE_FOLDER,
    epoch: VALIDATION_SESSION_EPOCH,
    count: DEMO_SPRITE_COUNT,
  }
  localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta))
}

function purgeObsoleteStorage() {
  for (const key of OBSOLETE_STORAGE_KEYS) {
    localStorage.removeItem(key)
  }
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key?.startsWith('len-validation-console-')) {
      localStorage.removeItem(key)
    }
  }
}

function isStoredSessionValid(parsed: ValidationRecord[]): boolean {
  const meta = readStorageMeta()
  if (!meta) return false
  if (meta.folder !== RACE_SPRITE_FOLDER) return false
  if (meta.epoch !== VALIDATION_SESSION_EPOCH) return false
  if (meta.count !== DEMO_SPRITE_COUNT) return false
  if (parsed.length !== DEMO_SPRITE_COUNT) return false
  const sample = parsed[0]
  return !sample?.spriteUrl || sample.spriteUrl.includes(RACE_SPRITE_FOLDER)
}

type DisplayCatalog = Record<string, string[]>

interface HistoryEntry {
  records: ValidationRecord[]
  catalog: Catalog
}

const MAX_UNDO = 50

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
  const state = record.state === 'rejected' ? 'discarded' : record.state
  return {
    ...record,
    state,
    spriteUrl,
    image: spriteUrl ?? perspectives[0] ?? record.image,
    perspectives: spriteUrl ? [spriteUrl] : perspectives,
    detected,
    curated,
  }
}

function repairRecordsWithDemo(parsed: ValidationRecord[] | null, displayCatalog: DisplayCatalog): ValidationRecord[] {
  const demoRecords = createDemoRecords()
  if (!parsed?.length) return demoRecords

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
        wrong: stored.wrong ?? false,
      }),
      displayCatalog,
    )
  })
}

function loadRecords(displayCatalog: DisplayCatalog): ValidationRecord[] {
  purgeObsoleteStorage()
  clearSpriteAnalysisCache()
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as ValidationRecord[]
      if (isStoredSessionValid(parsed)) {
        return repairRecordsWithDemo(parsed, displayCatalog)
      }
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(STORAGE_META_KEY)
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_META_KEY)
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
    discarded: 0,
    includedInReport: 0,
    conflict: 0,
  }
  for (const record of records) {
    const pendingModel = isPendingModel(record, displayCatalog)
    const bucket = getPanelBucket(record, displayCatalog)
    summary[bucket] += 1
    if (record.wrong || pendingModel) summary.conflict += 1
    if (record.includedInReport && !pendingModel) summary.includedInReport += 1
  }
  return summary
}

export function useValidationStore() {
  const [catalog, setCatalog] = useState<Catalog>(catalogData as Catalog)
  const displayCatalog = useMemo(() => buildDisplayCatalog(catalog), [catalog])
  const [records, setRecords] = useState<ValidationRecord[]>(() => loadRecords(buildDisplayCatalog(catalogData as Catalog)))
  const [published, setPublishedState] = useState(validationRun.published)
  const [detailIndex, setDetailIndex] = useState(0)
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([])
  const [sessionDirty, setSessionDirty] = useState(false)
  const [sessionSaveState, setSessionSaveState] = useState<SessionSaveState>('idle')
  const [sessionSaveError, setSessionSaveError] = useState<string | null>(null)
  const [loadedMosaicUi, setLoadedMosaicUi] = useState<MosaicUiState | null>(null)
  const [remoteSessionEnabled] = useState(() => isRemoteSessionEnabled())

  const summary = useMemo(() => summarize(records, displayCatalog), [records, displayCatalog])

  const markSessionDirty = useCallback(() => {
    setSessionDirty(true)
    setSessionSaveState('idle')
    setSessionSaveError(null)
  }, [])

  const setPublished = useCallback((value: boolean) => {
    setPublishedState(value)
    markSessionDirty()
  }, [markSessionDirty])

  const setDetailIndexTracked = useCallback((value: number | ((prev: number) => number)) => {
    markSessionDirty()
    setDetailIndex(value)
  }, [markSessionDirty])

  const pushUndo = () => {
    setUndoStack((stack) => [
      ...stack.slice(-(MAX_UNDO - 1)),
      { records: structuredClone(records), catalog: structuredClone(catalog) },
    ])
  }

  const undoLastAction = () => {
    setUndoStack((stack) => {
      if (!stack.length) return stack
      const previous = stack[stack.length - 1]!
      setRecords(previous.records)
      setCatalog(previous.catalog)
      return stack.slice(0, -1)
    })
  }

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
    writeStorageMeta()
  }, [records])

  const applyDecision = (
    ids: Iterable<string>,
    state: ValidationState,
    curated?: { brand: string; model: string } | null,
    method: DecisionMethod = 'bulk_mosaic',
  ) => {
    pushUndo()
    markSessionDirty()
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

  const discardRecords = (ids: Iterable<string>, method: DecisionMethod = 'bulk_mosaic') => {
    applyDecision(ids, 'discarded', null, method)
  }

  const correctBrand = (ids: Iterable<string>, brand: string, method: DecisionMethod = 'bulk_mosaic') => {
    pushUndo()
    markSessionDirty()
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
    pushUndo()
    markSessionDirty()
    const nextCatalog = ensureCatalogEntry(catalog, brand, model)
    setCatalog(nextCatalog)
    applyDecision(ids, 'corrected', { brand, model }, method)
  }

  const resetSession = () => {
    purgeObsoleteStorage()
    clearSpriteAnalysisCache()
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(STORAGE_META_KEY)
    setRecords(createDemoRecords())
    setCatalog(catalogData as Catalog)
    setPublishedState(false)
    setDetailIndex(0)
    setUndoStack([])
    setSessionDirty(false)
    setSessionSaveState('idle')
    setSessionSaveError(null)
    setLoadedMosaicUi(null)
    if (remoteSessionEnabled) {
      void deleteValidationSession(EVENT_ID).catch(() => undefined)
    }
  }

  const loadRemoteSession = useCallback(async (): Promise<boolean> => {
    if (!remoteSessionEnabled) return false
    try {
      const snapshot = await fetchValidationSession(EVENT_ID)
      if (!snapshot || !isSnapshotCompatible(snapshot)) return false
      const applied = applySessionSnapshot(snapshot)
      setCatalog(applied.catalog)
      setRecords(syncRecords(applied.records, buildDisplayCatalog(applied.catalog)))
      setPublishedState(applied.published)
      setDetailIndex(applied.detailIndex)
      setLoadedMosaicUi(applied.ui)
      setSessionDirty(false)
      setSessionSaveState('saved')
      setSessionSaveError(null)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(applied.records))
      writeStorageMeta()
      return true
    } catch (err) {
      setSessionSaveError(err instanceof Error ? err.message : 'No se pudo cargar la sesión')
      setSessionSaveState('error')
      return false
    }
  }, [remoteSessionEnabled])

  const saveRemoteSession = useCallback(async (ui: MosaicUiState) => {
    if (!remoteSessionEnabled) return
    setSessionSaveState('saving')
    setSessionSaveError(null)
    try {
      const snapshot = buildSessionSnapshot({
        records,
        catalog,
        ui,
        published,
        detailIndex,
      })
      await putValidationSession(EVENT_ID, snapshot)
      setSessionDirty(false)
      setSessionSaveState('saved')
    } catch (err) {
      setSessionSaveState('error')
      setSessionSaveError(err instanceof Error ? err.message : 'No se pudo guardar')
      throw err
    }
  }, [catalog, detailIndex, published, records, remoteSessionEnabled])

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
    setDetailIndex: setDetailIndexTracked,
    approveRecords,
    discardRecords,
    correctBrand,
    correctModel,
    undoLastAction,
    canUndo: undoStack.length > 0,
    resetSession,
    exportValidationJson,
    validationRun,
    catalogKeyToLabel,
    labelToCatalogKey,
    modelKeyToLabel,
    remoteSessionEnabled,
    sessionDirty,
    sessionSaveState,
    sessionSaveError,
    loadedMosaicUi,
    loadRemoteSession,
    saveRemoteSession,
    markSessionDirty,
  }
}
