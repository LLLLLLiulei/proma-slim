import type { DemoCatalogRecord, DemoContentRecord } from '../mock/mock-cms-data'
import type { CmsCatalogItemViewModel, CmsContentItemViewModel } from './cms-runtime-client'

export function mapCatalogToViewModel(record: DemoCatalogRecord): CmsCatalogItemViewModel {
  return {
    id: record.id,
    name: record.name,
    path: record.path,
    parentId: record.parentId,
    hasChild: record.hasChild,
    total: record.total,
    contentType: record.contentType,
    contentTypeName: record.contentTypeName,
  }
}

export function mapContentToViewModel(record: DemoContentRecord): CmsContentItemViewModel {
  return {
    id: record.id,
    catalogId: record.catalogId,
    title: record.title,
    summary: record.summary,
    publishUrl: record.publishUrl,
    listLogoUrl: record.listLogoUrl,
    addedAt: record.addedAt,
    shape: record.shape,
    assetCounts: record.assetCounts,
  }
}

export function toPositiveNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  return undefined
}

export function normalizeLevel(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'root' || normalized === 'children') {
    return normalized
  }

  return undefined
}
