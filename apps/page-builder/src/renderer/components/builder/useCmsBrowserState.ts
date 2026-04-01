import * as React from 'react'
import type {
  PageBuilderCmsCatalog,
  PageBuilderCmsCatalogDetail,
  PageBuilderCmsCatalogList,
  PageBuilderCmsContentList,
} from '@proma/shared'
import { api } from '@/lib/api'

export type CmsBrowserTab = 'catalogs' | 'contents'

export interface CmsAsyncState<T> {
  status: 'idle' | 'loading' | 'ready' | 'error'
  data: T | null
  errorMessage: string | null
}

interface UseCmsBrowserStateOptions {
  open: boolean
}

interface UseCmsBrowserStateResult {
  activeTab: CmsBrowserTab
  catalogsState: CmsAsyncState<PageBuilderCmsCatalogList>
  catalogDetailState: CmsAsyncState<PageBuilderCmsCatalogDetail>
  contentsState: CmsAsyncState<PageBuilderCmsContentList>
  contentsPageIndex: number
  contentsPageSize: number
  expandedKeys: string[]
  selectedCatalogId: string | null
  setActiveTab: (value: CmsBrowserTab) => void
  setContentsPage: (page: number, pageSize?: number) => void
  setExpandedKeys: (keys: string[]) => void
  setSelectedCatalogId: (catalogId: string) => void
  retryCatalogDetail: () => void
  retryCatalogs: () => void
  retryContents: () => void
}

const DEFAULT_CONTENTS_PAGE_SIZE = 6

function createIdleState<T>(): CmsAsyncState<T> {
  return {
    status: 'idle',
    data: null,
    errorMessage: null,
  }
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback
}

function findFirstCatalogId(catalogs: PageBuilderCmsCatalog[]): string | null {
  for (const catalog of catalogs) {
    if (catalog.id) {
      return catalog.id
    }

    const childId = findFirstCatalogId(catalog.children)
    if (childId) {
      return childId
    }
  }

  return null
}

function findInitialExpandedKeys(catalogs: PageBuilderCmsCatalog[]): string[] {
  const [firstRoot] = catalogs
  return firstRoot?.id ? [firstRoot.id] : []
}

export function useCmsBrowserState(options: UseCmsBrowserStateOptions): UseCmsBrowserStateResult {
  const { open } = options
  const [activeTab, setActiveTabState] = React.useState<CmsBrowserTab>('catalogs')
  const [catalogsState, setCatalogsState] = React.useState<CmsAsyncState<PageBuilderCmsCatalogList>>(() => createIdleState())
  const [catalogDetailState, setCatalogDetailState] = React.useState<CmsAsyncState<PageBuilderCmsCatalogDetail>>(() => createIdleState())
  const [contentsState, setContentsState] = React.useState<CmsAsyncState<PageBuilderCmsContentList>>(() => createIdleState())
  const [selectedCatalogId, setSelectedCatalogIdState] = React.useState<string | null>(null)
  const [contentsPageIndex, setContentsPageIndex] = React.useState(0)
  const [contentsPageSize, setContentsPageSize] = React.useState(DEFAULT_CONTENTS_PAGE_SIZE)
  const [expandedKeys, setExpandedKeys] = React.useState<string[]>([])
  const catalogDetailCacheRef = React.useRef(new Map<string, PageBuilderCmsCatalogDetail>())
  const contentCacheRef = React.useRef(new Map<string, PageBuilderCmsContentList>())

  const getContentCacheKey = React.useCallback((catalogId: string, pageIndex: number, pageSize: number) => (
    `${catalogId}:${pageIndex}:${pageSize}`
  ), [])

  const ensureCatalogsLoaded = React.useCallback(async (force = false) => {
    if (!open) return
    if (!force && (catalogsState.status === 'loading' || catalogsState.status === 'ready')) {
      return
    }

    setCatalogsState((previous) => ({
      status: 'loading',
      data: previous.data,
      errorMessage: null,
    }))

    try {
      const result = await api.listPageBuilderCmsCatalogs()
      setCatalogsState({
        status: 'ready',
        data: result,
        errorMessage: null,
      })

      setExpandedKeys((previous) => previous.length > 0 ? previous : findInitialExpandedKeys(result.tree))
      setSelectedCatalogIdState((previous) => previous ?? findFirstCatalogId(result.tree))
    } catch (error) {
      setCatalogsState({
        status: 'error',
        data: null,
        errorMessage: toErrorMessage(error, '加载 CMS 栏目失败'),
      })
    }
  }, [catalogsState.status, open])

  const ensureContentsLoaded = React.useCallback(async (
    catalogId: string,
    pageIndex: number,
    pageSize: number,
    force = false,
  ) => {
    if (!open) return

    const cacheKey = getContentCacheKey(catalogId, pageIndex, pageSize)

    if (!force) {
      const cached = contentCacheRef.current.get(cacheKey)
      if (cached) {
        setContentsState({
          status: 'ready',
          data: cached,
          errorMessage: null,
        })
        return
      }
    }

    setContentsState({
      status: 'loading',
      data: null,
      errorMessage: null,
    })

    try {
      const result = await api.listPageBuilderCmsContents({ catalogId, pageIndex, pageSize })
      contentCacheRef.current.set(cacheKey, result)
      setContentsState({
        status: 'ready',
        data: result,
        errorMessage: null,
      })
    } catch (error) {
      setContentsState({
        status: 'error',
        data: null,
        errorMessage: toErrorMessage(error, '加载 CMS 内容失败'),
      })
    }
  }, [getContentCacheKey, open])

  const ensureCatalogDetailLoaded = React.useCallback(async (catalogId: string, force = false) => {
    if (!open) return

    if (!force) {
      const cached = catalogDetailCacheRef.current.get(catalogId)
      if (cached) {
        setCatalogDetailState({
          status: 'ready',
          data: cached,
          errorMessage: null,
        })
        return
      }
    }

    setCatalogDetailState({
      status: 'loading',
      data: null,
      errorMessage: null,
    })

    try {
      const result = await api.getPageBuilderCmsCatalogDetail(catalogId)
      catalogDetailCacheRef.current.set(catalogId, result)
      setCatalogDetailState({
        status: 'ready',
        data: result,
        errorMessage: null,
      })
    } catch (error) {
      setCatalogDetailState({
        status: 'error',
        data: null,
        errorMessage: toErrorMessage(error, '加载 CMS 栏目详情失败'),
      })
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return
    setActiveTabState('catalogs')
    if (catalogsState.status === 'idle') {
      void ensureCatalogsLoaded()
    }
  }, [catalogsState.status, ensureCatalogsLoaded, open])

  React.useEffect(() => {
    if (!open || activeTab !== 'contents') return

    const nextCatalogId = selectedCatalogId ?? findFirstCatalogId(catalogsState.data?.tree ?? [])
    if (!nextCatalogId) return

    if (nextCatalogId !== selectedCatalogId) {
      setSelectedCatalogIdState(nextCatalogId)
      return
    }

    void ensureContentsLoaded(nextCatalogId, contentsPageIndex, contentsPageSize)
  }, [
    activeTab,
    catalogsState.data,
    contentsPageIndex,
    contentsPageSize,
    ensureContentsLoaded,
    open,
    selectedCatalogId,
  ])

  React.useEffect(() => {
    if (!open || activeTab !== 'catalogs' || !selectedCatalogId) return
    void ensureCatalogDetailLoaded(selectedCatalogId)
  }, [activeTab, ensureCatalogDetailLoaded, open, selectedCatalogId])

  const setActiveTab = React.useCallback((value: CmsBrowserTab) => {
    setActiveTabState(value)

    if (value !== 'contents') {
      return
    }

    setSelectedCatalogIdState((previous) => previous ?? findFirstCatalogId(catalogsState.data?.tree ?? []))
  }, [catalogsState.data])

  const setSelectedCatalogId = React.useCallback((catalogId: string) => {
    setSelectedCatalogIdState((previous) => previous === catalogId ? previous : catalogId)
    setContentsPageIndex(0)
  }, [])

  const setContentsPage = React.useCallback((page: number, pageSize = contentsPageSize) => {
    setContentsPageIndex(Math.max(0, page - 1))
    setContentsPageSize(pageSize)
  }, [contentsPageSize])

  const retryCatalogs = React.useCallback(() => {
    void ensureCatalogsLoaded(true)
  }, [ensureCatalogsLoaded])

  const retryCatalogDetail = React.useCallback(() => {
    if (!selectedCatalogId) return
    catalogDetailCacheRef.current.delete(selectedCatalogId)
    void ensureCatalogDetailLoaded(selectedCatalogId, true)
  }, [ensureCatalogDetailLoaded, selectedCatalogId])

  const retryContents = React.useCallback(() => {
    if (!selectedCatalogId) return
    contentCacheRef.current.delete(getContentCacheKey(
      selectedCatalogId,
      contentsPageIndex,
      contentsPageSize,
    ))
    void ensureContentsLoaded(selectedCatalogId, contentsPageIndex, contentsPageSize, true)
  }, [
    contentsPageIndex,
    contentsPageSize,
    ensureContentsLoaded,
    getContentCacheKey,
    selectedCatalogId,
  ])

  return {
    activeTab,
    catalogsState,
    catalogDetailState,
    contentsState,
    contentsPageIndex,
    contentsPageSize,
    expandedKeys,
    selectedCatalogId,
    setActiveTab,
    setContentsPage,
    setExpandedKeys,
    setSelectedCatalogId,
    retryCatalogDetail,
    retryCatalogs,
    retryContents,
  }
}
