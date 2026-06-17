import * as React from 'react'
import type { PageBuilderProjectSummary } from '@ai-page-builder/shared'
import { History, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { usePageBuilderHistory } from '@page-builder/hooks/usePageBuilderHistory'
import { openUrlInNewWindow } from '@page-builder/lib/open-url'
import { PageBuilderHistoryCard } from './PageBuilderHistoryCard'

function openPreview(project: PageBuilderProjectSummary): void {
  if (!project.previewUrl) return
  openUrlInNewWindow(project.previewUrl)
}

export function PageBuilderHistorySection(): React.ReactElement {
  const {
    error,
    loading,
    openProject,
    projects,
    renameProject,
    renamingProjectId,
    refreshProjects,
    removeProject,
  } = usePageBuilderHistory()
  const [pendingDelete, setPendingDelete] = React.useState<PageBuilderProjectSummary | null>(null)

  const handleDeleteConfirm = React.useCallback(async (): Promise<void> => {
    if (!pendingDelete) return
    await removeProject(pendingDelete.workspaceId)
    setPendingDelete(null)
  }, [pendingDelete, removeProject])

  return (
    <section className="page-builder-home-history-section w-full max-w-[1120px]" data-testid="page-builder-history-section">
      <div className="page-builder-home-history-header flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl border border-border/55 bg-background/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
            <History className="size-4 text-foreground/78" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground">历史记录</h2>
            <p className="text-sm text-muted-foreground">继续编辑你之前创建过的网页项目。</p>
          </div>
        </div>

        <Button
          aria-label="刷新历史记录"
          className="h-9 rounded-full px-3"
          onClick={() => {
            void refreshProjects()
          }}
          type="button"
          variant="outline"
        >
          <RefreshCw className="mr-2 size-4" />
          刷新
        </Button>
      </div>

      {error && (
        <div className="page-builder-home-history-feedback mt-4 flex items-center justify-between gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <Button
            className="rounded-full"
            onClick={() => {
              void refreshProjects()
            }}
            type="button"
            variant="outline"
          >
            重试
          </Button>
        </div>
      )}

      {loading ? (
        <div className="page-builder-home-history-grid mt-5 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              className="overflow-hidden rounded-[28px] border border-border/45 bg-background/78 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.4)]"
            >
              <div className="aspect-[5/4] animate-pulse bg-muted/45" />
              <div className="space-y-2 px-4 py-4">
                <div className="h-4 w-2/3 rounded-full bg-muted/60" />
                <div className="h-3 w-1/3 rounded-full bg-muted/45" />
              </div>
            </div>
          ))}
        </div>
      ) : projects.length > 0 ? (
        <div className="page-builder-home-history-grid mt-5 grid gap-4 md:grid-cols-3">
          {projects.map((project) => (
            <PageBuilderHistoryCard
              key={project.workspaceId}
              onDelete={setPendingDelete}
              onEdit={openProject}
              onPreview={openPreview}
              onRename={async (targetProject, name) => {
                await renameProject(targetProject.workspaceId, name)
              }}
              project={project}
              renaming={renamingProjectId === project.workspaceId}
            />
          ))}
        </div>
      ) : (
        <div className="page-builder-home-history-empty mt-5 rounded-[28px] border border-dashed border-border/55 bg-background/68 px-6 py-10 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
          <p className="text-sm font-medium text-foreground/82">还没有历史项目</p>
          <p className="mx-auto mt-2 max-w-[32ch] text-sm leading-6 text-muted-foreground">
            在上方描述你的网页需求并创建第一个项目后，这里会显示历史记录。
          </p>
        </div>
      )}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        open={pendingDelete !== null}
      >
        {pendingDelete && (
          <AlertDialogContent className="page-builder-home-delete-dialog rounded-[24px] border-border/60">
            <AlertDialogHeader className="page-builder-home-delete-dialog-header">
              <AlertDialogTitle className="page-builder-home-delete-dialog-title">删除项目</AlertDialogTitle>
              <AlertDialogDescription className="page-builder-home-delete-dialog-description">
                删除后将移除“{pendingDelete.workspaceName}”的历史会话和预览文件，且无法恢复。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="page-builder-home-delete-dialog-footer">
              <AlertDialogCancel
                className="page-builder-home-delete-dialog-cancel"
                onClick={() => {
                  setPendingDelete(null)
                }}
              >
                取消
              </AlertDialogCancel>
              <AlertDialogAction
                className="page-builder-home-delete-dialog-confirm bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  await handleDeleteConfirm()
                }}
              >
                删除项目
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </section>
  )
}
