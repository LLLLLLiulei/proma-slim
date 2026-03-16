import * as React from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { MessageSquareText, Settings2, Sparkles, X } from 'lucide-react'
import { activeViewAtom } from '@/atoms/active-view'
import { agentSessionsAtom, currentAgentSessionIdAtom } from '@/atoms/agent-atoms'
import { activeSessionTabIdAtom, closeSessionTab, reconcileSessionTabs, sessionTabsAtom } from '@/atoms/session-tabs'
import { AgentView } from '@/components/agent'
import { SettingsPanel } from '@/components/settings'
import { cn } from '@/lib/utils'

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

function StaticTabBar({
  label,
  icon,
  onClose,
}: {
  label: string
  icon: React.ReactNode
  onClose: () => void
}): React.ReactElement {
  return (
    <div className="proma-tab-strip flex h-[38px] items-end gap-0.5 px-2 pt-1 titlebar-drag-region">
      <div className="flex min-w-0 flex-1 items-end overflow-x-auto scrollbar-none titlebar-no-drag">
        <div className="proma-tab-item is-active flex h-[33px] min-w-[104px] max-w-[220px] items-center gap-2 px-3">
          <span className="shrink-0 text-muted-foreground">{icon}</span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{label}</span>
          <button
            type="button"
            onClick={onClose}
            className="proma-tab-close flex size-4 shrink-0 items-center justify-center rounded-sm opacity-70"
            aria-label="关闭当前标签"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>
      <div className="flex-1" />
    </div>
  )
}

export function MainContentPanel(): React.ReactElement {
  const [activeView, setActiveView] = useAtom(activeViewAtom)
  const [currentSessionId, setCurrentSessionId] = useAtom(currentAgentSessionIdAtom)
  const sessions = useAtomValue(agentSessionsAtom)
  const [sessionTabs, setSessionTabs] = useAtom(sessionTabsAtom)
  const [activeSessionTabId, setActiveSessionTabId] = useAtom(activeSessionTabIdAtom)
  const activeSessionTab = sessionTabs.find((item) => item.id === activeSessionTabId) ?? null
  const activeTabSessionId = activeSessionTab?.sessionId ?? null

  React.useEffect(() => {
    const next = reconcileSessionTabs(sessionTabs, activeSessionTabId, sessions)
    if (next.tabs !== sessionTabs) {
      setSessionTabs(next.tabs)
    }
    if (next.activeTabId !== activeSessionTabId) {
      setActiveSessionTabId(next.activeTabId)
    }
  }, [activeSessionTabId, sessionTabs, sessions, setActiveSessionTabId, setSessionTabs])

  React.useEffect(() => {
    if (activeView === 'settings') return
    if (!activeTabSessionId) return
    if (currentSessionId === activeTabSessionId) return
    setCurrentSessionId(activeTabSessionId)
  }, [activeTabSessionId, activeView, currentSessionId, setCurrentSessionId])

  const handleCloseSessionTab = React.useCallback((tabId: string): void => {
    const next = closeSessionTab(sessionTabs, activeSessionTabId, tabId)
    setSessionTabs(next.tabs)
    setActiveSessionTabId(next.activeTabId)
    setCurrentSessionId(next.activeTabId)
  }, [activeSessionTabId, sessionTabs, setActiveSessionTabId, setCurrentSessionId, setSessionTabs])

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="proma-main-panel flex h-full min-h-0 flex-col overflow-hidden">
        {activeView === 'settings' ? (
          <StaticTabBar
            label="设置"
            icon={<Settings2 className="size-4" />}
            onClose={() => setActiveView('conversations')}
          />
        ) : (
          <SessionTabStrip
            tabs={sessionTabs}
            activeTabId={activeSessionTabId}
            onActivate={(tabId) => {
              setActiveSessionTabId(tabId)
              setCurrentSessionId(tabId)
              setActiveView('conversations')
            }}
            onClose={handleCloseSessionTab}
          />
        )}

        <div className="min-h-0 flex-1 overflow-hidden bg-background/35">
          {activeView === 'settings'
            ? <SettingsPanel />
            : activeTabSessionId
              ? <AgentView sessionId={activeTabSessionId} />
              : <EmptyState />}
        </div>
      </div>
    </main>
  )
}
