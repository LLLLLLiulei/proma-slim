import * as React from 'react'
import type { PageBuilderProjectSummary } from '@ai-page-builder/shared'
import { Eye, PencilLine, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InlineResourceNameEditor } from './InlineResourceNameEditor'

function formatCreatedAt(createdAt: number): string {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(createdAt)

  const valueMap = new Map(parts.map((part) => [part.type, part.value]))

  return [
    `${valueMap.get('year')}/${valueMap.get('month')}/${valueMap.get('day')}`,
    `${valueMap.get('hour')}:${valueMap.get('minute')}:${valueMap.get('second')}`,
  ].join(' ')
}

function getProjectLockLabel(project: PageBuilderProjectSummary): string | null {
  if (project.editState.status !== 'locked') {
    return null
  }

  if (project.editState.reason === 'agent') {
    return 'Agent 处理中'
  }

  if (project.editState.reason === 'export') {
    return '正在导出'
  }

  return '正在编辑'
}

export function PageBuilderHistoryCard({
  project,
  onDelete,
  onEdit,
  onPreview,
  onRename,
  renaming,
}: {
  project: PageBuilderProjectSummary
  onDelete: (project: PageBuilderProjectSummary) => void
  onEdit: (project: PageBuilderProjectSummary) => Promise<void>
  onPreview: (project: PageBuilderProjectSummary) => void
  onRename?: (project: PageBuilderProjectSummary, name: string) => Promise<void>
  renaming?: boolean
}): React.ReactElement {
  const lockLabel = getProjectLockLabel(project)
  const locked = lockLabel !== null
  const previewActionLabel = locked ? '查看' : '预览'

  return (
    <article className="page-builder-home-history-card group flex flex-col overflow-hidden rounded-[22px] border border-border/55 bg-background/90 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl">
      <div className="page-builder-home-history-preview relative aspect-[4/3] overflow-hidden border-b border-border/55 bg-muted/20 p-3">
        <div className="page-builder-home-history-preview-surface h-full overflow-hidden rounded-[18px] border border-border/55 bg-background shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
          {project.previewUrl ? (
            <iframe
              className="page-builder-home-history-preview-frame"
              loading="lazy"
              sandbox="allow-forms allow-scripts"
              src={project.previewUrl}
              title={`${project.workspaceName} 预览`}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/30 px-5 text-center">
              <p className="text-sm font-medium text-foreground/80">
                {locked ? '暂无可查看预览' : '预览尚未生成'}
              </p>
              <p className="max-w-[24ch] text-xs leading-5 text-muted-foreground">
                {locked
                  ? '项目正在编辑或构建中，请稍后再查看。'
                  : '继续编辑当前项目后，网页预览会显示在这里。'}
              </p>
            </div>
          )}
        </div>

        {lockLabel && (
          <div className="absolute left-5 top-5 rounded-full border border-amber-500/25 bg-amber-100/92 px-3 py-1 text-xs font-medium text-amber-950 shadow-[0_12px_28px_-20px_rgba(15,23,42,0.35)]">
            {lockLabel}
          </div>
        )}

      </div>

      <div className="space-y-2.5 px-4 py-3">
        <div>
          <InlineResourceNameEditor
            editAriaLabel="编辑项目名称"
            inputAriaLabel="项目名称"
            onSave={async (name) => {
              await onRename?.(project, name)
            }}
            saving={renaming}
            value={project.workspaceName}
          />
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>创建于 {formatCreatedAt(project.createdAt)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2" data-testid="page-builder-history-card-actions">
          <Button
            aria-label={locked ? '查看项目' : '预览项目'}
            className="h-8 rounded-full px-2.5 text-xs [&_svg]:size-3.5"
            disabled={!project.previewUrl}
            onClick={() => {
              onPreview(project)
            }}
            type="button"
            variant="outline"
          >
            <Eye className="mr-1.5 size-3.5" />
            {previewActionLabel}
          </Button>
          <Button
            aria-label="编辑项目"
            className="h-8 rounded-full px-2.5 text-xs [&_svg]:size-3.5"
            onClick={async () => {
              await onEdit(project)
            }}
            type="button"
          >
            <PencilLine className="mr-1.5 size-3.5" />
            编辑
          </Button>
          <Button
            aria-label="删除项目"
            className="ml-auto size-8 rounded-full border-destructive/25 text-destructive hover:bg-destructive/10 [&_svg]:size-3.5"
            disabled={locked}
            onClick={() => {
              onDelete(project)
            }}
            size="icon"
            type="button"
            variant="outline"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </article>
  )
}
