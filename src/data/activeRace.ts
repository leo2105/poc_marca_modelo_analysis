import { DEFAULT_EVENT_ID, getRace, type RaceDefinition } from './races'

const STORAGE_KEY = 'len.validation.eventId'

let activeEventId = DEFAULT_EVENT_ID

export function getActiveEventId() {
  return activeEventId
}

export function getActiveRace(): RaceDefinition {
  return getRace(activeEventId)
}

export function setActiveEventId(eventId: string) {
  activeEventId = getRace(eventId).eventId
}

export function readStoredEventId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)?.trim()
    if (stored) return getRace(stored).eventId
  } catch {
    /* ignore quota / private mode */
  }
  return DEFAULT_EVENT_ID
}

export function storeEventId(eventId: string) {
  const id = getRace(eventId).eventId
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore quota / private mode */
  }
  setActiveEventId(id)
}
