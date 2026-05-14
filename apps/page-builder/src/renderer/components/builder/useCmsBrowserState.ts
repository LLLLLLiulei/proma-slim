import * as React from 'react'
import type {
  PageBuilderCmsCatalog,
  PageBuilderCmsCatalogDetail,
  PageBuilderCmsCatalogList,
  PageBuilderCmsContentList,
  PageBuilderCmsSiteSummary,
} from '@ai-page-builder/shared'
import { api } from '@/lib/api'

export type CmsBrowserTab = 'catalogs' | 'contents'

export interface CmsAsyncState<T> {
  status: 'idle' | 'loading' | 'ready' | 'error'
  data: T | null
  errorMessage: string | null
}

interface UseCmsBrowserStateOptions {
  open: boolean
  workspaceId?: string | null
}

interface UseCmsBrowserStateResult {
  activeTab: CmsBrowserTab
  sitesState: CmsAsyncState<PageBuilderCmsSiteSummary[]>
  catalogsState: CmsAsyncState<PageBuilderCmsCatalogList>
  catalogDetailState: CmsAsyncState<PageBuilderCmsCatalogDetail>
  contentsState: CmsAsyncState<PageBuilderCmsContentList>
  contentsPageIndex: number
  contentsPageSize: number
  expandedKeys: string[]
  selectedSiteId: string | null
  selectedCatalogId: string | null
  setActiveTab: (value: CmsBrowserTab) => void
  setSelectedSiteId: (siteId: string) => void
  setContentsPage: (page: number, pageSize?: number) => void
  setExpandedKeys: (keys: string[]) => void
  setSelectedCatalogId: (catalogId: string) => void
  retrySites: () => void
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

function resolveDefaultSiteId(sites: PageBuilderCmsSiteSummary[]): string | null {
  if (sites.length === 0) {
    return null
  }

  return sites.find((site) => site.id === '1')?.id ?? sites[0]?.id ?? null
}

export function useCmsBrowserState(options: UseCmsBrowserStateOptions): UseCmsBrowserStateResult {
  const { open } = options
  const workspaceId = options.workspaceId?.trim() ?? ''
  const [activeTab, setActiveTabState] = React.useState<CmsBrowserTab>('catalogs')
  const [sitesState, setSitesState] = React.useState<CmsAsyncState<PageBuilderCmsSiteSummary[]>>(() => createIdleState())
  const [catalogsState, setCatalogsState] = React.useState<CmsAsyncState<PageBuilderCmsCatalogList>>(() => createIdleState())
  const [catalogDetailState, setCatalogDetailState] = React.useState<CmsAsyncState<PageBuilderCmsCatalogDetail>>(() => createIdleState())
  const [contentsState, setContentsState] = React.useState<CmsAsyncState<PageBuilderCmsContentList>>(() => createIdleState())
  const [selectedSiteId, setSelectedSiteIdState] = React.useState<string | null>(null)
  const [selectedCatalogId, setSelectedCatalogIdState] = React.useState<string | null>(null)
  const [contentsPageIndex, setContentsPageIndex] = React.useState(0)
  const [contentsPageSize, setContentsPageSize] = React.useState(DEFAULT_CONTENTS_PAGE_SIZE)
  const [expandedKeys, setExpandedKeys] = React.useState<string[]>([])
  const sitesRequestVersionRef = React.useRef(0)
  const catalogsRequestVersionRef = React.useRef(0)
  const catalogDetailRequestVersionRef = React.useRef(0)
  const contentsRequestVersionRef = React.useRef(0)
  const previousWorkspaceIdRef = React.useRef(workspaceId)

  const resetSiteScopedState = React.useCallback(() => {
    catalogsRequestVersionRef.current += 1
    catalogDetailRequestVersionRef.current += 1
    contentsRequestVersionRef.current += 1
    setCatalogsState(createIdleState())
    setCatalogDetailState(createIdleState())
    setContentsState(createIdleState())
    setSelectedCatalogIdState(null)
    setContentsPageIndex(0)
    setContentsPageSize(DEFAULT_CONTENTS_PAGE_SIZE)
    setExpandedKeys([])
  }, [])

  const resetAllState = React.useCallback(() => {
    sitesRequestVersionRef.current += 1
    resetSiteScopedState()
    setSitesState(createIdleState())
    setSelectedSiteIdState(null)
    setActiveTabState('catalogs')
  }, [resetSiteScopedState])

  const ensureSitesLoaded = React.useCallback(async (force = false) => {
    if (!open) return
    if (!force && (sitesState.status === 'loading' || sitesState.status === 'ready')) {
      return
    }

    setSitesState((previous) => ({
      status: 'loading',
      data: previous.data,
      errorMessage: null,
    }))
    const requestVersion = ++sitesRequestVersionRef.current

    try {
      const result = workspaceId
        ? await api.listPageBuilderCmsSites({ workspaceId })
        : await api.listPageBuilderCmsSites()
      if (requestVersion !== sitesRequestVersionRef.current) {
        return
      }
      setSitesState({
        status: 'ready',
        data: result,
        errorMessage: null,
      })
      setSelectedSiteIdState((previous) => {
        if (previous && result.some((site) => site.id === previous)) {
          return previous
        }

        return resolveDefaultSiteId(result)
      })
    } catch (error) {
      if (requestVersion !== sitesRequestVersionRef.current) {
        return
      }
      setSitesState({
        status: 'error',
        data: null,
        errorMessage: toErrorMessage(error, '加载 CMS 站点失败'),
      })
    }
  }, [open, sitesState.status, workspaceId])

  const ensureCatalogsLoaded = React.useCallback(async (siteId: string, force = false) => {
    if (!open) return
    if (!force && (catalogsState.status === 'loading' || catalogsState.status === 'ready')) {
      return
    }

    setCatalogsState((previous) => ({
      status: 'loading',
      data: previous.data,
      errorMessage: null,
    }))
    const requestVersion = ++catalogsRequestVersionRef.current

    try {
      const result = workspaceId
        ? await api.listPageBuilderCmsCatalogs({ siteId }, { workspaceId })
        : await api.listPageBuilderCmsCatalogs({ siteId })
      if (requestVersion !== catalogsRequestVersionRef.current) {
        return
      }
      setCatalogsState({
        status: 'ready',
        data: result,
        errorMessage: null,
      })

      setExpandedKeys((previous) => previous.length > 0 ? previous : findInitialExpandedKeys(result.tree))
      setSelectedCatalogIdState((previous) => previous ?? findFirstCatalogId(result.tree))
    } catch (error) {
      if (requestVersion !== catalogsRequestVersionRef.current) {
        return
      }
      setCatalogsState({
        status: 'error',
        data: null,
        errorMessage: toErrorMessage(error, '加载 CMS 栏目失败'),
      })
    }
  }, [catalogsState.status, open, workspaceId])

  const ensureContentsLoaded = React.useCallback(async (
    siteId: string,
    catalogId: string,
    pageIndex: number,
    pageSize: number,
    _force = false,
  ) => {
    if (!open) return

    setContentsState({
      status: 'loading',
      data: null,
      errorMessage: null,
    })
    const requestVersion = ++contentsRequestVersionRef.current

    try {
      const query = { siteId, catalogId, pageIndex, pageSize }
      const result = workspaceId
        ? await api.listPageBuilderCmsContents(query, { workspaceId })
        : await api.listPageBuilderCmsContents(query)
      if (requestVersion !== contentsRequestVersionRef.current) {
        return
      }
      setContentsState({
        status: 'ready',
        data: result,
        errorMessage: null,
      })
    } catch (error) {
      if (requestVersion !== contentsRequestVersionRef.current) {
        return
      }
      setContentsState({
        status: 'error',
        data: null,
        errorMessage: toErrorMessage(error, '加载 CMS 内容失败'),
      })
    }
  }, [open, workspaceId])

  const ensureCatalogDetailLoaded = React.useCallback(async (siteId: string, catalogId: string, _force = false) => {
    if (!open) return

    setCatalogDetailState({
      status: 'loading',
      data: null,
      errorMessage: null,
    })
    const requestVersion = ++catalogDetailRequestVersionRef.current

    try {
      const result = workspaceId
        ? await api.getPageBuilderCmsCatalogDetail(catalogId, siteId, { workspaceId })
        : await api.getPageBuilderCmsCatalogDetail(catalogId, siteId)
      if (requestVersion !== catalogDetailRequestVersionRef.current) {
        return
      }
      setCatalogDetailState({
        status: 'ready',
        data: result,
        errorMessage: null,
      })
    } catch (error) {
      if (requestVersion !== catalogDetailRequestVersionRef.current) {
        return
      }
      setCatalogDetailState({
        status: 'error',
        data: null,
        errorMessage: toErrorMessage(error, '加载 CMS 栏目详情失败'),
      })
    }
  }, [open, workspaceId])

  React.useEffect(() => {
    if (previousWorkspaceIdRef.current === workspaceId) {
      return
    }

    previousWorkspaceIdRef.current = workspaceId
    resetAllState()
  }, [resetAllState, workspaceId])

  React.useEffect(() => {
    if (!open) {
      resetAllState()
      return
    }

    if (sitesState.status === 'idle') {
      void ensureSitesLoaded()
    }
  }, [ensureSitesLoaded, open, resetAllState, sitesState.status])

  React.useEffect(() => {
    if (!open || !selectedSiteId) return

    if (catalogsState.status === 'idle') {
      void ensureCatalogsLoaded(selectedSiteId)
    }
  }, [catalogsState.status, ensureCatalogsLoaded, open, selectedSiteId])

  React.useEffect(() => {
    if (!open || activeTab !== 'contents' || !selectedSiteId) return

    const nextCatalogId = selectedCatalogId ?? findFirstCatalogId(catalogsState.data?.tree ?? [])
    if (!nextCatalogId) return

    if (nextCatalogId !== selectedCatalogId) {
      setSelectedCatalogIdState(nextCatalogId)
      return
    }

    void ensureContentsLoaded(selectedSiteId, nextCatalogId, contentsPageIndex, contentsPageSize)
  }, [
    activeTab,
    catalogsState.data,
    contentsPageIndex,
    contentsPageSize,
    ensureContentsLoaded,
    open,
    selectedSiteId,
    selectedCatalogId,
  ])

  React.useEffect(() => {
    if (!open || activeTab !== 'catalogs' || !selectedCatalogId || !selectedSiteId) return
    void ensureCatalogDetailLoaded(selectedSiteId, selectedCatalogId)
  }, [activeTab, ensureCatalogDetailLoaded, open, selectedCatalogId, selectedSiteId])

  const setActiveTab = React.useCallback((value: CmsBrowserTab) => {
    setActiveTabState(value)

    if (value === 'catalogs') {
      if (selectedSiteId) {
        void ensureCatalogsLoaded(selectedSiteId, true)
      }
      return
    }

    setSelectedCatalogIdState((previous) => previous ?? findFirstCatalogId(catalogsState.data?.tree ?? []))
  }, [catalogsState.data, ensureCatalogsLoaded, selectedSiteId])

  const setSelectedSiteId = React.useCallback((siteId: string) => {
    if (selectedSiteId === siteId) {
      return
    }

    resetSiteScopedState()
    setSelectedSiteIdState(siteId)
  }, [resetSiteScopedState, selectedSiteId])

  const setSelectedCatalogId = React.useCallback((catalogId: string) => {
    setSelectedCatalogIdState((previous) => previous === catalogId ? previous : catalogId)
    setContentsPageIndex(0)
  }, [])

  const setContentsPage = React.useCallback((page: number, pageSize = contentsPageSize) => {
    setContentsPageIndex(Math.max(0, page - 1))
    setContentsPageSize(pageSize)
  }, [contentsPageSize])

  const retryCatalogs = React.useCallback(() => {
    if (!selectedSiteId) return
    void ensureCatalogsLoaded(selectedSiteId, true)
  }, [ensureCatalogsLoaded, selectedSiteId])

  const retrySites = React.useCallback(() => {
    void ensureSitesLoaded(true)
  }, [ensureSitesLoaded])

  const retryCatalogDetail = React.useCallback(() => {
    if (!selectedCatalogId || !selectedSiteId) return
    void ensureCatalogDetailLoaded(selectedSiteId, selectedCatalogId, true)
  }, [ensureCatalogDetailLoaded, selectedCatalogId, selectedSiteId])

  const retryContents = React.useCallback(() => {
    if (!selectedCatalogId || !selectedSiteId) return
    void ensureContentsLoaded(selectedSiteId, selectedCatalogId, contentsPageIndex, contentsPageSize, true)
  }, [
    contentsPageIndex,
    contentsPageSize,
    ensureContentsLoaded,
    selectedSiteId,
    selectedCatalogId,
  ])

  return {
    activeTab,
    sitesState,
    catalogsState,
    catalogDetailState,
    contentsState,
    contentsPageIndex,
    contentsPageSize,
    expandedKeys,
    selectedSiteId,
    selectedCatalogId,
    setActiveTab,
    setSelectedSiteId,
    setContentsPage,
    setExpandedKeys,
    setSelectedCatalogId,
    retrySites,
    retryCatalogDetail,
    retryCatalogs,
    retryContents,
  }
}
