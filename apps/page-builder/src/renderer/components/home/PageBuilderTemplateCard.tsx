import * as React from 'react'
import type { PageBuilderTemplateSummary } from '@ai-page-builder/shared'
import { Download, Eye, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InlineResourceNameEditor } from './InlineResourceNameEditor'

function formatTemplateCreatedAt(createdAt: string): string {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) {
    return createdAt
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

export function PageBuilderTemplateCard({
  deleting,
  onDelete,
  onDownload,
  onPreview,
  onRename,
  onUse,
  renaming,
  template,
  useDisabled,
  using,
}: {
  deleting?: boolean
  onDelete: (template: PageBuilderTemplateSummary) => void
  onDownload: (template: PageBuilderTemplateSummary) => void
  onPreview: (template: PageBuilderTemplateSummary) => void
  onRename?: (template: PageBuilderTemplateSummary, name: string) => Promise<void>
  onUse?: (template: PageBuilderTemplateSummary) => Promise<void>
  renaming?: boolean
  template: PageBuilderTemplateSummary
  useDisabled?: boolean
  using?: boolean
}): React.ReactElement {
  return (
    <article className="page-builder-home-template-card group flex flex-col overflow-hidden rounded-[22px] border border-border/55 bg-background/90 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl">
      <div className="page-builder-home-template-preview relative aspect-[4/3] overflow-hidden border-b border-border/55 bg-muted/20 p-3">
        <div className="page-builder-home-template-preview-surface h-full overflow-hidden rounded-[18px] border border-border/55 bg-background shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
          <iframe
            className="page-builder-home-template-preview-frame"
            loading="lazy"
            sandbox="allow-forms allow-scripts"
            src={template.previewUrl}
            title={`${template.name} 预览`}
          />
        </div>
      </div>

      <div className="space-y-2.5 px-4 py-3">
        <div>
          <InlineResourceNameEditor
            editAriaLabel="编辑模板名称"
            inputAriaLabel="模板名称"
            onSave={async (name) => {
              await onRename?.(template, name)
            }}
            saving={renaming}
            value={template.name}
          />
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>创建于 {formatTemplateCreatedAt(template.createdAt)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            aria-label="预览模板"
            className="h-8 rounded-full px-2.5 text-xs [&_svg]:size-3.5"
            onClick={() => {
              onPreview(template)
            }}
            type="button"
            variant="outline"
          >
            <Eye className="mr-1.5 size-3.5" />
            预览
          </Button>
          <Button
            aria-label="下载模板"
            className="h-8 rounded-full px-2.5 text-xs [&_svg]:size-3.5"
            onClick={() => {
              onDownload(template)
            }}
            type="button"
            variant="outline"
          >
            <Download className="mr-1.5 size-3.5" />
            下载
          </Button>
          {onUse ? (
            <Button
              aria-label="使用模板"
              className="h-8 rounded-full px-2.5 text-xs [&_svg]:size-3.5"
              disabled={useDisabled || using}
              onClick={async () => {
                await onUse(template)
              }}
              type="button"
            >
              <Sparkles className="mr-1.5 size-3.5" />
              {using ? '使用中...' : '使用模板'}
            </Button>
          ) : null}
          {template.deletable && (
            <Button
              aria-label="删除模板"
              className="ml-auto size-8 rounded-full border-destructive/25 text-destructive hover:bg-destructive/10 [&_svg]:size-3.5"
              disabled={deleting}
              onClick={() => {
                onDelete(template)
              }}
              size="icon"
              type="button"
              variant="outline"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
