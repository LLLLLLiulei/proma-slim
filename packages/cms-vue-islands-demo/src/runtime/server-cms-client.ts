import { demoCatalogs, demoContents } from '../mock/mock-cms-data'
import type { CmsRuntimeClient } from './cms-runtime-client'
import { mapCatalogToViewModel, mapContentToViewModel, normalizeLevel, toPositiveNumber } from './view-models'

export const DEFAULT_MOCK_CMS_DELAY_MIN_MS = 200
export const DEFAULT_MOCK_CMS_DELAY_MAX_MS = 800

export interface MockCmsClientDelayOptions {
  minMs?: number
  maxMs?: number
  random?: () => number
}

export interface MockServerCmsClientOptions {
  delay?: false | MockCmsClientDelayOptions
}

function includesIgnoreCase(source: string, needle: string): boolean {
  return source.toLowerCase().includes(needle.trim().toLowerCase())
}

function normalizeDelayRange(delay: MockCmsClientDelayOptions | undefined): { minMs: number; maxMs: number } {
  const minMs = Math.max(0, Math.floor(delay?.minMs ?? DEFAULT_MOCK_CMS_DELAY_MIN_MS))
  const maxMs = Math.max(minMs, Math.floor(delay?.maxMs ?? DEFAULT_MOCK_CMS_DELAY_MAX_MS))

  return { minMs, maxMs }
}

function resolveDelayMs(delay: MockCmsClientDelayOptions | undefined): number {
  const { minMs, maxMs } = normalizeDelayRange(delay)
  const random = delay?.random ?? Math.random

  if (minMs === maxMs) {
    return minMs
  }

  return Math.round(minMs + (maxMs - minMs) * random())
}

async function applyArtificialDelay(delay: false | MockCmsClientDelayOptions | undefined): Promise<void> {
  if (delay === false) {
    return
  }

  const delayMs = resolveDelayMs(delay)
  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

export function createMockServerCmsClient(options?: MockServerCmsClientOptions): CmsRuntimeClient {
  const delay = options?.delay

  return {
    async listCatalogs(query = {}) {
      await applyArtificialDelay(delay)

      let items = demoCatalogs.map(mapCatalogToViewModel)

      if (query.contentType) {
        items = items.filter((item) => item.contentType === query.contentType)
      }

      if (query.searchKeyword) {
        items = items.filter((item) => includesIgnoreCase(item.name, query.searchKeyword as string))
      }

      const level = normalizeLevel(query.level)
      if (level === 'root') {
        items = items.filter((item) => item.parentId === null)
      } else if (level === 'children') {
        items = items.filter((item) => item.parentId !== null)
      }

      if (query.parentId) {
        items = items.filter((item) => item.parentId === query.parentId)
      }

      const take = toPositiveNumber(query.take)
      if (take) {
        items = items.slice(0, take)
      }

      return { items }
    },

    async listContents(query) {
      await applyArtificialDelay(delay)

      let items = demoContents
        .filter((item) => item.catalogId === query.catalogId)
        .filter((item) => (query.keyword ? includesIgnoreCase(item.summary, query.keyword) : true))
        .filter((item) => (query.title ? includesIgnoreCase(item.title, query.title) : true))

      const sortMode = (query.contentSelectType ?? 'Recent').toLowerCase()
      items = [...items].sort((left, right) => {
        if (sortMode === 'hot') {
          return right.hotScore - left.hotScore
        }

        return right.addedAt.localeCompare(left.addedAt)
      })

      const pageSize = toPositiveNumber(query.pageSize) ?? items.length
      const pageIndex = toPositiveNumber(query.pageIndex) ?? 1
      const startIndex = (pageIndex - 1) * pageSize
      const pagedItems = items.slice(startIndex, startIndex + pageSize).map(mapContentToViewModel)

      return {
        items: pagedItems,
        total: items.length,
      }
    },
  }
}
