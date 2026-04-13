import type {
  PageBuilderCmsCatalog,
  PageBuilderCmsCatalogQuery,
  PageBuilderCmsContentQuery,
} from '@proma/shared'
import { inject, type Slots } from 'vue'
import { CMS_RUNTIME_CLIENT_KEY, type CmsRuntimeClient, type CmsSlotError, type CmsSlotScope } from '../runtime/cms-runtime-client'

export interface CatalogDisplayOptions {
  level?: 'root' | 'children'
  parentId?: string
  take?: number
}

export function createCatalogQuery(props: Record<string, unknown>): PageBuilderCmsCatalogQuery {
  return {
    contentType: normalizeOptionalString(props.contentType),
    searchKeyword: normalizeOptionalString(props.searchKeyword),
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
  return {
    catalogId: String(props.catalogId ?? '').trim(),
    keyword: normalizeOptionalString(props.keyword),
    pageIndex: normalizeNonNegativeInteger(props.pageIndex),
    pageSize: normalizePositiveInteger(props.pageSize),
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
