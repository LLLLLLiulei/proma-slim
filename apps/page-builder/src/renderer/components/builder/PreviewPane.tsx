import * as React from 'react'
import { Expand, ExternalLink, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PreviewPane({
  previewUrl,
}: {
  previewUrl: string | null
}): React.ReactElement {
  const frameRef = React.useRef<HTMLDivElement>(null)
  const [frameKey, setFrameKey] = React.useState(0)

  const handleFullscreen = React.useCallback(() => {
    void frameRef.current?.requestFullscreen?.()
  }, [])

  const handleRefresh = React.useCallback(() => {
    if (!previewUrl) return
    setFrameKey((current) => current + 1)
  }, [previewUrl])

  const handleOpenInNewWindow = React.useCallback(() => {
    if (!previewUrl) return
    window.open(previewUrl, '_blank', 'noopener,noreferrer')
  }, [previewUrl])

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
            <iframe key={frameKey} className="h-full w-full border-0 bg-background" src={previewUrl} title="网页预览" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-muted/35 text-center text-sm text-muted-foreground">
              <p className="font-medium text-foreground/75">预览容器已就绪</p>
              <p className="max-w-[36ch] leading-6">
                当前阶段先提供 iframe 外壳，后续生成链路接入后将在这里显示真实页面。
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
