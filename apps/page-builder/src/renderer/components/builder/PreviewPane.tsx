import * as React from 'react'
import { Download, ExternalLink, Laptop, LoaderCircle, MousePointerClick, RefreshCw, Smartphone } from 'lucide-react'
import type {
  PageBuilderPreviewAnchorRect,
  PageBuilderPreviewBridgeMessage,
  PageBuilderImageReplacementPayload,
  PageBuilderImageTargetDescriptor,
  PageBuilderInlineTextSaveRequest,
  PageBuilderInlineTextSaveResult,
  PageBuilderPreviewParentMessage,
  PageBuilderTargetSelection,
} from '@ai-page-builder/shared'
import {
  createPageBuilderBlockTargetSelection,
  PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
  PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
} from '@ai-page-builder/shared'
import { Button } from '@/components/ui/button'
import { PageBuilderBlockActionBar } from '@page-builder/components/builder/PageBuilderBlockActionBar'
import type { PageBuilderPreviewSelectionEvent } from '@page-builder/lib/preview-selection'
import { cn } from '@/lib/utils'

const BLOCK_ACTION_BAR_ESTIMATED_WIDTH = 176
const BLOCK_ACTION_BAR_WITH_IMAGE_ACTION_ESTIMATED_WIDTH = 296
const BLOCK_ACTION_BAR_ESTIMATED_HEIGHT = 44
const BLOCK_ACTION_BAR_GAP = 8
const BLOCK_ACTION_BAR_PADDING = 12
const MOBILE_PREVIEW_VIEWPORT_WIDTH = 390

type PreviewDeviceMode = 'desktop' | 'mobile'
type PreviewSelectionActionState = 'idle' | 'armed' | 'selected'

interface SelectedAnchorState {
  imageTargetDescriptor: PageBuilderImageTargetDescriptor | null
  rect: PageBuilderPreviewAnchorRect
  selector: string
  targetSelection: PageBuilderTargetSelection
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

function resolveBlockActionBarStyle(
  anchor: SelectedAnchorState | null,
  frameRect: DOMRect | null | undefined,
): React.CSSProperties | null {
  if (!anchor) return null

  const estimatedWidth = anchor.imageTargetDescriptor
    ? BLOCK_ACTION_BAR_WITH_IMAGE_ACTION_ESTIMATED_WIDTH
    : BLOCK_ACTION_BAR_ESTIMATED_WIDTH
  const hostWidth = frameRect?.width ?? Math.max(anchor.rect.right + BLOCK_ACTION_BAR_PADDING, anchor.rect.left + 1)
  const hostHeight = frameRect?.height ?? Math.max(
    anchor.rect.bottom + BLOCK_ACTION_BAR_ESTIMATED_HEIGHT + BLOCK_ACTION_BAR_GAP,
    anchor.rect.top + 1,
  )

  const left = clamp(
    anchor.rect.left,
    BLOCK_ACTION_BAR_PADDING,
    hostWidth - estimatedWidth - BLOCK_ACTION_BAR_PADDING,
  )

  const canPlaceBelow = anchor.rect.bottom + BLOCK_ACTION_BAR_GAP + BLOCK_ACTION_BAR_ESTIMATED_HEIGHT
    <= hostHeight - BLOCK_ACTION_BAR_PADDING

  const top = canPlaceBelow
    ? anchor.rect.bottom + BLOCK_ACTION_BAR_GAP
    : clamp(
        anchor.rect.top - BLOCK_ACTION_BAR_GAP - BLOCK_ACTION_BAR_ESTIMATED_HEIGHT,
        BLOCK_ACTION_BAR_PADDING,
        hostHeight - BLOCK_ACTION_BAR_ESTIMATED_HEIGHT - BLOCK_ACTION_BAR_PADDING,
      )

  return { left, top }
}

function isPreviewBridgeMessage(value: unknown): value is PageBuilderPreviewBridgeMessage {
  if (!value || typeof value !== 'object') return false

  const message = value as Partial<PageBuilderPreviewBridgeMessage>
  return message.source === PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE && typeof message.type === 'string'
}

function resolvePreviewTargetSelection(
  message: Extract<PageBuilderPreviewBridgeMessage, { type: 'hover' | 'selected' }>,
): PageBuilderTargetSelection | null {
  if (message.targetSelection) {
    return message.targetSelection
  }

  if (!message.selector) {
    return null
  }

  return createPageBuilderBlockTargetSelection(message.selector)
}

function resolveTargetSelectionSelector(targetSelection: PageBuilderTargetSelection): string {
  return targetSelection.kind === 'cms-island'
    ? targetSelection.sourceSelector
    : targetSelection.selector
}

function resolveEmbeddedPreviewUrl(previewUrl: string): string {
  const baseOrigin = typeof window === 'undefined' || !window.location?.origin
    ? 'http://localhost'
    : window.location.origin
  const url = new URL(previewUrl, baseOrigin)
  url.searchParams.set('page-builder-bridge', '1')
  return url.toString()
}

export function PreviewPane({
  exportStaticPending = false,
  onRequestExportStatic,
  onInlineTextSaveRequest,
  onRequestDeleteBlock,
  onRequestOpenCmsBrowser,
  onRequestReplaceImage,
  imageReplacementPending = false,
  interactionLocked = false,
  previewUrl,
  requiresSameOrigin = false,
  selectionActionState = 'idle',
  selectionModeEnabled = false,
  selectionToggleDisabled = false,
  onToggleSelectionMode,
  onSelectionEvent,
}: {
  exportStaticPending?: boolean
  onRequestExportStatic?: () => void | Promise<void>
  onInlineTextSaveRequest?: (request: PageBuilderInlineTextSaveRequest) => Promise<PageBuilderInlineTextSaveResult>
  onRequestDeleteBlock?: (selector: string) => void
  onRequestOpenCmsBrowser?: () => void
  onRequestReplaceImage?: (request: PageBuilderImageReplacementPayload) => void
  imageReplacementPending?: boolean
  interactionLocked?: boolean
  previewUrl: string | null
  requiresSameOrigin?: boolean
  selectionActionState?: PreviewSelectionActionState
  selectionModeEnabled?: boolean
  selectionToggleDisabled?: boolean
  onToggleSelectionMode?: () => void
  onSelectionEvent?: (event: PageBuilderPreviewSelectionEvent) => void
}): React.ReactElement {
  const frameRef = React.useRef<HTMLDivElement>(null)
  const viewportShellRef = React.useRef<HTMLDivElement>(null)
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const [frameKey, setFrameKey] = React.useState(0)
  const [bridgeReady, setBridgeReady] = React.useState(false)
  const [previewDeviceMode, setPreviewDeviceMode] = React.useState<PreviewDeviceMode>('desktop')
  const [selectedAnchor, setSelectedAnchor] = React.useState<SelectedAnchorState | null>(null)
  const embeddedPreviewUrl = React.useMemo(() => {
    if (!previewUrl) {
      return previewUrl
    }

    return resolveEmbeddedPreviewUrl(previewUrl)
  }, [previewUrl])
  const previewSandbox = requiresSameOrigin
    ? 'allow-forms allow-scripts allow-same-origin'
    : 'allow-forms allow-scripts'

  const handleRefresh = React.useCallback(() => {
    if (!previewUrl) return
    onSelectionEvent?.({ type: 'reset' })
    setBridgeReady(false)
    setFrameKey((current) => current + 1)
  }, [onSelectionEvent, previewUrl])

  const handleOpenInNewWindow = React.useCallback(() => {
    if (!previewUrl) return
    window.open(previewUrl, '_blank', 'noopener,noreferrer')
  }, [previewUrl])

  React.useLayoutEffect(() => {
    if (typeof window === 'undefined') return

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (!isPreviewBridgeMessage(event.data)) return

      if (event.data.type === 'ready') {
        setBridgeReady(true)
        return
      }

      if (event.data.type === 'hover') {
        if (interactionLocked) return
        const targetSelection = resolvePreviewTargetSelection(event.data)
        onSelectionEvent?.({
          type: 'hover',
          selector: targetSelection
            ? resolveTargetSelectionSelector(targetSelection)
            : event.data.selector,
          targetSelection,
          displayLabel: event.data.displayLabel,
        })
        return
      }

      if (event.data.type === 'selected') {
        if (interactionLocked) return
        const targetSelection = resolvePreviewTargetSelection(event.data)
        if (!targetSelection) {
          setSelectedAnchor(null)
          onSelectionEvent?.({ type: 'reset' })
          return
        }

        const replaceImageTargetDescriptor = targetSelection.kind === 'block'
          && event.data.capabilities?.replaceImage?.supported
          ? event.data.capabilities.replaceImage.targetDescriptor
          : null
        setSelectedAnchor({
          imageTargetDescriptor: replaceImageTargetDescriptor,
          rect: event.data.rect,
          selector: resolveTargetSelectionSelector(targetSelection),
          targetSelection,
        })
        onSelectionEvent?.({
          type: 'selected',
          selector: resolveTargetSelectionSelector(targetSelection),
          targetSelection,
          displayLabel: event.data.displayLabel,
        })
        return
      }

      if (event.data.type === 'inline-text-save-request') {
        const saveRequest = event.data
        void (async () => {
          const {
            requestId,
            selector,
            textTargetDescriptor,
            previousText,
            nextText,
          } = saveRequest

          const result = await (async (): Promise<PageBuilderInlineTextSaveResult> => {
            if (!onInlineTextSaveRequest) {
              return {
                requestId,
                ok: false,
                error: '未配置内联文字保存处理器',
              }
            }

            try {
              return await onInlineTextSaveRequest({
                requestId,
                selector,
                textTargetDescriptor,
                previousText,
                nextText,
              })
            } catch (error) {
              return {
                requestId,
                ok: false,
                error: error instanceof Error ? error.message : '内联文字保存失败',
              }
            }
          })()

          const contentWindow = iframeRef.current?.contentWindow
          if (!contentWindow) return

          const responseMessage: PageBuilderPreviewParentMessage = {
            source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
            type: 'inline-text-save-result',
            ...result,
          }
          contentWindow.postMessage(responseMessage, '*')
        })()
        return
      }

      setSelectedAnchor(null)
      onSelectionEvent?.({ type: 'reset' })
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [interactionLocked, onInlineTextSaveRequest, onSelectionEvent])

  React.useEffect(() => {
    if (!previewUrl) return

    setBridgeReady(false)
    setSelectedAnchor(null)
    onSelectionEvent?.({ type: 'reset' })
  }, [onSelectionEvent, previewUrl])

  React.useEffect(() => {
    if (selectionModeEnabled) return
    setSelectedAnchor(null)
  }, [selectionModeEnabled])

  React.useEffect(() => {
    const contentWindow = iframeRef.current?.contentWindow
    if (!contentWindow || !previewUrl) return

    const modeMessage: PageBuilderPreviewParentMessage = {
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-mode',
      enabled: selectionModeEnabled,
      locked: interactionLocked,
    }

    contentWindow.postMessage(modeMessage, '*')

    if (!selectionModeEnabled) {
      const clearMessage: PageBuilderPreviewParentMessage = {
        source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
        type: 'selection-clear',
      }
      contentWindow.postMessage(clearMessage, '*')
    }
  }, [bridgeReady, interactionLocked, previewUrl, selectionModeEnabled])

  const blockActionBarStyle = resolveBlockActionBarStyle(
    selectedAnchor,
    viewportShellRef.current?.getBoundingClientRect?.() ?? frameRef.current?.getBoundingClientRect?.(),
  )
  const selectedImageTargetDescriptor = selectedAnchor?.imageTargetDescriptor ?? null
  const isMobilePreview = previewDeviceMode === 'mobile'
  const viewportShellWidth = previewDeviceMode === 'mobile'
    ? `min(${MOBILE_PREVIEW_VIEWPORT_WIDTH}px, 100%)`
    : '100%'
  const selectionToggleTitle = selectionActionState === 'selected'
    ? '已选区域'
    : selectionActionState === 'armed'
      ? '从页面中选择'
      : '选择进行编辑'
  const selectionToggleDisabledState = selectionToggleDisabled || !previewUrl
  const selectionToggleClassName = selectionActionState === 'selected'
    ? 'border border-primary/70 bg-primary text-primary-foreground hover:bg-primary'
    : selectionActionState === 'armed'
      ? 'border border-primary/35 bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] ring-1 ring-primary/15 hover:border-primary/45 hover:bg-primary/14 hover:text-primary'
      : 'border border-transparent text-foreground hover:bg-muted/70 hover:text-foreground'

  return (
    <section className="page-builder-pane flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-2xl lg:h-full lg:min-h-0">
      <div className="flex h-11 items-center justify-between gap-3 border-b border-border/70 px-3">
        <div
          className="flex items-center gap-1 rounded-md border border-border/70 bg-background/80 p-0.5"
          data-preview-device-toggle-group={true}
        >
          <Button
            aria-label="PC 预览"
            aria-pressed={previewDeviceMode === 'desktop'}
            className={cn(
              'size-7 rounded-[6px] border-0 shadow-none',
              previewDeviceMode === 'desktop'
                ? 'bg-accent text-accent-foreground hover:bg-accent'
                : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
            )}
            onClick={() => setPreviewDeviceMode('desktop')}
            size="icon-sm"
            title="PC 预览"
            type="button"
            variant="ghost"
          >
            <Laptop className="size-3.5" />
          </Button>
          <Button
            aria-label="Mobile 预览"
            aria-pressed={previewDeviceMode === 'mobile'}
            className={cn(
              'size-7 rounded-[6px] border-0 shadow-none',
              previewDeviceMode === 'mobile'
                ? 'bg-accent text-accent-foreground hover:bg-accent'
                : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
            )}
            onClick={() => setPreviewDeviceMode('mobile')}
            size="icon-sm"
            title="Mobile 预览"
            type="button"
            variant="ghost"
          >
            <Smartphone className="size-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1 rounded-md border border-border/70 bg-background/80 p-0.5"
            data-preview-selection-action-group={true}
          >
            <Button
              aria-label="选择区块"
              aria-pressed={selectionActionState !== 'idle'}
              className={cn(
                'size-7 rounded-[6px] shadow-none',
                selectionToggleClassName,
              )}
              disabled={selectionToggleDisabledState}
              onClick={onToggleSelectionMode}
              size="icon-sm"
              title={selectionToggleTitle}
              type="button"
              variant="ghost"
            >
              <MousePointerClick className="size-3.5" />
            </Button>
          </div>
          <Button
            aria-label="导出静态包"
            aria-busy={exportStaticPending}
            className="size-8"
            disabled={!previewUrl || exportStaticPending}
            onClick={() => {
              void onRequestExportStatic?.()
            }}
            size="icon"
            title="导出静态包"
            type="button"
            variant="outline"
          >
            {exportStaticPending
              ? <LoaderCircle className="size-3.5 animate-spin" />
              : <Download className="size-3.5" />}
          </Button>
          <Button
            aria-label="刷新预览"
            className="size-8"
            disabled={!previewUrl}
            onClick={handleRefresh}
            size="icon"
            title="刷新预览"
            type="button"
            variant="outline"
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            aria-label="新窗口打开预览"
            className="size-8"
            disabled={!previewUrl}
            onClick={handleOpenInNewWindow}
            size="icon"
            title="新窗口打开预览"
            type="button"
            variant="outline"
          >
            <ExternalLink className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-2.5">
        <div
          ref={frameRef}
          className="relative flex h-full min-h-[480px] items-stretch justify-center overflow-hidden rounded-xl border border-border/70 bg-background"
        >
          <div
            className={cn(
              'flex h-full w-full items-stretch justify-center',
              isMobilePreview ? 'px-3 py-4' : '',
            )}
            data-preview-viewport-frame={true}
          >
            <div
              ref={viewportShellRef}
              className={cn(
                'relative h-full min-h-[480px] max-w-full shrink-0 bg-background',
                isMobilePreview
                  ? 'overflow-hidden rounded-xl border border-border/70 shadow-[0_10px_28px_rgba(15,23,42,0.08)]'
                  : '',
              )}
              data-preview-device-mode={previewDeviceMode}
              data-preview-viewport-shell={true}
              style={{ width: viewportShellWidth }}
            >
              {previewUrl ? (
                <>
                  <iframe
                    ref={iframeRef}
                    key={frameKey}
                    className="h-full w-full border-0 bg-background"
                    onLoad={() => setBridgeReady(false)}
                    sandbox={previewSandbox}
                    src={embeddedPreviewUrl ?? undefined}
                    title="网页预览"
                  />
                  {selectedAnchor && blockActionBarStyle ? (
                    <div className="pointer-events-none absolute inset-0 z-10">
                      <PageBuilderBlockActionBar
                        actionsDisabled={interactionLocked}
                        onDelete={() => {
                          if (interactionLocked) return
                          onRequestDeleteBlock?.(selectedAnchor.selector)
                        }}
                        onOpenCms={onRequestOpenCmsBrowser
                          ? () => {
                              if (interactionLocked) return
                              onRequestOpenCmsBrowser()
                            }
                          : undefined}
                        onReplaceImage={selectedImageTargetDescriptor
                          ? () => {
                              if (interactionLocked) return
                              onRequestReplaceImage?.({
                                selector: selectedAnchor.selector,
                                imageTargetDescriptor: selectedImageTargetDescriptor,
                              })
                            }
                          : undefined}
                        replaceImageDisabled={imageReplacementPending}
                        style={blockActionBarStyle}
                      />
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-muted/35 text-center text-sm text-muted-foreground">
                  <p className="font-medium text-foreground/75">预览尚未生成</p>
                  <p className="max-w-[36ch] leading-6">
                    在右侧继续描述或修改网页需求，生成结果写入工作区后会自动显示在这里。
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
