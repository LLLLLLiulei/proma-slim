import * as React from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
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
  agentRunningSessionIdsAtom,
  agentSessionsAtom,
  agentWorkspacesAtom,
  currentAgentSessionIdAtom,
  currentAgentWorkspaceIdAtom,
} from '@/atoms/agent-atoms'
import {
  activeSessionTabIdAtom,
  closeSessionTab,
  initializeSessionTabs,
  openSessionTab,
  resolveSessionSelection,
  sessionTabsAtom,
  type SessionTab,
} from '@/atoms/session-tabs'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import {
  resolveWorkspaceSelectionFallback,
  WorkspaceSidebarSection,
} from './WorkspaceSidebarSection'
import type { AgentSessionMeta, AgentWorkspace } from '@proma/shared'

type DateGroupLabel = '今天' | '昨天' | '更早'

const PIN_OVERRIDES_STORAGE_KEY = 'proma-ui-pin-overrides'

function readPinOverrides(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(PIN_OVERRIDES_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, boolean>
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

function groupByDate(items: AgentSessionMeta[]): Array<{ label: DateGroupLabel; items: AgentSessionMeta[] }> {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86_400_000

  const today: AgentSessionMeta[] = []
  const yesterday: AgentSessionMeta[] = []
  const earlier: AgentSessionMeta[] = []

  for (const item of items) {
    if (item.updatedAt >= todayStart) {
      today.push(item)
    } else if (item.updatedAt >= yesterdayStart) {
      yesterday.push(item)
    } else {
      earlier.push(item)
    }
  }

  const groups: Array<{ label: DateGroupLabel; items: AgentSessionMeta[] }> = []
  if (today.length > 0) groups.push({ label: '今天', items: today })
  if (yesterday.length > 0) groups.push({ label: '昨天', items: yesterday })
  if (earlier.length > 0) groups.push({ label: '更早', items: earlier })
  return groups
}

function formatSessionTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function resolveInitialWorkspaceId(
  workspaces: Array<{ id: string }>,
  preferredWorkspaceId: string | null,
): string | null {
  if (workspaces.length === 0) {
    return null
  }

  return workspaces.find((workspace) => workspace.id === preferredWorkspaceId)?.id ?? workspaces[0]!.id
}

export function resolveInitialWorkspaceSelection(
  workspaces: Array<Pick<AgentWorkspace, 'id'>>,
  sessions: Array<Pick<AgentSessionMeta, 'id' | 'workspaceId'>>,
  preferredWorkspaceId: string | null,
  currentSessionId: string | null,
): string | null {
  if (workspaces.length === 0) {
    return null
  }

  if (preferredWorkspaceId && workspaces.some((workspace) => workspace.id === preferredWorkspaceId)) {
    return preferredWorkspaceId
  }

  const sessionWorkspaceId = currentSessionId
    ? sessions.find((session) => session.id === currentSessionId)?.workspaceId ?? null
    : null

  if (sessionWorkspaceId && workspaces.some((workspace) => workspace.id === sessionWorkspaceId)) {
    return sessionWorkspaceId
  }

  return resolveInitialWorkspaceId(workspaces, preferredWorkspaceId)
}

export function getVisibleSessionsForWorkspace(
  sessions: AgentSessionMeta[],
  workspaceId: string | null,
): AgentSessionMeta[] {
  if (!workspaceId) {
    return []
  }

  return sessions.filter((session) => session.workspaceId === workspaceId)
}

function SectionHeader({
  label,
  collapsible = false,
  expanded = true,
  onToggle,
}: {
  label: string
  collapsible?: boolean
  expanded?: boolean
  onToggle?: () => void
}): React.ReactElement {
  const content = (
    <>
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">{label}</span>
      {collapsible && (
        expanded
          ? <ChevronDown className="size-3.5 text-muted-foreground" />
          : <ChevronRight className="size-3.5 text-muted-foreground" />
      )}
    </>
  )

  if (!collapsible) {
    return <div className="mb-1 flex items-center justify-between px-2">{content}</div>
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className="mb-1 flex w-full items-center justify-between rounded-md px-2 py-1 text-left transition-colors hover:bg-foreground/[0.03]"
    >
      {content}
    </button>
  )
}

function SessionRow({
  session,
  isActive,
  isRunning,
  isEditing,
  isPinned,
  draftTitle,
  onSelect,
  onStartRename,
  onChangeDraft,
  onCommitRename,
  onCancelRename,
  onRequestDelete,
  onTogglePin,
}: {
  session: AgentSessionMeta
  isActive: boolean
  isRunning: boolean
  isEditing: boolean
  isPinned: boolean
  draftTitle: string
  onSelect: () => void
  onStartRename: () => void
  onChangeDraft: (value: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onRequestDelete: () => void
  onTogglePin: () => void
}): React.ReactElement {
  return (
    <div
      className={cn(
        'group relative rounded-[10px] transition-colors',
        isActive
          ? 'bg-foreground/[0.08] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]'
          : 'text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-2 px-3 py-[7px] text-left"
      >
        <span className="relative flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
          <MessageSquareText className="size-3.5" />
          {isRunning && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-sky-500 ring-2 ring-background" />}
        </span>
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <input
              autoFocus
              value={draftTitle}
              maxLength={100}
              onChange={(event) => onChangeDraft(event.target.value)}
              onBlur={onCommitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onCommitRename()
                }
                if (event.key === 'Escape') {
                  onCancelRename()
                }
              }}
              className="w-full border-b border-primary bg-transparent pb-0.5 text-[13px] font-medium outline-none"
            />
          ) : (
            <div className="truncate text-[13px] font-medium">{session.title}</div>
          )}
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{formatSessionTime(session.updatedAt)}</div>
        </div>
      </button>

      {!isEditing && (
        <div className="absolute inset-y-0 right-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onTogglePin}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            aria-label={isPinned ? '取消置顶会话' : '置顶会话'}
          >
            {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </button>
          <button
            type="button"
            onClick={onStartRename}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            aria-label="重命名会话"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onRequestDelete}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
            aria-label="删除会话"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

export function LeftSidebar(): React.ReactElement {
  const [sessions, setSessions] = useAtom(agentSessionsAtom)
  const [workspaces, setWorkspaces] = useAtom(agentWorkspacesAtom)
  const [currentSessionId, setCurrentSessionId] = useAtom(currentAgentSessionIdAtom)
  const [currentWorkspaceId, setCurrentWorkspaceId] = useAtom(currentAgentWorkspaceIdAtom)
  const sessionTabs = useAtomValue(sessionTabsAtom)
  const activeSessionTabId = useAtomValue(activeSessionTabIdAtom)
  const runningSessionIds = useAtomValue(agentRunningSessionIdsAtom)
  const setSessionTabs = useSetAtom(sessionTabsAtom)
  const setActiveSessionTabId = useSetAtom(activeSessionTabIdAtom)

  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [draftTitle, setDraftTitle] = React.useState('')
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(null)
  const [editingWorkspaceId, setEditingWorkspaceId] = React.useState<string | null>(null)
  const [editingWorkspaceName, setEditingWorkspaceName] = React.useState('')
  const [pendingWorkspaceDeleteId, setPendingWorkspaceDeleteId] = React.useState<string | null>(null)
  const [isCreating, setIsCreating] = React.useState(false)
  const [isCreatingWorkspace, setIsCreatingWorkspace] = React.useState(false)
  const [isRestoringSelection, setIsRestoringSelection] = React.useState(true)
  const [newWorkspaceName, setNewWorkspaceName] = React.useState('')
  const [pinnedExpanded, setPinnedExpanded] = React.useState(true)
  const [pinOverrides, setPinOverrides] = React.useState<Record<string, boolean>>(() => readPinOverrides())
  const workspaceInputRef = React.useRef<HTMLInputElement>(null)
  const workspaceEditInputRef = React.useRef<HTMLInputElement>(null)
  const currentWorkspaceIdRef = React.useRef<string | null>(currentWorkspaceId)
  currentWorkspaceIdRef.current = currentWorkspaceId

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(PIN_OVERRIDES_STORAGE_KEY, JSON.stringify(pinOverrides))
  }, [pinOverrides])

  const applyTabSelection = React.useCallback((
    nextTabs: SessionTab[],
    nextActiveTabId: string | null,
    nextSessions: AgentSessionMeta[],
  ): void => {
    setSessionTabs(nextTabs)
    setActiveSessionTabId(nextActiveTabId)

    const nextSelection = resolveSessionSelection(nextTabs, nextActiveTabId, nextSessions)
    setCurrentSessionId(nextSelection.sessionId)
  }, [setActiveSessionTabId, setCurrentSessionId, setCurrentWorkspaceId, setSessionTabs])

  const activateSession = React.useCallback((session: AgentSessionMeta): void => {
    const nextSessions = sessions.some((item) => item.id === session.id)
      ? sessions.map((item) => item.id === session.id ? session : item)
      : [session, ...sessions]
    const next = openSessionTab(sessionTabs, session)
    applyTabSelection(next.tabs, next.activeTabId, nextSessions)
  }, [applyTabSelection, sessionTabs, sessions])

  React.useEffect(() => {
    let cancelled = false

    void Promise.all([api.listSessions(), api.listWorkspaces()]).then(([nextSessions, nextWorkspaces]) => {
      if (cancelled) return

      setSessions(nextSessions)
      setWorkspaces(nextWorkspaces)

      const initialized = initializeSessionTabs(currentSessionId, nextSessions, sessionTabs, activeSessionTabId)
      setCurrentWorkspaceId(resolveInitialWorkspaceSelection(
        nextWorkspaces,
        nextSessions,
        currentWorkspaceIdRef.current,
        initialized.currentSessionId,
      ))
      setCurrentSessionId(initialized.currentSessionId)
      setSessionTabs(initialized.tabs)
      setActiveSessionTabId(initialized.activeTabId)
    }).catch((error) => {
      console.error('[LeftSidebar] 加载会话失败:', error)
      toast.error(error instanceof Error ? error.message : '加载工作区或会话失败')
    }).finally(() => {
      if (!cancelled) {
        setIsRestoringSelection(false)
      }
    })

    return () => {
      cancelled = true
    }
    // 只在挂载时初始化，后续由本地状态同步驱动，避免异步刷新覆盖 tab 状态。
  }, [])

  React.useEffect(() => {
    if (!isCreatingWorkspace) return

    const timer = window.setTimeout(() => {
      workspaceInputRef.current?.focus()
      workspaceInputRef.current?.select()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [isCreatingWorkspace])

  React.useEffect(() => {
    if (!editingWorkspaceId) return

    const timer = window.setTimeout(() => {
      workspaceEditInputRef.current?.focus()
      workspaceEditInputRef.current?.select()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [editingWorkspaceId])

  const isPinned = React.useCallback((session: AgentSessionMeta): boolean => {
    if (Object.prototype.hasOwnProperty.call(pinOverrides, session.id)) {
      return Boolean(pinOverrides[session.id])
    }
    return Boolean(session.pinned)
  }, [pinOverrides])

  const visibleSessions = React.useMemo(
    () => getVisibleSessionsForWorkspace(sessions, currentWorkspaceId),
    [currentWorkspaceId, sessions],
  )

  const sortedSessions = React.useMemo(
    () => [...visibleSessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [visibleSessions]
  )

  const pinnedSessions = React.useMemo(
    () => sortedSessions.filter((session) => isPinned(session)),
    [isPinned, sortedSessions]
  )

  const recentGroups = React.useMemo(
    () => groupByDate(sortedSessions.filter((session) => !isPinned(session))),
    [isPinned, sortedSessions]
  )

  const workspaceSessionCounts = React.useMemo(() => {
    const next = new Map<string, number>()
    for (const session of sessions) {
      if (!session.workspaceId) continue
      next.set(session.workspaceId, (next.get(session.workspaceId) ?? 0) + 1)
    }
    return next
  }, [sessions])

  const handleCreate = async (): Promise<void> => {
    if (isCreating || isRestoringSelection || !currentWorkspaceId) return
    setIsCreating(true)

    try {
      const session = await api.createSession(undefined, currentWorkspaceId ?? undefined)
      setSessions((prev) => [session, ...prev])
      activateSession(session)
    } catch (error) {
      console.error('[LeftSidebar] 创建会话失败:', error)
      toast.error(error instanceof Error ? error.message : '创建会话失败')
    } finally {
      setIsCreating(false)
    }
  }

  const handleCreateWorkspace = async (): Promise<void> => {
    const trimmedName = newWorkspaceName.trim()
    if (!trimmedName) {
      setIsCreatingWorkspace(false)
      setNewWorkspaceName('')
      return
    }

    try {
      const workspace = await api.createWorkspace(trimmedName)
      setWorkspaces((prev) => [workspace, ...prev])
      setCurrentWorkspaceId(workspace.id)
      setEditingWorkspaceId(null)
      setEditingWorkspaceName('')
      setIsCreatingWorkspace(false)
      setNewWorkspaceName('')
    } catch (error) {
      console.error('[LeftSidebar] 创建工作区失败:', error)
      toast.error(error instanceof Error ? error.message : '创建工作区失败')
    }
  }

  const startCreateWorkspace = (): void => {
    setEditingWorkspaceId(null)
    setEditingWorkspaceName('')
    setIsCreatingWorkspace(true)
    setNewWorkspaceName('')
  }

  const cancelCreateWorkspace = (): void => {
    setIsCreatingWorkspace(false)
    setNewWorkspaceName('')
  }

  const startRenameWorkspace = (workspace: { id: string; name: string }): void => {
    setIsCreatingWorkspace(false)
    setNewWorkspaceName('')
    setEditingWorkspaceId(workspace.id)
    setEditingWorkspaceName(workspace.name)
  }

  const commitRenameWorkspace = async (): Promise<void> => {
    if (!editingWorkspaceId) return

    const trimmedName = editingWorkspaceName.trim()
    const targetWorkspace = workspaces.find((workspace) => workspace.id === editingWorkspaceId)
    if (!targetWorkspace) {
      setEditingWorkspaceId(null)
      setEditingWorkspaceName('')
      return
    }

    if (!trimmedName || trimmedName === targetWorkspace.name) {
      setEditingWorkspaceId(null)
      setEditingWorkspaceName('')
      return
    }

    try {
      const updated = await api.updateWorkspace(editingWorkspaceId, { name: trimmedName })
      setWorkspaces((prev) => prev.map((workspace) => workspace.id === updated.id ? updated : workspace))
    } catch (error) {
      console.error('[LeftSidebar] 重命名工作区失败:', error)
      toast.error(error instanceof Error ? error.message : '重命名工作区失败')
    } finally {
      setEditingWorkspaceId(null)
      setEditingWorkspaceName('')
    }
  }

  const cancelRenameWorkspace = (): void => {
    setEditingWorkspaceId(null)
    setEditingWorkspaceName('')
  }

  const requestDeleteWorkspace = (workspace: { id: string }): void => {
    setPendingWorkspaceDeleteId(workspace.id)
  }

  const confirmDeleteWorkspace = async (): Promise<void> => {
    if (!pendingWorkspaceDeleteId) return

    try {
      await api.deleteWorkspace(pendingWorkspaceDeleteId)

      const nextWorkspaces = workspaces.filter((workspace) => workspace.id !== pendingWorkspaceDeleteId)
      setWorkspaces(nextWorkspaces)

      if (currentWorkspaceId === pendingWorkspaceDeleteId || !nextWorkspaces.some((workspace) => workspace.id === currentWorkspaceId)) {
        setCurrentWorkspaceId(resolveWorkspaceSelectionFallback(nextWorkspaces))
      }
    } catch (error) {
      console.error('[LeftSidebar] 删除工作区失败:', error)
      toast.error(error instanceof Error ? error.message : '删除工作区失败')
    } finally {
      setPendingWorkspaceDeleteId(null)
    }
  }

  const startRename = (session: AgentSessionMeta): void => {
    setEditingId(session.id)
    setDraftTitle(session.title)
  }

  const commitRename = async (): Promise<void> => {
    if (!editingId) return

    const trimmed = draftTitle.trim()
    const targetSession = sessions.find((session) => session.id === editingId)
    if (!targetSession) {
      setEditingId(null)
      return
    }

    if (!trimmed || trimmed === targetSession.title) {
      setEditingId(null)
      setDraftTitle('')
      return
    }

    try {
      const updated = await api.updateSessionTitle(editingId, trimmed)
      setSessions((prev) => prev.map((session) => session.id === updated.id ? updated : session))
      setSessionTabs((prev) => prev.map((tab) => tab.sessionId === updated.id ? { ...tab, title: updated.title } : tab))
    } catch (error) {
      console.error('[LeftSidebar] 重命名会话失败:', error)
      toast.error(error instanceof Error ? error.message : '重命名会话失败')
    } finally {
      setEditingId(null)
      setDraftTitle('')
    }
  }

  const confirmDelete = async (): Promise<void> => {
    if (!pendingDeleteId) return

    try {
      await api.deleteSession(pendingDeleteId)
      const nextSessions = sessions.filter((session) => session.id !== pendingDeleteId)
      setSessions(nextSessions)

      const closed = closeSessionTab(sessionTabs, activeSessionTabId, pendingDeleteId)
      let nextTabs = closed.tabs
      let nextActiveTabId = closed.activeTabId

      if (!nextActiveTabId && nextSessions.length > 0) {
        const fallbackSession = nextSessions[0]!
        const opened = openSessionTab(nextTabs, fallbackSession)
        nextTabs = opened.tabs
        nextActiveTabId = opened.activeTabId
      }

      applyTabSelection(nextTabs, nextActiveTabId, nextSessions)

    } catch (error) {
      console.error('[LeftSidebar] 删除会话失败:', error)
      toast.error(error instanceof Error ? error.message : '删除会话失败')
    } finally {
      setPendingDeleteId(null)
    }
  }

  const togglePin = (session: AgentSessionMeta): void => {
    setPinOverrides((prev) => {
      const current = Object.prototype.hasOwnProperty.call(prev, session.id)
        ? Boolean(prev[session.id])
        : Boolean(session.pinned)
      const nextValue = !current
      const next = { ...prev }
      if (nextValue === Boolean(session.pinned)) {
        delete next[session.id]
      } else {
        next[session.id] = nextValue
      }
      return next
    })
  }

  return (
    <aside className="flex h-full min-h-0 w-[280px] shrink-0 flex-col border-r border-border/40 bg-transparent">
      <div className="px-3 pt-4">
        <WorkspaceSidebarSection
          workspaces={workspaces}
          currentWorkspaceId={currentWorkspaceId}
          workspaceSessionCounts={workspaceSessionCounts}
          isCreatingWorkspace={isCreatingWorkspace}
          newWorkspaceName={newWorkspaceName}
          editingWorkspaceId={editingWorkspaceId}
          editingWorkspaceName={editingWorkspaceName}
          workspaceInputRef={workspaceInputRef}
          workspaceEditInputRef={workspaceEditInputRef}
          onSelectWorkspace={(workspace) => setCurrentWorkspaceId(workspace.id)}
          onStartCreateWorkspace={startCreateWorkspace}
          onChangeNewWorkspaceName={setNewWorkspaceName}
          onSubmitCreateWorkspace={() => { void handleCreateWorkspace() }}
          onCancelCreateWorkspace={cancelCreateWorkspace}
          onStartRenameWorkspace={startRenameWorkspace}
          onChangeEditWorkspaceName={setEditingWorkspaceName}
          onSubmitRenameWorkspace={() => { void commitRenameWorkspace() }}
          onCancelRenameWorkspace={cancelRenameWorkspace}
          onRequestDeleteWorkspace={requestDeleteWorkspace}
          onBlockedDeleteWorkspace={(message) => toast.error(message)}
        />
        <button
          type="button"
          onClick={() => { void handleCreate() }}
          disabled={isCreating || isRestoringSelection || !currentWorkspaceId}
          className="mt-2 flex w-full items-center gap-2 rounded-[10px] border border-dashed border-foreground/10 bg-foreground/[0.03] px-3 py-2 text-[13px] font-medium text-foreground/70 transition-colors hover:border-foreground/20 hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50"
        >
          {isCreating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
          <span>新会话</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-3 scrollbar-none">
        {visibleSessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm leading-6 text-muted-foreground">
            还没有会话。点击上方的“新会话”开始。
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <SectionHeader
                label="置顶会话"
                collapsible
                expanded={pinnedExpanded}
                onToggle={() => setPinnedExpanded((prev) => !prev)}
              />
              {pinnedExpanded && pinnedSessions.length > 0 && (
                <div className="ml-2 space-y-1 border-l-2 border-primary/20 pl-1">
                    {pinnedSessions.map((session) => (
                      <SessionRow
                        key={`pinned-${session.id}`}
                        session={session}
                        isActive={currentSessionId === session.id}
                        isRunning={runningSessionIds.has(session.id)}
                        isEditing={editingId === session.id}
                        isPinned={isPinned(session)}
                        draftTitle={editingId === session.id ? draftTitle : session.title}
                        onSelect={() => activateSession(session)}
                        onStartRename={() => startRename(session)}
                        onChangeDraft={setDraftTitle}
                        onCommitRename={() => { void commitRename() }}
                        onCancelRename={() => {
                          setEditingId(null)
                          setDraftTitle('')
                        }}
                        onRequestDelete={() => setPendingDeleteId(session.id)}
                        onTogglePin={() => togglePin(session)}
                      />
                    ))}
                </div>
              )}
            </div>

            {recentGroups.map((group) => (
              <div key={group.label}>
                <SectionHeader label={group.label} />
                <div className="space-y-1">
                  {group.items.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      isActive={currentSessionId === session.id}
                      isRunning={runningSessionIds.has(session.id)}
                      isEditing={editingId === session.id}
                      isPinned={isPinned(session)}
                      draftTitle={editingId === session.id ? draftTitle : session.title}
                      onSelect={() => activateSession(session)}
                      onStartRename={() => startRename(session)}
                      onChangeDraft={setDraftTitle}
                      onCommitRename={() => { void commitRename() }}
                      onCancelRename={() => {
                        setEditingId(null)
                        setDraftTitle('')
                      }}
                      onRequestDelete={() => setPendingDeleteId(session.id)}
                      onTogglePin={() => togglePin(session)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => {
        if (!open) setPendingDeleteId(null)
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除会话</AlertDialogTitle>
            <AlertDialogDescription>
              会话删除后不可恢复，对应的本地消息记录也会一并移除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { void confirmDelete() }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingWorkspaceDeleteId !== null} onOpenChange={(open) => {
        if (!open) setPendingWorkspaceDeleteId(null)
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除工作区</AlertDialogTitle>
            <AlertDialogDescription>
              仅会移除工作区元数据，已有目录文件会保留。请确认该工作区下已经没有会话。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { void confirmDeleteWorkspace() }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  )
}
