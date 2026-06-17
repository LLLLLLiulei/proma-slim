import * as React from 'react'
import type { PageBuilderTemplateSummary } from '@ai-page-builder/shared'
import { AlertTriangle, LibraryBig, LoaderCircle, RefreshCw, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { usePageBuilderTemplates } from '@page-builder/hooks/usePageBuilderTemplates'
import { clearBootstrapPayload } from '@page-builder/lib/bootstrap-cache'
import { openUrlInNewWindow } from '@page-builder/lib/open-url'
import { writeWorkspacePreviewState } from '@page-builder/lib/preview-state-cache'
import { getPageBuilderPublicBasePath } from '@page-builder/lib/public-base-path'
import { buildBuilderPath } from '@page-builder/lib/routes'
import { PageBuilderTemplateCard } from './PageBuilderTemplateCard'

function navigateTo(pathname: string): void {
  window.history.pushState(null, '', pathname)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function openPreview(template: PageBuilderTemplateSummary): void {
  openUrlInNewWindow(template.previewUrl)
}

function downloadTemplate(template: PageBuilderTemplateSummary): void {
  openUrlInNewWindow(api.getPageBuilderTemplateDownloadUrl(template.id))
}

export function PageBuilderTemplateLibrarySection({
  allowTemplateUse = true,
}: {
  allowTemplateUse?: boolean
}): React.ReactElement {
  const {
    deletingTemplateId,
    error,
    importingTemplate,
    importTemplate,
    loading,
    renameTemplate,
    renamingTemplateId,
    refreshTemplates,
    removeTemplate,
    templates,
    useTemplate,
    usingTemplateId,
  } = usePageBuilderTemplates()
  const [pendingDelete, setPendingDelete] = React.useState<PageBuilderTemplateSummary | null>(null)
  const [pendingUse, setPendingUse] = React.useState<PageBuilderTemplateSummary | null>(null)
  const [projectName, setProjectName] = React.useState('')
  const importInputRef = React.useRef<HTMLInputElement | null>(null)
  const publicBasePath = getPageBuilderPublicBasePath()
  const normalizedProjectName = projectName.trim()
  const useConfirmDisabled = !allowTemplateUse || usingTemplateId !== null || normalizedProjectName.length === 0

  const openUseDialog = React.useCallback(async (template: PageBuilderTemplateSummary): Promise<void> => {
    if (!allowTemplateUse) return
    setPendingUse(template)
    setProjectName(template.name)
  }, [allowTemplateUse])

  const handleUseTemplate = React.useCallback(async (): Promise<void> => {
    if (!pendingUse || useConfirmDisabled) {
      return
    }

    const result = await useTemplate(pendingUse.id, normalizedProjectName)
    if (!result || typeof window === 'undefined') {
      return
    }

    clearBootstrapPayload(window.sessionStorage, result.session.id)
    writeWorkspacePreviewState(window.sessionStorage, result.workspace.id, result.previewState)
    navigateTo(buildBuilderPath(result.workspace.id, result.session.id, publicBasePath))
  }, [normalizedProjectName, pendingUse, publicBasePath, useConfirmDisabled, useTemplate])

  const handleDeleteConfirm = React.useCallback(async (): Promise<void> => {
    if (!pendingDelete) return

    const removed = await removeTemplate(pendingDelete.id)
    if (removed) {
      setPendingDelete(null)
    }
  }, [pendingDelete, removeTemplate])

  const handleImportChange = React.useCallback(async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.currentTarget.files?.[0]
    if (!file) {
      event.currentTarget.value = ''
      return
    }

    try {
      const importedTemplate = await importTemplate(file)
      if (importedTemplate) {
        toast.success(importedTemplate.name ? `模板「${importedTemplate.name}」导入成功` : '模板导入成功')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入模板失败')
    } finally {
      event.currentTarget.value = ''
    }
  }, [importTemplate])

  return (
    <section className="page-builder-home-template-section w-full" data-testid="page-builder-template-library-section">
      <div className="page-builder-home-template-header flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl border border-border/55 bg-background/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
            <LibraryBig className="size-4 text-foreground/78" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground">模板库</h2>
            <p className="text-sm text-muted-foreground">复用已经另存的页面模板，快速创建新项目。</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={importInputRef}
            accept=".zip,application/zip,application/x-zip-compressed"
            className="hidden"
            onChange={(event) => {
              void handleImportChange(event)
            }}
            type="file"
          />
          <Button
            aria-label="导入模板"
            className="h-9 rounded-full px-3"
            disabled={importingTemplate}
            onClick={() => {
              importInputRef.current?.click()
            }}
            type="button"
            variant="outline"
          >
            {importingTemplate ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" />
            ) : (
              <Upload className="mr-2 size-4" />
            )}
            {importingTemplate ? '导入中...' : '导入模板'}
          </Button>
          <Button
            aria-label="刷新模板库"
            className="h-9 rounded-full px-3"
            onClick={() => {
              void refreshTemplates()
            }}
            type="button"
            variant="outline"
          >
            <RefreshCw className="mr-2 size-4" />
            刷新
          </Button>
        </div>
      </div>

      {error && (
        <div className="page-builder-home-template-feedback mt-4 flex items-center justify-between gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            {error}
          </span>
          <Button
            className="rounded-full"
            onClick={() => {
              void refreshTemplates()
            }}
            type="button"
            variant="outline"
          >
            重试
          </Button>
        </div>
      )}

      {loading ? (
        <div className="page-builder-home-template-grid mt-5 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`template-skeleton-${index}`}
              className="min-h-[300px] rounded-[28px] border border-border/45 bg-background/78 p-5 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.4)]"
            >
              <div className="h-28 animate-pulse rounded-[22px] bg-muted/45" />
              <div className="mt-5 space-y-3">
                <div className="h-4 w-2/3 rounded-full bg-muted/60" />
                <div className="h-3 w-full rounded-full bg-muted/45" />
                <div className="h-3 w-1/2 rounded-full bg-muted/45" />
              </div>
              <div className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                正在加载模板库...
              </div>
            </div>
          ))}
        </div>
      ) : templates.length > 0 ? (
        <div className="page-builder-home-template-grid mt-5 grid gap-4 md:grid-cols-3">
          {templates.map((template) => (
            <PageBuilderTemplateCard
              key={template.id}
              deleting={deletingTemplateId === template.id}
              onDelete={setPendingDelete}
              onDownload={downloadTemplate}
              onPreview={openPreview}
              onRename={async (template, name) => {
                await renameTemplate(template.id, name)
              }}
              onUse={allowTemplateUse ? openUseDialog : undefined}
              renaming={renamingTemplateId === template.id}
              template={template}
              useDisabled={usingTemplateId !== null}
              using={usingTemplateId === template.id}
            />
          ))}
        </div>
      ) : (
        <div className="page-builder-home-template-empty mt-5 rounded-[28px] border border-dashed border-border/55 bg-background/68 px-6 py-10 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
          <p className="text-sm font-medium text-foreground/82">还没有可用模板</p>
          <p className="mx-auto mt-2 max-w-[34ch] text-sm leading-6 text-muted-foreground">
            先在 Builder 中将当前项目另存为模板，之后这里会显示可复用的模板卡片。
          </p>
        </div>
      )}

      <Dialog
        onOpenChange={(open) => {
          if (open || usingTemplateId !== null) return
          setPendingUse(null)
          setProjectName('')
        }}
        open={pendingUse !== null}
      >
        {pendingUse ? (
          <DialogContent className="rounded-[24px] border-border/60 sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>使用模板</DialogTitle>
              <DialogDescription>
                输入新项目名称后，将基于“{pendingUse.name}”创建一个新的 PageBuilder 项目。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor="page-builder-template-project-name">
                项目名称
              </label>
              <Input
                aria-label="项目名称"
                disabled={usingTemplateId !== null}
                id="page-builder-template-project-name"
                maxLength={100}
                onChange={(event) => setProjectName(event.currentTarget.value)}
                placeholder="请输入项目名称"
                value={projectName}
              />
            </div>

            <DialogFooter>
              <Button
                disabled={usingTemplateId !== null}
                onClick={() => {
                  setPendingUse(null)
                  setProjectName('')
                }}
                type="button"
                variant="outline"
              >
                取消
              </Button>
              <Button
                disabled={useConfirmDisabled}
                onClick={() => {
                  void handleUseTemplate()
                }}
                type="button"
              >
                {usingTemplateId !== null ? '创建中...' : '创建项目'}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        open={pendingDelete !== null}
      >
        {pendingDelete && (
          <AlertDialogContent className="page-builder-home-delete-dialog rounded-[24px] border-border/60">
            <AlertDialogHeader className="page-builder-home-delete-dialog-header">
              <AlertDialogTitle className="page-builder-home-delete-dialog-title">删除模板</AlertDialogTitle>
              <AlertDialogDescription className="page-builder-home-delete-dialog-description">
                删除后将移除“{pendingDelete.name}”模板文件，但不会影响已通过该模板创建的项目。
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
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </section>
  )
}
