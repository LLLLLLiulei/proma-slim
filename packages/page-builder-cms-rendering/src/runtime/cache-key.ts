import type {
  PageBuilderCmsCatalogQuery,
  PageBuilderCmsContentQuery,
} from '@proma/shared'

export function createCatalogQueryCacheKey(query: PageBuilderCmsCatalogQuery = {}): string {
  return serializeCacheKey('catalogs', {
    ...(query as Record<string, unknown>),
    contentType: normalizeOptionalString(query.contentType),
    searchKeyword: normalizeOptionalString(query.searchKeyword),
  })
}

export function createContentQueryCacheKey(query: PageBuilderCmsContentQuery): string {
  return serializeCacheKey('contents', {
    ...(query as Record<string, unknown>),
    keyword: normalizeOptionalString(query.keyword),
  })
}

type CacheKeyValue =
  | null
  | boolean
  | number
  | string
  | CacheKeyValue[]
  | { [key: string]: CacheKeyValue }

function serializeCacheKey(
  scope: 'catalogs' | 'contents',
  payload: Record<string, unknown>,
): string {
  return JSON.stringify([scope, normalizeCacheObject(payload)])
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

function normalizeCacheObject(value: Record<string, unknown>): Record<string, CacheKeyValue> {
  return (normalizeCacheValue(value) as Record<string, CacheKeyValue> | undefined) ?? {}
}

function normalizeCacheValue(value: unknown): CacheKeyValue | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const normalizedItem = normalizeCacheValue(item)
      return normalizedItem === undefined ? [] : [normalizedItem]
    })
  }

  if (isPlainObject(value)) {
    const normalizedEntries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, entryValue]) => {
        const normalizedEntryValue = normalizeCacheValue(entryValue)
        return normalizedEntryValue === undefined ? [] : [[key, normalizedEntryValue] as const]
      })

    return Object.fromEntries(normalizedEntries)
  }

  return String(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}
