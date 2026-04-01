import * as React from 'react'
import { FolderTree, LayoutPanelLeft, RefreshCw } from 'lucide-react'
import type {
  PageBuilderCmsCatalog,
  PageBuilderCmsContentSummary,
} from '@proma/shared'
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
}

export type CmsBrowserDialogSelection =
  | {
    tab: 'catalogs'
    catalogs: PageBuilderCmsCatalog[]
    contents: []
  }
  | {
    tab: 'contents'
    catalogs: []
    contents: PageBuilderCmsContentSummary[]
  }

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
  const { onConfirmSelection, open, onOpenChange } = props
  const {
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
  const currentSelectionCount = activeTab === 'catalogs'
    ? selectedCatalogs.length
    : selectedContents.length
  const currentSelectionSummary = activeTab === 'catalogs'
    ? `已选 ${selectedCatalogs.length} 个栏目`
    : `已选 ${selectedContents.length} 条内容`

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

  const handleSelectContentCatalog = React.useCallback((catalogId: string) => {
    if (catalogId !== selectedCatalogId) {
      clearCheckedContents()
    }
    setSelectedCatalogId(catalogId)
  }, [clearCheckedContents, selectedCatalogId, setSelectedCatalogId])

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
    if (currentSelectionCount === 0) return

    if (activeTab === 'catalogs') {
      onConfirmSelection?.({
        tab: 'catalogs',
        catalogs: selectedCatalogs,
        contents: [],
      })
    } else {
      onConfirmSelection?.({
        tab: 'contents',
        catalogs: [],
        contents: selectedContents,
      })
    }

    onOpenChange(false)
  }, [
    activeTab,
    currentSelectionCount,
    onConfirmSelection,
    onOpenChange,
    selectedCatalogs,
    selectedContents,
  ])

  const renderCatalogTree = React.useCallback((selectionMode: 'check' | 'select') => {
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

          <TabsContent className="mt-0 min-h-0 flex-1 px-3 pb-2.5 pt-2 md:px-4" value="catalogs">
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
          </TabsContent>

          <TabsContent className="mt-0 min-h-0 flex-1 px-3 pb-2.5 pt-2 md:px-4" value="contents">
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
          </TabsContent>

          <div className="flex items-center justify-between border-t border-border/70 px-4 py-2.5">
            <p className="text-xs text-muted-foreground">{currentSelectionSummary}</p>

            <div className="flex items-center gap-2">
              <Button onClick={() => onOpenChange(false)} size="sm" type="button" variant="outline">
                取消
              </Button>
              <Button
                disabled={currentSelectionCount === 0}
                onClick={handleConfirmSelection}
                size="sm"
                type="button"
              >
                确认选择
              </Button>
            </div>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
