import * as React from 'react'
import { FolderTree, LayoutPanelLeft, RefreshCw } from 'lucide-react'
import type {
  PageBuilderCmsCatalog,
  PageBuilderCmsContentSummary,
  PageBuilderCmsSelectionRequestContext,
  PageBuilderCmsSelectionResult,
} from '@proma/shared'
import { PAGE_BUILDER_CMS_SELECTION_RESULT_VERSION } from '@proma/shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CmsCatalogTree } from './CmsCatalogTree'
import { CmsCatalogDetailPanel } from './CmsCatalogDetailPanel'
import { CmsContentList } from './CmsContentList'
import { useCmsBrowserState } from './useCmsBrowserState'

interface CmsBrowserDialogProps {
  open: boolean
  onConfirmSelection?: (selection: CmsBrowserDialogSelection) => void
  onOpenChange: (open: boolean) => void
  requestContext?: PageBuilderCmsSelectionRequestContext
  confirming?: boolean
}

export type CmsBrowserDialogSelection = PageBuilderCmsSelectionResult

function CatalogPanelState(props: {
  message: string
  description?: string | null
  showRetry?: boolean
  onRetry?: () => void
}): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-background/70 px-6 text-center">
      <p className="text-sm font-medium text-foreground">{props.message}</p>
      {props.description ? (
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">{props.description}</p>
      ) : null}
      {props.showRetry && props.onRetry ? (
        <Button className="gap-2" onClick={props.onRetry} size="sm" type="button" variant="outline">
          <RefreshCw className="size-3.5" />
          重试
        </Button>
      ) : null}
    </div>
  )
}

export function CmsBrowserDialog(props: CmsBrowserDialogProps): React.ReactElement {
  const {
    onConfirmSelection,
    open,
    onOpenChange,
    requestContext,
    confirming = false,
  } = props
  const {
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
  } = useCmsBrowserState({ open })
  const [checkedCatalogIds, setCheckedCatalogIds] = React.useState<string[]>([])
  const [checkedContentIds, setCheckedContentIds] = React.useState<string[]>([])
  const [checkedContentItemsById, setCheckedContentItemsById] = React.useState<Record<string, PageBuilderCmsContentSummary>>({})

  const tree = catalogsState.data?.tree ?? []
  const catalogItems = catalogsState.data?.items ?? []
  const catalogById = React.useMemo(
    () => new Map(catalogItems.map((catalog) => [catalog.id, catalog])),
    [catalogItems],
  )
  const emptyContentsState = React.useMemo(() => ({
    status: 'ready' as const,
    data: {
      pageIndex: contentsPageIndex,
      pageSize: contentsPageSize,
      total: 0,
      totalPages: 1,
      items: [],
    },
    errorMessage: null,
  }), [contentsPageIndex, contentsPageSize])
  const selectedCatalogs = React.useMemo(
    () => checkedCatalogIds
      .map((catalogId) => catalogById.get(catalogId))
      .filter((catalog): catalog is PageBuilderCmsCatalog => catalog !== undefined),
    [catalogById, checkedCatalogIds],
  )
  const selectedContents = React.useMemo(
    () => checkedContentIds
      .map((contentId) => checkedContentItemsById[contentId])
      .filter((content): content is PageBuilderCmsContentSummary => content !== undefined),
    [checkedContentIds, checkedContentItemsById],
  )
  const selectedContentCatalogIds = React.useMemo(
    () => [...new Set(selectedContents.map((content) => content.catalogId).filter(Boolean))],
    [selectedContents],
  )
  const currentSelectionCount = activeTab === 'catalogs'
    ? selectedCatalogs.length
    : selectedContents.length
  const canConfirmSelection = !confirming
    && currentSelectionCount > 0
    && Boolean(requestContext?.targetBlock.selector)
    && Boolean(selectedSiteId)
  const currentSelectionSummary = activeTab === 'catalogs'
    ? `已选 ${selectedCatalogs.length} 个栏目`
    : `已选 ${selectedContents.length} 条内容`
  const siteOptions = sitesState.data ?? []

  React.useEffect(() => {
    if (open) return
    setCheckedCatalogIds([])
    setCheckedContentIds([])
    setCheckedContentItemsById({})
  }, [open])

  const clearCheckedContents = React.useCallback(() => {
    setCheckedContentIds([])
    setCheckedContentItemsById({})
  }, [])

  const clearCheckedSelections = React.useCallback(() => {
    setCheckedCatalogIds([])
    clearCheckedContents()
  }, [clearCheckedContents])

  const handleSelectContentCatalog = React.useCallback((catalogId: string) => {
    if (catalogId !== selectedCatalogId) {
      clearCheckedContents()
    }
    setSelectedCatalogId(catalogId)
  }, [clearCheckedContents, selectedCatalogId, setSelectedCatalogId])

  const handleSelectedSiteChange = React.useCallback((siteId: string) => {
    clearCheckedSelections()
    setSelectedSiteId(siteId)
  }, [clearCheckedSelections, setSelectedSiteId])

  const handleCheckedContentChange = React.useCallback((item: PageBuilderCmsContentSummary, checked: boolean) => {
    setCheckedContentIds((previous) => checked
      ? previous.includes(item.id) ? previous : [...previous, item.id]
      : previous.filter((contentId) => contentId !== item.id))

    setCheckedContentItemsById((previous) => {
      if (checked) {
        return {
          ...previous,
          [item.id]: item,
        }
      }

      const next = { ...previous }
      delete next[item.id]
      return next
    })
  }, [])

  const handleConfirmSelection = React.useCallback(() => {
    if (!requestContext?.targetBlock.selector || currentSelectionCount === 0 || !selectedSiteId) return

    if (activeTab === 'catalogs') {
      onConfirmSelection?.({
        version: PAGE_BUILDER_CMS_SELECTION_RESULT_VERSION,
        siteId: selectedSiteId,
        targetSelection: requestContext.targetSelection,
        targetBlock: requestContext.targetBlock,
        selectionKind: 'catalogs',
        sourceType: 'catalogs',
        selectionMode: selectedCatalogs.length === 1 ? 'single' : 'multiple',
        catalogIds: selectedCatalogs.map((catalog) => catalog.id),
        snapshot: {
          catalogs: selectedCatalogs,
        },
      })
    } else {
      onConfirmSelection?.({
        version: PAGE_BUILDER_CMS_SELECTION_RESULT_VERSION,
        siteId: selectedSiteId,
        targetSelection: requestContext.targetSelection,
        targetBlock: requestContext.targetBlock,
        selectionKind: 'contents',
        sourceType: 'contents-fixed',
        selectionMode: 'fixed-items',
        catalogIds: selectedContentCatalogIds,
        contentIds: selectedContents.map((content) => content.id),
        snapshot: {
          contents: selectedContents,
        },
      })
    }

  }, [
    activeTab,
    currentSelectionCount,
    onConfirmSelection,
    requestContext,
    selectedSiteId,
    selectedCatalogs,
    selectedContentCatalogIds,
    selectedContents,
  ])

  const siteGuardPanel = React.useMemo(() => {
    if (sitesState.status === 'loading' && !sitesState.data) {
      return <CatalogPanelState message="正在加载站点..." />
    }

    if (sitesState.status === 'error') {
      return (
        <CatalogPanelState
          description={sitesState.errorMessage}
          message="站点加载失败"
          onRetry={retrySites}
          showRetry
        />
      )
    }

    if (sitesState.status === 'ready' && siteOptions.length === 0) {
      return <CatalogPanelState message="当前没有可浏览的站点" />
    }

    if (!selectedSiteId) {
      return <CatalogPanelState message="请选择站点" />
    }

    return null
  }, [retrySites, selectedSiteId, siteOptions.length, sitesState.data, sitesState.errorMessage, sitesState.status])

  const renderCatalogTree = React.useCallback((selectionMode: 'check' | 'select') => {
    if (siteGuardPanel) {
      return siteGuardPanel
    }

    if (catalogsState.status === 'loading' && !catalogsState.data) {
      return <CatalogPanelState message="正在加载栏目..." />
    }

    if (catalogsState.status === 'error') {
      return (
        <CatalogPanelState
          description={catalogsState.errorMessage}
          message="栏目加载失败"
          onRetry={retryCatalogs}
          showRetry
        />
      )
    }

    if (catalogsState.status === 'ready' && tree.length === 0) {
      return <CatalogPanelState message="当前没有可浏览的栏目" />
    }

    if (tree.length === 0) {
      return <CatalogPanelState message="暂无栏目数据" />
    }

    if (selectionMode === 'check') {
      return (
        <CmsCatalogTree
          catalogs={tree}
          checkedCatalogIds={checkedCatalogIds}
          expandedKeys={expandedKeys}
          onCheckedCatalogIdsChange={setCheckedCatalogIds}
          onExpandedKeysChange={setExpandedKeys}
          onSelectCatalog={setSelectedCatalogId}
          selectedCatalogId={selectedCatalogId}
          selectionMode="check"
        />
      )
    }

    return (
      <CmsCatalogTree
        catalogs={tree}
        expandedKeys={expandedKeys}
        onExpandedKeysChange={setExpandedKeys}
        onSelectCatalog={handleSelectContentCatalog}
        selectedCatalogId={selectedCatalogId}
        selectionMode="select"
      />
    )
  }, [
    checkedCatalogIds,
    catalogsState.data,
    catalogsState.errorMessage,
    catalogsState.status,
    expandedKeys,
    handleSelectContentCatalog,
    retryCatalogs,
    selectedCatalogId,
    setCheckedCatalogIds,
    setExpandedKeys,
    tree,
    siteGuardPanel,
  ])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="page-builder-cms-dialog !flex !flex-col h-[min(720px,85vh)] max-w-[1120px] gap-0 overflow-hidden rounded-[28px] border-border/70 bg-white p-0 shadow-2xl">
        <DialogHeader className="border-b border-border/70 px-5 pb-3 pt-5 text-left">
          <DialogTitle className="text-lg font-semibold">
            从 CMS 选择数据
          </DialogTitle>
          <DialogDescription className="sr-only">
            浏览并选择 CMS 栏目或内容数据。
          </DialogDescription>
        </DialogHeader>

        <Tabs
          className="flex min-h-0 flex-1 flex-col"
          onValueChange={(value) => setActiveTab(value as 'catalogs' | 'contents')}
          value={activeTab}
        >
          <div className="flex items-center justify-between border-b border-border/70 px-5 py-1.5">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>站点</span>
                <select
                  className="min-w-[180px] rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                  disabled={sitesState.status === 'loading' || siteOptions.length === 0}
                  onChange={(event) => handleSelectedSiteChange(event.target.value)}
                  value={selectedSiteId ?? ''}
                >
                  <option value="" disabled>
                    {sitesState.status === 'loading' ? '正在加载站点...' : '请选择站点'}
                  </option>
                  {siteOptions.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <TabsList className="bg-muted/70">
                <TabsTrigger className="gap-2" value="catalogs">
                  <FolderTree className="size-3.5" />
                  栏目
                </TabsTrigger>
                <TabsTrigger className="gap-2" value="contents">
                  <LayoutPanelLeft className="size-3.5" />
                  内容
                </TabsTrigger>
              </TabsList>
            </div>
            {sitesState.status === 'error' ? (
              <Button className="gap-2" onClick={retrySites} size="sm" type="button" variant="outline">
                <RefreshCw className="size-3.5" />
                重试站点
              </Button>
            ) : null}
          </div>

          <TabsContent className="mt-0 min-h-0 flex-1 px-3 pb-2.5 pt-2 md:px-4" value="catalogs">
            {siteGuardPanel ? (
              <div className="h-full rounded-[20px] border border-border/70 bg-muted/15 p-3">
                {siteGuardPanel}
              </div>
            ) : (
            <div className="grid h-full min-h-0 gap-2.5 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="min-h-0 rounded-[20px] border border-border/70 bg-muted/15 p-2">
                {renderCatalogTree('check')}
              </div>

              <div className="min-h-0 rounded-[20px] border border-border/70 bg-muted/15 p-3">
                <CmsCatalogDetailPanel
                  onRetry={retryCatalogDetail}
                  state={catalogDetailState}
                />
              </div>
            </div>
            )}
          </TabsContent>

          <TabsContent className="mt-0 min-h-0 flex-1 px-3 pb-2.5 pt-2 md:px-4" value="contents">
            {siteGuardPanel ? (
              <div className="h-full rounded-[20px] border border-border/70 bg-muted/15 p-3">
                {siteGuardPanel}
              </div>
            ) : (
            <div className="grid h-full min-h-0 gap-2.5 lg:grid-cols-[272px_minmax(0,1fr)]">
              <div className="min-h-0 rounded-[20px] border border-border/70 bg-muted/15 p-2">
                {renderCatalogTree('select')}
              </div>

              <div className="min-h-0 rounded-[20px] border border-border/70 bg-muted/15 p-2.5">
                <CmsContentList
                  checkedContentIds={checkedContentIds}
                  onCheckedContentChange={handleCheckedContentChange}
                  onPageChange={setContentsPage}
                  onRetry={retryContents}
                  state={selectedCatalogId
                    ? contentsState
                    : emptyContentsState}
                />
              </div>
            </div>
            )}
          </TabsContent>

          <div className="flex items-center justify-between border-t border-border/70 px-4 py-2.5">
            <p className="text-xs text-muted-foreground">{currentSelectionSummary}</p>

            <div className="flex items-center gap-2">
              <Button disabled={confirming} onClick={() => onOpenChange(false)} size="sm" type="button" variant="outline">
                取消
              </Button>
              <Button
                disabled={!canConfirmSelection}
                onClick={handleConfirmSelection}
                size="sm"
                type="button"
              >
                {confirming ? '提交中...' : '确认选择'}
              </Button>
            </div>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
