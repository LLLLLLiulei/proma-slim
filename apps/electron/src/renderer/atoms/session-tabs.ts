import { atomWithStorage } from 'jotai/utils'
import type { AgentSessionMeta } from '@proma/shared'

export interface SessionTab {
  id: string
  sessionId: string
  title: string
}

type SessionTabSource = Pick<AgentSessionMeta, 'id' | 'title'>

const STORAGE_OPTIONS = { getOnInit: true } as const

export const sessionTabsAtom = atomWithStorage<SessionTab[]>('proma-session-tabs', [], undefined, STORAGE_OPTIONS)
export const activeSessionTabIdAtom = atomWithStorage<string | null>(
  'proma-active-session-tab-id',
  null,
  undefined,
  STORAGE_OPTIONS,
)

function toSessionTab(session: SessionTabSource): SessionTab {
  return {
    id: session.id,
    sessionId: session.id,
    title: session.title,
  }
}

export function openSessionTab(
  tabs: SessionTab[],
  session: SessionTabSource,
): { tabs: SessionTab[]; activeTabId: string } {
  const existing = tabs.find((tab) => tab.sessionId === session.id)
  if (existing) {
    return { tabs, activeTabId: existing.id }
  }

  const nextTab = toSessionTab(session)
  return {
    tabs: [...tabs, nextTab],
    activeTabId: nextTab.id,
  }
}

export function initializeSessionTabs(
  currentSessionId: string | null,
  sessions: SessionTabSource[],
  persistedTabs: SessionTab[] = [],
  persistedActiveTabId: string | null = null,
): { tabs: SessionTab[]; activeTabId: string | null; currentSessionId: string | null } {
  if (sessions.length === 0) {
    return {
      tabs: [],
      activeTabId: null,
      currentSessionId: null,
    }
  }

  const restored = reconcileSessionTabs(persistedTabs, persistedActiveTabId, sessions)
  if (restored.tabs.length > 0) {
    const preferredSession = currentSessionId
      ? sessions.find((session) => session.id === currentSessionId) ?? null
      : null

    if (preferredSession) {
      const reopened = openSessionTab(restored.tabs, preferredSession)
      return {
        tabs: reopened.tabs,
        activeTabId: reopened.activeTabId,
        currentSessionId: preferredSession.id,
      }
    }

    const restoredActiveTab = restored.tabs.find((tab) => tab.id === restored.activeTabId) ?? restored.tabs[0] ?? null
    return {
      tabs: restored.tabs,
      activeTabId: restoredActiveTab?.id ?? null,
      currentSessionId: restoredActiveTab?.sessionId ?? null,
    }
  }

  const targetSession = currentSessionId
    ? sessions.find((session) => session.id === currentSessionId) ?? sessions[0]!
    : sessions[0]!

  const opened = openSessionTab([], targetSession)
  return {
    tabs: opened.tabs,
    activeTabId: opened.activeTabId,
    currentSessionId: targetSession.id,
  }
}

export function closeSessionTab(
  tabs: SessionTab[],
  activeTabId: string | null,
  tabId: string,
): { tabs: SessionTab[]; activeTabId: string | null } {
  const tabIndex = tabs.findIndex((tab) => tab.id === tabId)
  if (tabIndex === -1) {
    return { tabs, activeTabId }
  }

  const nextTabs = tabs.filter((tab) => tab.id !== tabId)
  if (nextTabs.length === 0) {
    return { tabs: nextTabs, activeTabId: null }
  }

  if (activeTabId !== tabId) {
    return { tabs: nextTabs, activeTabId }
  }

  const nextIndex = Math.min(tabIndex, nextTabs.length - 1)
  return {
    tabs: nextTabs,
    activeTabId: nextTabs[nextIndex]?.id ?? null,
  }
}

export function reconcileSessionTabs(
  tabs: SessionTab[],
  activeTabId: string | null,
  sessions: SessionTabSource[],
): { tabs: SessionTab[]; activeTabId: string | null } {
  const sessionMap = new Map(sessions.map((session) => [session.id, session]))
  let changed = false

  const nextTabs = tabs.flatMap((tab) => {
    const nextSession = sessionMap.get(tab.sessionId)
    if (!nextSession) {
      changed = true
      return []
    }

    if (tab.title !== nextSession.title) {
      changed = true
      return [{ ...tab, title: nextSession.title }]
    }

    return [tab]
  })

  let nextActiveTabId = activeTabId
  if (nextActiveTabId && !nextTabs.some((tab) => tab.id === nextActiveTabId)) {
    nextActiveTabId = nextTabs[0]?.id ?? null
  }

  if (!changed && nextActiveTabId === activeTabId) {
    return { tabs, activeTabId }
  }

  return {
    tabs: nextTabs,
    activeTabId: nextActiveTabId,
  }
}
