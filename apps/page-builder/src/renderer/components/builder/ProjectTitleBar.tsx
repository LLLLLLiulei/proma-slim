import * as React from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Check, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import type { PageBuilderEditLockCredentials } from '@ai-page-builder/shared'
import { agentWorkspacesAtom } from '@/atoms/agent-atoms'
import { api } from '@/lib/api'
import { isPageBuilderEditLockRejected } from '@page-builder/lib/edit-lock-errors'

export function ProjectTitleBar({
  editLock,
  editingDisabled = false,
  onEditLockRejected,
  workspaceId,
}: {
  editLock?: PageBuilderEditLockCredentials
  editingDisabled?: boolean
  onEditLockRejected?: (error: unknown) => void
  workspaceId: string
}): React.ReactElement | null {
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const setWorkspaces = useSetAtom(agentWorkspacesAtom)
  const workspace = workspaces.find((item) => item.id === workspaceId) ?? null
  const [editing, setEditing] = React.useState(false)
  const [draftName, setDraftName] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

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
    </div>
  )
}
