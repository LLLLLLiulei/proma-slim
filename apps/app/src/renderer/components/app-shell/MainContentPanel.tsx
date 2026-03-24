import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { MessageSquareText, Sparkles, X } from 'lucide-react'
import { agentSessionsAtom, currentAgentSessionIdAtom, currentAgentWorkspaceIdAtom } from '@/atoms/agent-atoms'
import { activeSessionTabIdAtom, closeSessionTab, reconcileSessionTabs, resolveSessionSelection, sessionTabsAtom, type SessionTab } from '@/atoms/session-tabs'
import { AgentView } from '@/components/agent'
import { cn } from '@/lib/utils'

export function resolveRenderableSessionId(
  activeTabSessionId: string | null,
  sessions: Array<{ id: string }>,
): string | null {
  if (!activeTabSessionId) return null
  return sessions.some((session) => session.id === activeTabSessionId) ? activeTabSessionId : null
}

export function resolveSelectionSyncFromActiveTab(
  currentSelection: { sessionId: string | null; workspaceId: string | null },
  tabs: SessionTab[],
  activeTabId: string | null,
  _sessions: Array<{ id: string; workspaceId?: string }>,
): { sessionId: string | null; workspaceId: string | null } | null {
  const nextSelection = resolveSessionSelection(tabs, activeTabId)
  if (!nextSelection.sessionId) {
    return currentSelection.sessionId === null
      ? null
      : { sessionId: null, workspaceId: currentSelection.workspaceId }
  }

  if (nextSelection.sessionId === currentSelection.sessionId) {
    return null
  }

  return {
    sessionId: nextSelection.sessionId,
    workspaceId: currentSelection.workspaceId,
  }
}

function EmptyState(): React.ReactElement {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-3xl border border-border/60 bg-background/95 p-8 text-center shadow-sm backdrop-blur">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="size-6" />
        </div>
        <h2 className="text-xl font-semibold">开始一个新的 Agent 会话</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          从左侧选择或创建一个会话，它会以页签形式保留在顶部，方便继续多轮切换。
        </p>
      </div>
    </div>
  )
}

function SessionTabStrip({
  tabs,
  activeTabId,
  onActivate,
  onClose,
}: {
  tabs: Array<{ id: string; title: string }>
  activeTabId: string | null
  onActivate: (tabId: string) => void
  onClose: (tabId: string) => void
}): React.ReactElement {
  return (
    <div className="proma-tab-strip flex h-[38px] items-end gap-0.5 px-2 pt-1 titlebar-drag-region">
      <div className="flex min-w-0 flex-1 items-end overflow-x-auto scrollbar-none titlebar-no-drag">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId

          return (
            <button
              key={tab.id}
              type="button"
              data-active={isActive}
              className={cn(
                'proma-tab-item group flex h-[33px] min-w-[104px] max-w-[220px] items-center gap-2 px-3 text-left',
                isActive && 'is-active'
              )}
              onClick={() => onActivate(tab.id)}
              onMouseDown={(event) => {
                if (event.button === 1) {
                  event.preventDefault()
                  onClose(tab.id)
                }
              }}
            >
              <MessageSquareText className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{tab.title}</span>
              <span
                role="button"
                tabIndex={-1}
                className={cn(
                  'proma-tab-close flex size-4 shrink-0 items-center justify-center rounded-sm',
                  isActive && 'opacity-70'
                )}
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(tab.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onClose(tab.id)
                  }
                }}
              >
                <X className="size-3" />
              </span>
            </button>
          )
        })}
      </div>
      <div className="flex-1" />
    </div>
  )
}

export function MainContentPanel(): React.ReactElement {
  const [currentSessionId, setCurrentSessionId] = useAtom(currentAgentSessionIdAtom)
  const [currentWorkspaceId, setCurrentWorkspaceId] = useAtom(currentAgentWorkspaceIdAtom)
  const sessions = useAtomValue(agentSessionsAtom)
  const [sessionTabs, setSessionTabs] = useAtom(sessionTabsAtom)
  const [activeSessionTabId, setActiveSessionTabId] = useAtom(activeSessionTabIdAtom)
  const activeSessionTab = sessionTabs.find((item) => item.id === activeSessionTabId) ?? null
  const activeTabSessionId = activeSessionTab?.sessionId ?? null
  const renderSessionId = resolveRenderableSessionId(activeTabSessionId, sessions)

  const syncSelectionFromTabs = React.useCallback((nextTabs: typeof sessionTabs, nextActiveTabId: string | null): void => {
    const nextSelection = resolveSessionSelection(nextTabs, nextActiveTabId)
    setCurrentSessionId(nextSelection.sessionId)
  }, [sessions, setCurrentSessionId])

  React.useEffect(() => {
    const next = reconcileSessionTabs(sessionTabs, activeSessionTabId, sessions)
    if (next.tabs !== sessionTabs) {
      setSessionTabs(next.tabs)
    }
    if (next.activeTabId !== activeSessionTabId) {
      setActiveSessionTabId(next.activeTabId)
      syncSelectionFromTabs(next.tabs, next.activeTabId)
    }
  }, [activeSessionTabId, sessionTabs, sessions, setActiveSessionTabId, setSessionTabs, syncSelectionFromTabs])

  React.useEffect(() => {
    const nextSelection = resolveSelectionSyncFromActiveTab(
      {
        sessionId: currentSessionId,
        workspaceId: currentWorkspaceId,
      },
      sessionTabs,
      activeSessionTabId,
      sessions,
    )

    if (!nextSelection) return

    setCurrentSessionId(nextSelection.sessionId)
    setCurrentWorkspaceId(nextSelection.workspaceId)
  }, [
    activeSessionTabId,
    currentSessionId,
    currentWorkspaceId,
    sessionTabs,
    sessions,
    setCurrentSessionId,
    setCurrentWorkspaceId,
  ])

  const handleCloseSessionTab = React.useCallback((tabId: string): void => {
    const next = closeSessionTab(sessionTabs, activeSessionTabId, tabId)
    setSessionTabs(next.tabs)
    setActiveSessionTabId(next.activeTabId)
    syncSelectionFromTabs(next.tabs, next.activeTabId)
  }, [activeSessionTabId, sessionTabs, setActiveSessionTabId, setSessionTabs, syncSelectionFromTabs])

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="proma-main-panel flex h-full min-h-0 flex-col overflow-hidden">
        <SessionTabStrip
          tabs={sessionTabs}
          activeTabId={activeSessionTabId}
          onActivate={(tabId) => {
            setActiveSessionTabId(tabId)
            syncSelectionFromTabs(sessionTabs, tabId)
          }}
          onClose={handleCloseSessionTab}
        />

        <div className="min-h-0 flex-1 overflow-hidden bg-background/35">
          {renderSessionId
            ? <AgentView sessionId={renderSessionId} />
            : <EmptyState />}
        </div>
      </div>
    </main>
  )
}
