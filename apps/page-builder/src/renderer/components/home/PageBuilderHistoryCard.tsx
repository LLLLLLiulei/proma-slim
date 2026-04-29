import * as React from 'react'
import type { PageBuilderProjectSummary } from '@proma/shared'
import { Eye, PencilLine, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

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

  return project.editState.reason === 'agent' ? '正在构建' : '正在编辑'
}

export function PageBuilderHistoryCard({
  project,
  onDelete,
  onEdit,
  onPreview,
}: {
  project: PageBuilderProjectSummary
  onDelete: (project: PageBuilderProjectSummary) => void
  onEdit: (project: PageBuilderProjectSummary) => Promise<void>
  onPreview: (project: PageBuilderProjectSummary) => void
}): React.ReactElement {
  const lockLabel = getProjectLockLabel(project)
  const locked = lockLabel !== null
  const previewActionLabel = locked ? '查看' : '预览'

  return (
    <article className="page-builder-home-history-card group flex flex-col overflow-hidden rounded-[28px] border border-border/55 bg-background/90 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.16),inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-xl">
      <div className="page-builder-home-history-preview relative aspect-[5/4] overflow-hidden border-b border-border/55 bg-muted/20 p-3">
        <div className="page-builder-home-history-preview-surface h-full overflow-hidden rounded-[22px] border border-border/55 bg-background shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
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

        <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(180deg,rgba(248,250,252,0.12),rgba(15,23,42,0.22))] opacity-100 transition-opacity duration-200 lg:pointer-events-none lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
          <div className="flex flex-col items-center gap-2 px-4 sm:flex-row lg:pointer-events-auto">
            <Button
              aria-label={locked ? '查看项目' : '预览项目'}
              className="page-builder-home-history-action-primary h-10 rounded-full px-4 text-white"
              disabled={!project.previewUrl}
              onClick={() => {
                onPreview(project)
              }}
              type="button"
            >
              <Eye className="mr-2 size-4" />
              {previewActionLabel}
            </Button>
            <Button
              aria-label="编辑项目"
              className="page-builder-home-history-action-secondary h-10 rounded-full px-4 text-foreground"
              onClick={async () => {
                await onEdit(project)
              }}
              type="button"
              variant="outline"
            >
              <PencilLine className="mr-2 size-4" />
              编辑
            </Button>
            <Button
              aria-label="删除项目"
              className="size-10 rounded-full border-destructive/25 bg-background/92 text-destructive shadow-[0_12px_28px_-18px_rgba(15,23,42,0.35)] hover:bg-destructive/10"
              disabled={locked}
              onClick={() => {
                onDelete(project)
              }}
              size="icon"
              type="button"
              variant="outline"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 px-4 py-3.5">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{project.workspaceName}</h3>
          <p className="mt-1 text-xs text-muted-foreground">创建于 {formatCreatedAt(project.createdAt)}</p>
        </div>
      </div>
    </article>
  )
}
