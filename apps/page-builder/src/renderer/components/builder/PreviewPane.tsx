import * as React from 'react'
import { Expand, ExternalLink, RefreshCw } from 'lucide-react'
import type { PageBuilderPreviewBridgeMessage, PageBuilderPreviewParentMessage } from '@proma/shared'
import {
  PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE,
  PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
} from '@proma/shared'
import { Button } from '@/components/ui/button'
import type { PageBuilderPreviewSelectionEvent } from '@page-builder/lib/preview-selection'

function logPreviewPane(event: string, detail?: Record<string, unknown>): void {
  if (detail) {
    console.info('[PageBuilderPreviewPane]', event, detail)
    return
  }

  console.info('[PageBuilderPreviewPane]', event)
}

function isPreviewBridgeMessage(value: unknown): value is PageBuilderPreviewBridgeMessage {
  if (!value || typeof value !== 'object') return false

  const message = value as Partial<PageBuilderPreviewBridgeMessage>
  return message.source === PAGE_BUILDER_PREVIEW_BRIDGE_SOURCE && typeof message.type === 'string'
}

export function PreviewPane({
  previewUrl,
  selectionModeEnabled = false,
  onSelectionEvent,
}: {
  previewUrl: string | null
  selectionModeEnabled?: boolean
  onSelectionEvent?: (event: PageBuilderPreviewSelectionEvent) => void
}): React.ReactElement {
  const frameRef = React.useRef<HTMLDivElement>(null)
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const [frameKey, setFrameKey] = React.useState(0)
  const [bridgeReady, setBridgeReady] = React.useState(false)

  const handleFullscreen = React.useCallback(() => {
    void frameRef.current?.requestFullscreen?.()
  }, [])

  const handleRefresh = React.useCallback(() => {
    if (!previewUrl) return
    logPreviewPane('manual-refresh', { previewUrl })
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
        logPreviewPane('bridge-ready')
        setBridgeReady(true)
        return
      }

      if (event.data.type === 'hover') {
        onSelectionEvent?.({
          type: 'hover',
          selector: event.data.selector,
        })
        return
      }

      if (event.data.type === 'selected') {
        logPreviewPane('bridge-selected', { selector: event.data.selector })
        onSelectionEvent?.({
          type: 'selected',
          selector: event.data.selector,
        })
        return
      }

      logPreviewPane('bridge-reset')
      onSelectionEvent?.({ type: 'reset' })
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onSelectionEvent])

  React.useEffect(() => {
    if (!previewUrl) return

    logPreviewPane('preview-url-changed', { previewUrl })
    setBridgeReady(false)
    onSelectionEvent?.({ type: 'reset' })
  }, [onSelectionEvent, previewUrl])

  React.useEffect(() => {
    const contentWindow = iframeRef.current?.contentWindow
    if (!contentWindow || !previewUrl) return

    const modeMessage: PageBuilderPreviewParentMessage = {
      source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
      type: 'selection-mode',
      enabled: selectionModeEnabled,
    }

    logPreviewPane('post-message', {
      message: modeMessage,
      bridgeReady,
    })
    contentWindow.postMessage(modeMessage, '*')

    if (!selectionModeEnabled) {
      const clearMessage: PageBuilderPreviewParentMessage = {
        source: PAGE_BUILDER_PREVIEW_PARENT_SOURCE,
        type: 'selection-clear',
      }
      logPreviewPane('post-message', {
        message: clearMessage,
        bridgeReady,
      })
      contentWindow.postMessage(clearMessage, '*')
    }

    if (!bridgeReady) {
      logPreviewPane('bridge-not-ready-pending-sync', {
        previewUrl,
        selectionModeEnabled,
      })
    }
  }, [bridgeReady, previewUrl, selectionModeEnabled])

  return (
    <section className="page-builder-pane flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-2xl lg:h-full lg:min-h-0">
      <div className="flex h-11 items-center justify-between gap-3 border-b border-border/70 px-3">
        <h2 className="min-w-0 truncate text-sm font-medium text-foreground">实时预览</h2>
        <div className="flex items-center gap-1">
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
            aria-label="全屏预览"
            className="size-8"
            onClick={handleFullscreen}
            size="icon"
            title="全屏预览"
            type="button"
            variant="outline"
          >
            <Expand className="size-3.5" />
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
          className="flex h-full min-h-[480px] overflow-hidden rounded-xl border border-border/70 bg-background"
        >
          {previewUrl ? (
            <iframe
              ref={iframeRef}
              key={frameKey}
              className="h-full w-full border-0 bg-background"
              onLoad={() => {
                logPreviewPane('iframe-load', { previewUrl })
                setBridgeReady(false)
              }}
              sandbox="allow-forms allow-scripts"
              src={previewUrl}
              title="网页预览"
            />
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
    </section>
  )
}
