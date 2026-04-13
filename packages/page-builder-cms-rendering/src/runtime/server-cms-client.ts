import type {
  PageBuilderCmsCatalogList,
  PageBuilderCmsCatalogQuery,
  PageBuilderCmsContentList,
  PageBuilderCmsContentQuery,
} from '@proma/shared'
import type { CmsRuntimeClient } from './cms-runtime-client'
import { createCatalogQueryCacheKey, createContentQueryCacheKey } from './cache-key'
import {
  createCmsRuntimePrefetchCache,
  type CmsRuntimePrefetchCache,
} from './prefetch-cache'

export interface ServerCmsClientAdapter {
  listCatalogs(query?: PageBuilderCmsCatalogQuery): Promise<PageBuilderCmsCatalogList>
  listContents(query: PageBuilderCmsContentQuery): Promise<PageBuilderCmsContentList>
}

export interface ServerCmsClientOptions {
  adapter: ServerCmsClientAdapter
  cache?: CmsRuntimePrefetchCache
}

export function createServerCmsClient(options: ServerCmsClientOptions): CmsRuntimeClient {
  const cache = options.cache ?? createCmsRuntimePrefetchCache()

  return {
    listCatalogs(query = {}) {
      return cache.getOrLoad(createCatalogQueryCacheKey(query), () => options.adapter.listCatalogs(query))
    },
    listContents(query) {
      return cache.getOrLoad(createContentQueryCacheKey(query), () => options.adapter.listContents(query))
    },
  }
}
