import type { ValidationRun } from '../types'

export interface RaceDefinition {
  eventId: string
  eventTitle: string
  sourceRunId: string
  /** Prefijo público de sprites, sin barra final. */
  spritePrefix: string
  sessionEpoch: string
  location: string
  catalogVersion: string
  runId: string
  actor: string
}

export function raceSpritePrefix(eventId: string) {
  return `/imgs/races/${eventId}/sprites`
}

export function legacySpritePrefix(sourceRunId: string) {
  return `/imgs/sprites/${sourceRunId}`
}

export const RACES: RaceDefinition[] = [
  {
    eventId: 'carrera-homenaje-fiestas-patria',
    eventTitle: 'Carrera Homenaje Fiestas Patrias',
    sourceRunId: 'carrera_homenaje_fiestas_patria_sam3_yoloworld-onnx_pose-onnx_clip-vit-l14_384',
    spritePrefix: legacySpritePrefix('carrera_homenaje_fiestas_patria_sam3_yoloworld-onnx_pose-onnx_clip-vit-l14_384'),
    sessionEpoch: '2026-08-04-images',
    location: 'Lima, Perú',
    catalogVersion: 'catalog-2026.03',
    runId: 'val-20260804T1800-b7f2',
    actor: 'ops:leon',
  },
  {
    eventId: 'mml-21k',
    eventTitle: 'MML 21K',
    sourceRunId: 'MML_21K_cam01_010000-fin_sam3_yoloworld-onnx_pose-onnx_clip-vit-l14_384',
    spritePrefix: raceSpritePrefix('mml-21k'),
    sessionEpoch: '2026-09-01-mml-21k',
    location: 'Lima, Perú',
    catalogVersion: 'catalog-2026.03',
    runId: 'val-20260901T0000-mml21k',
    actor: 'ops:leon',
  },
  {
    eventId: 'mml-10k',
    eventTitle: 'MML 10K',
    sourceRunId: 'MML_10K_cam01_sam3_yoloworld-onnx_pose-onnx_clip-vit-l14_384',
    spritePrefix: raceSpritePrefix('mml-10k'),
    sessionEpoch: '2026-09-02-mml-10k',
    location: 'Lima, Perú',
    catalogVersion: 'catalog-2026.03',
    runId: 'val-20260902T0000-mml10k',
    actor: 'ops:leon',
  },
]

export const DEFAULT_EVENT_ID = RACES[0]!.eventId

export function getRace(eventId: string): RaceDefinition {
  return RACES.find((race) => race.eventId === eventId) ?? RACES[0]!
}

export function raceValidationRun(race: RaceDefinition, published = false): ValidationRun {
  return {
    schemaVersion: '1.0',
    eventId: race.eventId,
    runId: race.runId,
    sourceRunId: race.sourceRunId,
    catalogVersion: race.catalogVersion,
    published,
    actor: race.actor,
  }
}

export function storageKeyForEvent(eventId: string) {
  return `len-validation-${eventId}`
}

export function storageMetaKeyForEvent(eventId: string) {
  return `${storageKeyForEvent(eventId)}--meta`
}
