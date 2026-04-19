import type {
  PageBuilderCmsCatalog,
  PageBuilderCmsCatalogQuery,
  PageBuilderCmsContentQuery,
} from '@proma/shared/types/page-builder-cms'
import { inject, type Slots } from 'vue'
import { CMS_AUTHORING_RUNTIME_DEFAULT_SITE_ID } from '../cms-authoring-runtime-contract'
import { CMS_RUNTIME_CLIENT_KEY, type CmsRuntimeClient, type CmsSlotError, type CmsSlotScope } from '../runtime/cms-runtime-client'

export interface CatalogDisplayOptions {
  level?: 'root' | 'children'
  parentId?: string
  take?: number
}

const DEFAULT_CMS_SITE_ID = CMS_AUTHORING_RUNTIME_DEFAULT_SITE_ID

export function createCatalogQuery(props: Record<string, unknown>): PageBuilderCmsCatalogQuery {
  const ids = normalizeOrderedIds(props.ids)

  return {
    siteId: normalizeCmsSiteId(props.siteId),
    ids,
    contentType: ids ? undefined : normalizeOptionalString(props.contentType),
    searchKeyword: ids ? undefined : normalizeOptionalString(props.searchKeyword),
  }
}

export function createCatalogDisplayOptions(props: Record<string, unknown>): CatalogDisplayOptions {
  return {
    level: normalizeCatalogLevel(props.level),
    parentId: normalizeOptionalString(props.parentId),
    take: normalizePositiveInteger(props.take),
  }
}

export function createContentQuery(props: Record<string, unknown>): PageBuilderCmsContentQuery {
  const ids = normalizeOrderedIds(props.ids)
  const catalogId = normalizeOptionalString(props.catalogId)

  return {
    siteId: normalizeCmsSiteId(props.siteId),
    catalogId,
    ids,
    keyword: ids ? undefined : normalizeOptionalString(props.keyword),
    pageIndex: ids ? undefined : normalizeNonNegativeInteger(props.pageIndex),
    pageSize: ids ? undefined : normalizePositiveInteger(props.pageSize),
  }
}

export function assertValidCatalogSource(props: Record<string, unknown>): void {
  const ids = normalizeOrderedIds(props.ids)

  if (!ids) {
    return
  }

  if (
    normalizeOptionalString(props.level)
    || normalizeOptionalString(props.parentId)
    || normalizeOptionalString(props.contentType)
    || normalizeOptionalString(props.searchKeyword)
    || normalizePositiveInteger(props.take) !== undefined
  ) {
    throw new Error('cms-catalog ids cannot be combined with query props')
  }
}

export function assertValidContentSource(props: Record<string, unknown>): void {
  const ids = normalizeOrderedIds(props.ids)
  const catalogId = normalizeOptionalString(props.catalogId)

  if (!catalogId) {
    throw new Error(ids ? 'cms-content ids require catalog-id' : 'cms-content requires catalog-id')
  }

  if (
    ids
    && (
      normalizeOptionalString(props.keyword)
      || normalizeNonNegativeInteger(props.pageIndex) !== undefined
      || normalizePositiveInteger(props.pageSize) !== undefined
    )
  ) {
    throw new Error('cms-content ids cannot be combined with query props')
  }
}

export function selectCatalogNodes(
  tree: PageBuilderCmsCatalog[],
  options: CatalogDisplayOptions,
): PageBuilderCmsCatalog[] {
  let items = tree

  if (options.level === 'children') {
    items = options.parentId ? findCatalogChildren(tree, options.parentId) : []
  }

  if (options.take !== undefined) {
    items = items.slice(0, options.take)
  }

  return items
}

export function useInjectedCmsClient(): CmsRuntimeClient {
  const client = inject(CMS_RUNTIME_CLIENT_KEY, null)
  if (!client) {
    throw new Error('Missing CMS runtime client')
  }

  return client
}

export function createSlotScope<TItem>(
  items: TItem[],
  loading: boolean,
  error: CmsSlotError | null,
): CmsSlotScope<TItem> {
  return {
    items,
    loading,
    error,
    empty: !loading && items.length === 0,
  }
}

export function renderCmsSlot<TItem>(scope: CmsSlotScope<TItem>, slots: Slots) {
  if (scope.error) {
    if (slots.error) {
      return slots.error(scope)
    }

    if (slots.default) {
      return slots.default(scope)
    }

    if (slots.empty) {
      return slots.empty(scope)
    }

    return null
  }

  if (scope.empty && slots.empty) {
    return slots.empty(scope)
  }

  if (slots.default) {
    return slots.default(scope)
  }

  return null
}

function normalizeCatalogLevel(value: unknown): CatalogDisplayOptions['level'] {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'root' || normalized === 'children') {
    return normalized
  }

  return undefined
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized ? normalized : undefined
}

function normalizeCmsSiteId(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return normalizeOptionalString(value) ?? DEFAULT_CMS_SITE_ID
}

function normalizeOrderedIds(value: unknown): string[] | undefined {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []

  if (values.length === 0) {
    return undefined
  }

  const normalized = values
    .map((entry) => typeof entry === 'string' ? entry.trim() : String(entry).trim())
    .filter(Boolean)

  return normalized.length > 0 ? normalized : undefined
}

function normalizePositiveInteger(value: unknown): number | undefined {
  const numberValue = normalizeInteger(value)

  if (numberValue !== undefined && numberValue > 0) {
    return numberValue
  }

  return undefined
}

function normalizeNonNegativeInteger(value: unknown): number | undefined {
  const numberValue = normalizeInteger(value)

  if (numberValue !== undefined && numberValue >= 0) {
    return numberValue
  }

  return undefined
}

function normalizeInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim()
    if (!/^\d+$/.test(normalized)) {
      return undefined
    }

    return Number.parseInt(normalized, 10)
  }

  return undefined
}

function findCatalogChildren(
  items: PageBuilderCmsCatalog[],
  parentId: string,
): PageBuilderCmsCatalog[] {
  for (const item of items) {
    if (item.id === parentId) {
      return item.children
    }

    const nested = findCatalogChildren(item.children, parentId)
    if (nested.length > 0) {
      return nested
    }
  }

  return []
}
