import type { Catalog } from '../types'

const DISPLAY_NAMES: Record<string, string> = {
  newbalance: 'New Balance',
  underarmour: 'Under Armour',
  thenorthface: 'The North Face',
  topoathletic: 'Topo Athletic',
}

const KEY_BY_DISPLAY: Record<string, string> = Object.fromEntries(
  Object.entries(DISPLAY_NAMES).map(([key, label]) => [label, key]),
)

export const BRAND_COLORS: Record<string, string> = {
  Adidas: 'var(--adidas)',
  Nike: 'var(--nike)',
  Asics: 'var(--asics)',
  'New Balance': 'var(--nb)',
  Puma: 'var(--puma)',
  Hoka: 'var(--hoka)',
  On: 'var(--on)',
  Brooks: 'var(--brooks)',
  Saucony: 'var(--saucony)',
}

const EXTRA_COLORS = ['#C0567E', '#5B8C5A', '#7A5CC0', '#B0862F', '#3B93B0', '#C25B3A']
const dynamicColors: Record<string, string> = {}
let colorIndex = 0

export function catalogKeyToLabel(key: string) {
  if (DISPLAY_NAMES[key]) return DISPLAY_NAMES[key]
  return key.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function labelToCatalogKey(label: string) {
  if (KEY_BY_DISPLAY[label]) return KEY_BY_DISPLAY[label]
  return label.toLowerCase().replaceAll(' ', '-')
}

export const UNKNOWN_BRAND_LABEL = 'Sin marca'
export const UNKNOWN_MODEL_LABEL = 'Sin modelo'

export function normalizeBrandLabel(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return UNKNOWN_BRAND_LABEL
  return catalogKeyToLabel(labelToCatalogKey(trimmed))
}

export function modelKeyToLabel(model: string) {
  return model.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

/** Mismo criterio que el dashboard: sin generación (Pro 4 → Pro, trailing 12 → strip). */
export function displayModelName(raw: string): string {
  let name = normalizeModelLabel(raw)
  if (name === UNKNOWN_MODEL_LABEL) return name
  name = name.replace(/\s+Pro\s+\d+$/i, ' Pro')
  const parts = name.split(/\s+/)
  const last = parts[parts.length - 1] ?? ''
  if (/^\d{1,2}$/.test(last) && parts.length > 1) {
    parts.pop()
    name = parts.join(' ')
  }
  return name
}

export function normalizeModelLabel(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return UNKNOWN_MODEL_LABEL
  return modelKeyToLabel(trimmed.toLowerCase().replaceAll(' ', '-'))
}

export function brandColor(brand: string) {
  if (BRAND_COLORS[brand]) return BRAND_COLORS[brand]
  if (!dynamicColors[brand]) {
    dynamicColors[brand] = EXTRA_COLORS[colorIndex % EXTRA_COLORS.length]
    colorIndex += 1
  }
  return dynamicColors[brand]
}

export function buildDisplayCatalog(catalog: Catalog) {
  const display: Record<string, string[]> = {}
  for (const [brandKey, models] of Object.entries(catalog)) {
    const labels = [...new Set(models.map((model) => displayModelName(modelKeyToLabel(model))))]
      .filter((label) => label !== UNKNOWN_MODEL_LABEL)
      .sort((a, b) => a.localeCompare(b, 'es'))
    display[catalogKeyToLabel(brandKey)] = labels
  }
  return display
}

export function mergeCatalogs(...catalogs: Catalog[]): Catalog {
  const next: Catalog = {}
  for (const catalog of catalogs) {
    for (const [brand, models] of Object.entries(catalog)) {
      const set = new Set(next[brand] ?? [])
      for (const model of models) set.add(model)
      next[brand] = [...set].sort((a, b) => a.localeCompare(b))
    }
  }
  return next
}

export function ensureCatalogEntry(catalog: Catalog, brandLabel: string, modelLabel?: string) {
  const brandKey = labelToCatalogKey(brandLabel)
  const next = { ...catalog }
  if (!next[brandKey]) next[brandKey] = []
  if (modelLabel) {
    const modelKey = displayModelName(modelLabel).toLowerCase().replaceAll(' ', '-')
    if (!next[brandKey].includes(modelKey)) {
      next[brandKey] = [...next[brandKey], modelKey]
    }
  }
  return next
}
