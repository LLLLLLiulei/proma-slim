import * as React from 'react'
import { FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import type { AgentWorkspace } from '@proma/shared'
import { cn } from '@/lib/utils'

export interface WorkspaceSidebarSectionProps {
  workspaces: AgentWorkspace[]
  currentWorkspaceId: string | null
  workspaceSessionCounts: ReadonlyMap<string, number>
  isCreatingWorkspace: boolean
  newWorkspaceName: string
  editingWorkspaceId: string | null
  editingWorkspaceName: string
  workspaceInputRef: React.Ref<HTMLInputElement>
  workspaceEditInputRef: React.Ref<HTMLInputElement>
  onSelectWorkspace: (workspace: AgentWorkspace) => void
  onStartCreateWorkspace: () => void
  onChangeNewWorkspaceName: (value: string) => void
  onSubmitCreateWorkspace: () => void
  onCancelCreateWorkspace: () => void
  onStartRenameWorkspace: (workspace: AgentWorkspace) => void
  onChangeEditWorkspaceName: (value: string) => void
  onSubmitRenameWorkspace: () => void
  onCancelRenameWorkspace: () => void
  onRequestDeleteWorkspace: (workspace: AgentWorkspace) => void
  onBlockedDeleteWorkspace: (message: string) => void
}

const DEFAULT_WORKSPACE_SLUG = 'default'

export function getWorkspaceDeleteBlockedReason(
  workspace: Pick<AgentWorkspace, 'slug'>,
  sessionCount: number,
): string | null {
  if (workspace.slug === DEFAULT_WORKSPACE_SLUG) {
    return '默认工作区不可删除'
  }

  if (sessionCount > 0) {
    return '请先迁移或删除该工作区下的会话'
  }

  return null
}

export function resolveWorkspaceSelectionFallback(
  workspaces: Array<Pick<AgentWorkspace, 'id' | 'slug'>>,
): string | null {
  return workspaces.find((workspace) => workspace.slug === DEFAULT_WORKSPACE_SLUG)?.id
    ?? workspaces[0]?.id
    ?? null
}

function WorkspaceRow({
  workspace,
  isCurrent,
  isEditing,
  editValue,
  sessionCount,
  editInputRef,
  onSelect,
  onChangeEditValue,
  onSubmitEdit,
  onCancelEdit,
  onStartRename,
  onRequestDelete,
  onBlockedDelete,
}: {
  workspace: AgentWorkspace
  isCurrent: boolean
  isEditing: boolean
  editValue: string
  sessionCount: number
  editInputRef: React.Ref<HTMLInputElement>
  onSelect: () => void
  onChangeEditValue: (value: string) => void
  onSubmitEdit: () => void
  onCancelEdit: () => void
  onStartRename: () => void
  onRequestDelete: () => void
  onBlockedDelete: (message: string) => void
}): React.ReactElement {
  const deleteBlockedReason = getWorkspaceDeleteBlockedReason(workspace, sessionCount)
  const showDeleteAction = workspace.slug !== DEFAULT_WORKSPACE_SLUG

  return (
    <div
      className={cn(
        'group relative rounded-md',
        isCurrent
          ? 'bg-foreground/[0.08] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
          : 'text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground',
      )}
    >
      {isEditing ? (
        <div className="flex w-full items-center gap-2 px-2.5 py-[5px] text-left text-[13px]">
          <FolderOpen className="size-[13px] shrink-0 text-foreground/40" />
          <input
            ref={editInputRef}
            value={editValue}
            maxLength={50}
            onChange={(event) => onChangeEditValue(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onBlur={onSubmitEdit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onSubmitEdit()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                onCancelEdit()
              }
            }}
            className="min-w-0 flex-1 border-b border-primary/50 bg-transparent px-0.5 text-[13px] text-foreground outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          data-workspace-id={workspace.id}
          aria-current={isCurrent ? 'true' : undefined}
          onClick={onSelect}
          className="flex w-full items-center gap-2 px-2.5 py-[5px] text-left text-[13px] transition-colors duration-100"
        >
          <FolderOpen className="size-[13px] shrink-0 text-foreground/40" />
          <>
            <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
          </>
        </button>
      )}

      {!isEditing && (
        <div className="absolute inset-y-0 right-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onStartRename()
            }}
            className="rounded p-0.5 text-foreground/30 transition-colors hover:bg-foreground/[0.08] hover:text-foreground/60"
            title="重命名工作区"
            aria-label="重命名工作区"
          >
            <Pencil className="size-3" />
          </button>
          {showDeleteAction && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                if (deleteBlockedReason) {
                  onBlockedDelete(deleteBlockedReason)
                  return
                }
                onRequestDelete()
              }}
              className={cn(
                'rounded p-0.5 transition-colors',
                deleteBlockedReason
                  ? 'text-foreground/20 hover:bg-foreground/[0.06] hover:text-foreground/40'
                  : 'text-foreground/30 hover:bg-destructive/10 hover:text-destructive',
              )}
              title={deleteBlockedReason ?? '删除工作区'}
              aria-label="删除工作区"
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function WorkspaceSidebarSection({
  workspaces,
  currentWorkspaceId,
  workspaceSessionCounts,
  isCreatingWorkspace,
  newWorkspaceName,
  editingWorkspaceId,
  editingWorkspaceName,
  workspaceInputRef,
  workspaceEditInputRef,
  onSelectWorkspace,
  onStartCreateWorkspace,
  onChangeNewWorkspaceName,
  onSubmitCreateWorkspace,
  onCancelCreateWorkspace,
  onStartRenameWorkspace,
  onChangeEditWorkspaceName,
  onSubmitRenameWorkspace,
  onCancelRenameWorkspace,
  onRequestDeleteWorkspace,
  onBlockedDeleteWorkspace,
}: WorkspaceSidebarSectionProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex max-h-[140px] flex-col gap-0.5 overflow-y-auto scrollbar-none">
        {workspaces.map((workspace) => (
          <WorkspaceRow
            key={workspace.id}
            workspace={workspace}
            isCurrent={workspace.id === currentWorkspaceId}
            isEditing={editingWorkspaceId === workspace.id}
            editValue={editingWorkspaceName}
            sessionCount={workspaceSessionCounts.get(workspace.id) ?? 0}
            editInputRef={workspaceEditInputRef}
            onSelect={() => onSelectWorkspace(workspace)}
            onChangeEditValue={onChangeEditWorkspaceName}
            onSubmitEdit={onSubmitRenameWorkspace}
            onCancelEdit={onCancelRenameWorkspace}
            onStartRename={() => onStartRenameWorkspace(workspace)}
            onRequestDelete={() => onRequestDeleteWorkspace(workspace)}
            onBlockedDelete={onBlockedDeleteWorkspace}
          />
        ))}
      </div>

      {isCreatingWorkspace ? (
        <div className="flex items-center gap-2 px-2.5 py-[5px]">
          <FolderOpen className="size-[13px] shrink-0 text-foreground/40" />
          <input
            ref={workspaceInputRef}
            value={newWorkspaceName}
            maxLength={50}
            onChange={(event) => onChangeNewWorkspaceName(event.target.value)}
            onBlur={() => {
              if (!newWorkspaceName.trim()) {
                onCancelCreateWorkspace()
                return
              }
              onSubmitCreateWorkspace()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onSubmitCreateWorkspace()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                onCancelCreateWorkspace()
              }
            }}
            placeholder="工作区名称"
            className="min-w-0 flex-1 border-b border-primary/50 bg-transparent px-0.5 text-[13px] text-foreground outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={onStartCreateWorkspace}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-[5px] text-[13px] text-foreground/40 transition-colors duration-100 hover:bg-foreground/[0.04] hover:text-foreground/60"
        >
          <Plus className="size-[13px]" />
          <span>新建工作区</span>
        </button>
      )}
    </div>
  )
}
