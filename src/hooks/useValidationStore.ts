import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import catalogData from '../../marcas-modelos-lista.json'
import { deleteValidationSession, fetchValidationSession, isRemoteSessionEnabled, putValidationSession } from '../api/validationSession'
import { canPublish, sessionActorEmail, sessionOwnerId } from '../auth/roles'
import { readStoredEventId, setActiveEventId, storeEventId } from '../data/activeRace'
import { createRecordsForRace } from '../data/demoData'
import { HOMENAJE_ASSETS, loadRaceAssets, type RaceAssets } from '../data/raceAssets'
import { DEFAULT_EVENT_ID, getRace, raceValidationRun, RACES, storageKeyForEvent, storageMetaKeyForEvent, type RaceDefinition } from '../data/races'
import type { Catalog, DecisionMethod, MosaicUiState, SessionSaveState, ValidationRecord, ValidationSessionSnapshot, ValidationState, ValidationSummary } from '../types'
import { buildDisplayCatalog, catalogKeyToLabel, ensureCatalogEntry, labelToCatalogKey, mergeCatalogs, modelKeyToLabel, UNKNOWN_BRAND_LABEL, UNKNOWN_MODEL_LABEL } from '../utils/catalog'
import { downloadValidationJson } from '../utils/exportValidation'
import { clearSpriteAnalysisCache } from '../utils/sprites'
import { getPanelBucket, getRecordPerspectives, isModelInCatalog, isPendingModel, withPendingModelState } from '../utils/record'
import { applySessionSnapshot, buildSessionSnapshot, isSnapshotCompatible } from '../utils/sessionSnapshot'

const BASE_CATALOG = catalogData as Catalog

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

function storageKey(eventId: string) {
  const owner = sessionOwnerId()
  const base = storageKeyForEvent(eventId)
  return owner ? `${base}--${owner}` : base
}

function storageMetaKey(eventId: string) {
  const owner = sessionOwnerId()
  const base = storageMetaKeyForEvent(eventId)
  return owner ? `${base}--${owner}` : base
}

function readStorageMeta(eventId: string): StorageMeta | null {
  try {
    const raw = localStorage.getItem(storageMetaKey(eventId))
    return raw ? (JSON.parse(raw) as StorageMeta) : null
  } catch {
    return null
  }
}

function writeStorageMeta(race: RaceDefinition, assets: RaceAssets) {
  const meta: StorageMeta = {
    folder: race.sourceRunId,
    epoch: race.sessionEpoch,
    count: assets.spriteFiles.length,
  }
  try {
    localStorage.setItem(storageMetaKey(race.eventId), JSON.stringify(meta))
  } catch {
    /* quota / private mode */
  }
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

function ownPublished(value: boolean) {
  return canPublish() ? value : false
}

function decisionActor(race: RaceDefinition) {
  return sessionActorEmail() || race.actor
}

function isStoredSessionValid(parsed: ValidationRecord[], race: RaceDefinition, assets: RaceAssets): boolean {
  const meta = readStorageMeta(race.eventId)
  if (!meta) return false
  if (meta.folder !== race.sourceRunId) return false
  if (meta.epoch !== race.sessionEpoch) return false
  if (meta.count !== assets.spriteFiles.length) return false
  if (parsed.length !== assets.spriteFiles.length) return false
  const sample = parsed[0]
  if (!sample?.spriteUrl) return true
  return sample.spriteUrl.includes(race.sourceRunId) || sample.spriteUrl.includes(race.eventId)
}

type DisplayCatalog = Record<string, string[]>

interface HistoryEntry {
  records: ValidationRecord[]
  catalog: Catalog
}

const MAX_UNDO = 50

function isSpritePath(url: string) {
  return url.includes('/imgs/sprites/') || /\/imgs\/races\/[^/]+\/sprites\//.test(url)
}

function sanitizeDetected(detected: { brand: string; model: string }) {
  return {
    brand: detected.brand.trim() || UNKNOWN_BRAND_LABEL,
    model: detected.model.trim() || UNKNOWN_MODEL_LABEL,
  }
}

function normalizeRecord(record: ValidationRecord): ValidationRecord {
  const perspectives = getRecordPerspectives(record)
  const spriteUrl = record.spriteUrl ?? (isSpritePath(record.image) ? record.image : undefined)
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

function repairRecordsWithBaseline(
  parsed: ValidationRecord[] | null,
  baseline: ValidationRecord[],
  displayCatalog: DisplayCatalog,
): ValidationRecord[] {
  if (!parsed?.length) return baseline

  const storedMap = new Map(parsed.map((record) => [record.personId, record]))

  return baseline.map((demo) => {
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
        hiddenSlotIndexes: stored.hiddenSlotIndexes,
        hiddenFromView: stored.hiddenFromView,
      }),
      displayCatalog,
    )
  })
}

function clearStoredSession(eventId: string) {
  localStorage.removeItem(storageKey(eventId))
  localStorage.removeItem(storageMetaKey(eventId))
}

function loadLocalSession(
  race: RaceDefinition,
  assets: RaceAssets,
  displayCatalog: DisplayCatalog,
  baseline: ValidationRecord[],
): {
  records: ValidationRecord[]
  catalog: Catalog
  published: boolean
  detailIndex: number
} {
  const fallback = {
    records: baseline,
    catalog: BASE_CATALOG,
    published: false,
    detailIndex: 0,
  }
  purgeObsoleteStorage()
  try {
    const stored = localStorage.getItem(storageKey(race.eventId))
    if (!stored) return fallback
    // Un dump de ~11k recortes supera la cuota y tumba la pestaña al parsear.
    if (stored.length > 1_500_000 && stored.trimStart().startsWith('[')) {
      clearStoredSession(race.eventId)
      return fallback
    }
    const parsed = JSON.parse(stored) as ValidationRecord[] | ValidationSessionSnapshot
    if (Array.isArray(parsed)) {
      if (parsed.length > 2500) {
        clearStoredSession(race.eventId)
        return fallback
      }
      if (isStoredSessionValid(parsed, race, assets)) {
        return { ...fallback, records: repairRecordsWithBaseline(parsed, baseline, displayCatalog) }
      }
      clearStoredSession(race.eventId)
      return fallback
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.eventId === race.eventId &&
      parsed.sessionEpoch === race.sessionEpoch &&
      parsed.decisions
    ) {
      const applied = applySessionSnapshot(parsed, baseline)
      return {
        records: applied.records,
        catalog: mergeCatalogs(BASE_CATALOG, applied.catalog),
        published: ownPublished(applied.published),
        detailIndex: applied.detailIndex,
      }
    }
    clearStoredSession(race.eventId)
  } catch {
    clearStoredSession(race.eventId)
  }
  return fallback
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

function initialEventId() {
  return readStoredEventId()
}

export function useValidationStore() {
  const [eventId, setEventIdState] = useState(initialEventId)
  const race = useMemo(() => getRace(eventId), [eventId])
  const [assets, setAssets] = useState<RaceAssets | null>(() =>
    initialEventId() === DEFAULT_EVENT_ID ? HOMENAJE_ASSETS : null,
  )
  const [catalog, setCatalog] = useState<Catalog>(catalogData as Catalog)
  const displayCatalog = useMemo(() => buildDisplayCatalog(catalog), [catalog])
  const baselineRef = useRef<ValidationRecord[]>(
    initialEventId() === DEFAULT_EVENT_ID
      ? createRecordsForRace(getRace(DEFAULT_EVENT_ID), HOMENAJE_ASSETS)
      : [],
  )
  const [records, setRecords] = useState<ValidationRecord[]>(() => {
    if (initialEventId() !== DEFAULT_EVENT_ID) return []
    const homenaje = getRace(DEFAULT_EVENT_ID)
    const baseline = createRecordsForRace(homenaje, HOMENAJE_ASSETS)
    return loadLocalSession(homenaje, HOMENAJE_ASSETS, buildDisplayCatalog(catalogData as Catalog), baseline).records
  })
  const [published, setPublishedState] = useState(false)
  const [detailIndex, setDetailIndex] = useState(0)
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([])
  const [sessionDirty, setSessionDirty] = useState(false)
  const [sessionSaveState, setSessionSaveState] = useState<SessionSaveState>('idle')
  const [sessionSaveError, setSessionSaveError] = useState<string | null>(null)
  const [loadedMosaicUi, setLoadedMosaicUi] = useState<MosaicUiState | null>(null)
  const [remoteSessionEnabled] = useState(() => isRemoteSessionEnabled())
  const [raceLoading, setRaceLoading] = useState(() => initialEventId() !== DEFAULT_EVENT_ID)
  const [raceError, setRaceError] = useState<string | null>(null)
  const raceRef = useRef(race)
  const assetsRef = useRef(assets)
  raceRef.current = race
  assetsRef.current = assets

  const summary = useMemo(() => summarize(records, displayCatalog), [records, displayCatalog])
  const validationRun = useMemo(() => raceValidationRun(race, published), [race, published])

  const markSessionDirty = useCallback(() => {
    setSessionDirty(true)
    setSessionSaveState('idle')
    setSessionSaveError(null)
  }, [])

  const setPublished = useCallback((value: boolean) => {
    if (value && !canPublish()) return
    setPublishedState(ownPublished(value))
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
    setActiveEventId(eventId)
  }, [eventId])

  useEffect(() => {
    if (raceLoading || !assets || records.length === 0) return
    if (records.length !== baselineRef.current.length) return
    try {
      const snapshot = buildSessionSnapshot({
        records,
        catalog,
        ui: null,
        published,
        detailIndex,
        race,
        baseline: baselineRef.current,
      })
      const payload = JSON.stringify(snapshot)
      if (payload.length > 4_000_000) {
        localStorage.setItem(storageKey(eventId), JSON.stringify({ ...snapshot, catalog: {} }))
      } else {
        localStorage.setItem(storageKey(eventId), payload)
      }
      writeStorageMeta(race, assets)
    } catch {
      /* quota / private mode: la sesión remota sigue siendo la fuente de verdad */
    }
  }, [assets, catalog, detailIndex, eventId, published, race, raceLoading, records])

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
    const actor = decisionActor(raceRef.current)
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
            actor,
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

  /** Oculta el recorte completo del mosaico/dashboard (p. ej. selección en mosaico). */
  const hideCrops = (ids: Iterable<string>, method: DecisionMethod = 'bulk_mosaic') => {
    pushUndo()
    markSessionDirty()
    const idSet = new Set(ids)
    const decidedAt = new Date().toISOString()
    const actor = decisionActor(raceRef.current)
    setRecords((current) =>
      current.map((record) => {
        if (!idSet.has(record.personId)) return record
        return {
          ...record,
          hiddenFromView: true,
          includedInReport: false,
          decision: {
            actor,
            decidedAt,
            method,
            note: 'removed_crop',
          },
        }
      }),
    )
  }

  /**
   * Quita una perspectiva del sprite. Si era la última visible, oculta el recorte entero.
   * remainingVisibleAfterRemove = cuántas vistas quedarían tras quitar esta.
   */
  const removePerspective = (
    personId: string,
    slotIndex: number,
    remainingVisibleAfterRemove: number,
    method: DecisionMethod = 'individual',
  ) => {
    pushUndo()
    markSessionDirty()
    const decidedAt = new Date().toISOString()
    const hideAll = remainingVisibleAfterRemove <= 0
    const actor = decisionActor(raceRef.current)
    setRecords((current) =>
      current.map((record) => {
        if (record.personId !== personId) return record
        const hiddenSlotIndexes = [...new Set([...(record.hiddenSlotIndexes ?? []), slotIndex])]
        return {
          ...record,
          hiddenSlotIndexes,
          hiddenFromView: hideAll ? true : record.hiddenFromView,
          includedInReport: hideAll ? false : record.includedInReport,
          decision: {
            actor,
            decidedAt,
            method,
            note: hideAll ? 'removed_crop' : 'removed_perspective',
          },
        }
      }),
    )
  }

  const correctBrand = (ids: Iterable<string>, brand: string, method: DecisionMethod = 'bulk_mosaic') => {
    pushUndo()
    markSessionDirty()
    const nextCatalog = ensureCatalogEntry(catalog, brand)
    setCatalog(nextCatalog)
    const nextDisplayCatalog = buildDisplayCatalog(nextCatalog)
    const idSet = new Set(ids)
    const actor = decisionActor(raceRef.current)
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
            actor,
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

  const applyLocalRace = useCallback((nextRace: RaceDefinition, nextAssets: RaceAssets, reset = false) => {
    const baseline = createRecordsForRace(nextRace, nextAssets)
    baselineRef.current = baseline
    assetsRef.current = nextAssets
    raceRef.current = nextRace
    const display = buildDisplayCatalog(BASE_CATALOG)
    const loaded = reset
      ? { records: baseline, catalog: BASE_CATALOG, published: false, detailIndex: 0 }
      : loadLocalSession(nextRace, nextAssets, display, baseline)
    setAssets(nextAssets)
    setCatalog(loaded.catalog)
    setRecords(loaded.records)
    setPublishedState(loaded.published)
    setDetailIndex(loaded.detailIndex)
    setUndoStack([])
    setLoadedMosaicUi(null)
    setSessionDirty(false)
    setSessionSaveState('idle')
    setSessionSaveError(null)
    return loaded.records
  }, [])

  const loadRemoteSession = useCallback(async (): Promise<boolean> => {
    if (!remoteSessionEnabled) return false
    const currentRace = raceRef.current
    const currentAssets = assetsRef.current
    const baseline = baselineRef.current
    if (!currentAssets || !baseline.length) return false
    try {
      const snapshot = await fetchValidationSession(currentRace.eventId)
      if (!snapshot || !isSnapshotCompatible(snapshot, currentRace)) return false
      const applied = applySessionSnapshot(snapshot, baseline)
      const nextCatalog = mergeCatalogs(BASE_CATALOG, applied.catalog)
      setCatalog(nextCatalog)
      setRecords(syncRecords(applied.records, buildDisplayCatalog(nextCatalog)))
      setPublishedState(ownPublished(applied.published))
      setDetailIndex(applied.detailIndex)
      setLoadedMosaicUi(applied.ui)
      setSessionDirty(false)
      setSessionSaveState('saved')
      setSessionSaveError(null)
      return true
    } catch (err) {
      setSessionSaveError(err instanceof Error ? err.message : 'No se pudo cargar la sesión')
      setSessionSaveState('error')
      return false
    }
  }, [remoteSessionEnabled])

  const hydrateRace = useCallback(async (targetId: string, reset = false) => {
    const nextRace = getRace(targetId)
    raceRef.current = nextRace
    setRaceLoading(true)
    setRaceError(null)
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
      const nextAssets = await loadRaceAssets(nextRace.eventId)
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0)
      })
      applyLocalRace(nextRace, nextAssets, reset)
    } catch (err) {
      setRaceError(err instanceof Error ? err.message : 'No se pudo cargar la carrera')
    } finally {
      setRaceLoading(false)
    }
  }, [applyLocalRace])

  useEffect(() => {
    if (initialEventId() === DEFAULT_EVENT_ID) return
    void hydrateRace(initialEventId())
    // Solo hidrata una carrera no-Homenaje al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectEvent = useCallback(async (nextId: string) => {
    const next = getRace(nextId).eventId
    if (next === eventId) return
    if (raceLoading) return
    if (sessionDirty && remoteSessionEnabled) {
      const ok = window.confirm(
        'Hay cambios sin guardar en el servidor. El dashboard de resultados no los verá hasta que guardes. ¿Cambiar de carrera de todas formas?',
      )
      if (!ok) return
    }
    storeEventId(next)
    setRaceLoading(true)
    setRecords([])
    setLoadedMosaicUi(null)
    clearSpriteAnalysisCache()
    setEventIdState(next)
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0)
    })
    await hydrateRace(next)
  }, [eventId, hydrateRace, raceLoading, remoteSessionEnabled, sessionDirty])

  const resetSession = () => {
    const currentRace = raceRef.current
    const currentAssets = assetsRef.current
    purgeObsoleteStorage()
    clearSpriteAnalysisCache()
    clearStoredSession(currentRace.eventId)
    if (currentAssets) {
      applyLocalRace(currentRace, currentAssets, true)
    }
    if (remoteSessionEnabled) {
      void deleteValidationSession(currentRace.eventId).catch(() => undefined)
    }
  }

  const saveRemoteSession = useCallback(async (ui: MosaicUiState | null, publishedOverride?: boolean) => {
    if (!remoteSessionEnabled) return
    const currentRace = raceRef.current
    const nextPublished = ownPublished(publishedOverride ?? published)
    setSessionSaveState('saving')
    setSessionSaveError(null)
    try {
      const snapshot = buildSessionSnapshot({
        records,
        catalog,
        ui,
        published: nextPublished,
        detailIndex,
        race: currentRace,
        baseline: baselineRef.current,
      })
      await putValidationSession(currentRace.eventId, snapshot)
      setPublishedState(nextPublished)
      setSessionDirty(false)
      setSessionSaveState('saved')
    } catch (err) {
      setSessionSaveState('error')
      setSessionSaveError(err instanceof Error ? err.message : 'No se pudo guardar')
      throw err
    }
  }, [catalog, detailIndex, published, records, remoteSessionEnabled])

  const publishSession = useCallback(async (value: boolean, ui: MosaicUiState | null) => {
    if (!canPublish()) throw new Error('Solo un administrador puede publicar')
    const previous = published
    setPublishedState(value)
    if (!remoteSessionEnabled) {
      markSessionDirty()
      return
    }
    try {
      await saveRemoteSession(ui, value)
    } catch (err) {
      setPublishedState(previous)
      throw err
    }
  }, [markSessionDirty, published, remoteSessionEnabled, saveRemoteSession])

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
    publishSession,
    summary,
    detailIndex,
    setDetailIndex: setDetailIndexTracked,
    approveRecords,
    discardRecords,
    hideCrops,
    removePerspective,
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
    race,
    races: RACES,
    eventId: race.eventId,
    selectEvent,
    raceLoading,
    raceError,
    spriteCount: assets?.spriteFiles.length ?? records.length,
  }
}
