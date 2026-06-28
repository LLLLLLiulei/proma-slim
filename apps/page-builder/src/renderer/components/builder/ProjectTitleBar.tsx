import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Check, Code, MessageSquare, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import type { PageBuilderEditLockCredentials } from '@ai-page-builder/shared'
import { agentWorkspacesAtom } from '@/atoms/agent-atoms'
import { api } from '@/lib/api'
import { builderActiveTabAtom } from '@page-builder/atoms/builder-code-atoms'
import { cn } from '@/lib/utils'
import { isPageBuilderEditLockRejected } from '@page-builder/lib/edit-lock-errors'

export function ProjectTitleBar({
  editLock,
  editingDisabled = false,
  onEditLockRejected,
  onRequestSaveTemplate,
  saveTemplateDisabled = false,
  saveTemplateTitle,
  workspaceId,
}: {
  editLock?: PageBuilderEditLockCredentials
  editingDisabled?: boolean
  onEditLockRejected?: (error: unknown) => void
  onRequestSaveTemplate?: () => void
  saveTemplateDisabled?: boolean
  saveTemplateTitle?: string
  workspaceId: string
}): React.ReactElement | null {
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const setWorkspaces = useSetAtom(agentWorkspacesAtom)
  const workspace = workspaces.find((item) => item.id === workspaceId) ?? null
  const [editing, setEditing] = React.useState(false)
  const [draftName, setDraftName] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useAtom(builderActiveTabAtom)

  React.useEffect(() => {
    if (!editing) return

    if (typeof requestAnimationFrame === 'function') {
      const frameId = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(frameId)
    }

    const timeoutId = globalThis.setTimeout(() => inputRef.current?.focus(), 0)
    return () => globalThis.clearTimeout(timeoutId)
  }, [editing])

  if (!workspace) return null

  const saveName = async (): Promise<void> => {
    const trimmed = draftName.trim()
    if (!trimmed || trimmed === workspace.name) {
      setEditing(false)
      return
    }

    try {
      const updated = editLock
        ? await api.updateWorkspace(workspaceId, { name: trimmed }, { editLock })
        : await api.updateWorkspace(workspaceId, { name: trimmed })
      setWorkspaces((prev) => prev.map((item) => item.id === updated.id ? updated : item))
    } catch (error) {
      console.error('[ProjectTitleBar] 更新工作区名称失败:', error)
      if (isPageBuilderEditLockRejected(error)) {
        onEditLockRejected?.(error)
      }
      toast.error(error instanceof Error ? error.message : '更新项目名称失败')
    } finally {
      setEditing(false)
    }
  }

  return (
    <div className="flex h-11 items-center gap-2 border-b border-border/70 px-3">
      {editing ? (
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <input
            ref={inputRef}
            className="min-w-0 flex-1 border-b border-primary/40 bg-transparent px-0 py-0.5 text-sm font-medium outline-none"
            maxLength={100}
            onBlur={() => { void saveName() }}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void saveName()
              }
              if (event.key === 'Escape') {
                setEditing(false)
              }
            }}
            value={draftName}
          />
          <button
            className="p-1 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => { void saveName() }}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            <Check className="size-3.5" />
          </button>
          <button
            className="p-1 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setEditing(false)}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{workspace.name}</span>
          <button
            aria-label="编辑项目名"
            className="p-1 text-muted-foreground transition-colors hover:text-foreground"
            disabled={editingDisabled}
            onClick={() => {
              if (editingDisabled) return
              setDraftName(workspace.name)
              setEditing(true)
            }}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      )}
      {!editing && onRequestSaveTemplate ? (
        <button
          aria-label="另存模板"
          className="shrink-0 rounded-md border border-border/70 bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border/70 disabled:hover:text-muted-foreground"
          disabled={saveTemplateDisabled}
          onClick={() => {
            if (saveTemplateDisabled) return
            onRequestSaveTemplate()
          }}
          onMouseDown={(event) => event.preventDefault()}
          title={saveTemplateTitle}
          type="button"
        >
          另存模板
        </button>
      ) : null}
      {/* 对话 / 代码 Tab，分段控件样式，置于标题栏最右 */}
      <div role="tablist" className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/70 p-0.5">
        {(['chat', 'code'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={activeTab === value}
            onClick={() => setActiveTab(value)}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors',
              activeTab === value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {value === 'chat'
              ? <><MessageSquare className="size-3.5" />对话</>
              : <><Code className="size-3.5" />代码</>}
          </button>
        ))}
      </div>
    </div>
  )
}
