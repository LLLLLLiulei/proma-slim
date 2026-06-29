import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Check, Code, MessageSquare, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import type { PageBuilderEditLockCredentials } from '@ai-page-builder/shared'
import { agentWorkspacesAtom } from '@/atoms/agent-atoms'
import { api } from '@/lib/api'
import { builderActiveTabAtom } from '@page-builder/atoms/builder-code-atoms'
import {
  getPageBuilderVisibleRightPanelTab,
  isPageBuilderToolbarItemHidden,
  normalizePageBuilderHiddenToolbarItems,
  type PageBuilderToolbarItemKey,
} from '@page-builder/lib/toolbar-visibility'
import { cn } from '@/lib/utils'
import { isPageBuilderEditLockRejected } from '@page-builder/lib/edit-lock-errors'

export function ProjectTitleBar({
  editLock,
  editingDisabled = false,
  hiddenToolbarItems: hiddenToolbarItemsInput,
  onEditLockRejected,
  workspaceId,
}: {
  editLock?: PageBuilderEditLockCredentials
  editingDisabled?: boolean
  hiddenToolbarItems?: readonly PageBuilderToolbarItemKey[] | null
  onEditLockRejected?: (error: unknown) => void
  workspaceId: string
}): React.ReactElement | null {
  const workspaces = useAtomValue(agentWorkspacesAtom)
  const setWorkspaces = useSetAtom(agentWorkspacesAtom)
  const workspace = workspaces.find((item) => item.id === workspaceId) ?? null
  const [editing, setEditing] = React.useState(false)
  const [draftName, setDraftName] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useAtom(builderActiveTabAtom)
  const hiddenToolbarItems = React.useMemo(
    () => normalizePageBuilderHiddenToolbarItems(hiddenToolbarItemsInput),
    [hiddenToolbarItemsInput],
  )
  const resolvedActiveTab = getPageBuilderVisibleRightPanelTab(activeTab, hiddenToolbarItems)
  const showChatTab = !isPageBuilderToolbarItemHidden(hiddenToolbarItems, 'chatTab')
  const showCodeTab = !isPageBuilderToolbarItemHidden(hiddenToolbarItems, 'codeTab')
  const showTabGroup = showChatTab || showCodeTab
  const showProjectName = !isPageBuilderToolbarItemHidden(hiddenToolbarItems, 'projectName')

  React.useEffect(() => {
    if (resolvedActiveTab === activeTab) return
    setActiveTab(resolvedActiveTab)
  }, [activeTab, resolvedActiveTab, setActiveTab])

  React.useEffect(() => {
    if (!editing) return

    if (typeof requestAnimationFrame === 'function') {
      const frameId = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(frameId)
    }

    const timeoutId = globalThis.setTimeout(() => inputRef.current?.focus(), 0)
    return () => globalThis.clearTimeout(timeoutId)
  }, [editing])

  React.useEffect(() => {
    if (showProjectName) return
    setEditing(false)
  }, [showProjectName])

  if (!workspace) return null
  if (!showTabGroup && !showProjectName) return null

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
    <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border/70 px-3 py-1.5">
      {showTabGroup ? (
        <div role="tablist" className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/70 p-0.5">
          {showChatTab ? (
            <button
              role="tab"
              type="button"
              aria-selected={resolvedActiveTab === 'chat'}
              onClick={() => setActiveTab('chat')}
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium transition-colors',
                resolvedActiveTab === 'chat'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <MessageSquare className="size-3.5" />对话
            </button>
          ) : null}
          {showCodeTab ? (
            <button
              role="tab"
              type="button"
              aria-selected={resolvedActiveTab === 'code'}
              onClick={() => setActiveTab('code')}
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium transition-colors',
                resolvedActiveTab === 'code'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Code className="size-3.5" />代码
            </button>
          ) : null}
        </div>
      ) : null}
      {showProjectName ? (
        editing ? (
          <div className="ml-auto flex min-w-0 max-w-[60%] items-center gap-1.5">
            <input
              ref={inputRef}
              className="min-w-0 flex-1 border-b border-primary/40 bg-transparent px-0 py-0.5 text-right text-sm font-medium outline-none"
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
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
              onClick={() => { void saveName() }}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              <Check className="size-3.5" />
            </button>
            <button
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
              onClick={() => setEditing(false)}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <div className="ml-auto flex min-w-0 max-w-[60%] items-center justify-end gap-1.5">
            <span className="truncate text-sm font-medium text-foreground">{workspace.name}</span>
            <button
              aria-label="编辑项目名"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
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
        )
      ) : null}
    </div>
  )
}
