import { describe, expect, test } from 'bun:test'
import {
  closeSessionTab,
  initializeSessionTabs,
  openSessionTab,
  reconcileSessionTabs,
  type SessionTab,
} from './session-tabs'

describe('session tab state', () => {
  test('opening a different session keeps existing tabs and focuses the new tab', () => {
    const first = openSessionTab([], { id: 's1', title: '你好' })
    const second = openSessionTab(first.tabs, { id: 's2', title: '新 Agent 会话' })

    expect(second.tabs).toEqual<SessionTab[]>([
      { id: 's1', sessionId: 's1', title: '你好' },
      { id: 's2', sessionId: 's2', title: '新 Agent 会话' },
    ])
    expect(second.activeTabId).toBe('s2')
  })

  test('opening the same session twice focuses the existing tab without duplicating it', () => {
    const initial: SessionTab[] = [
      { id: 's1', sessionId: 's1', title: '你好' },
      { id: 's2', sessionId: 's2', title: '新 Agent 会话' },
    ]

    const result = openSessionTab(initial, { id: 's1', title: '你好' })

    expect(result.tabs).toEqual(initial)
    expect(result.activeTabId).toBe('s1')
  })

  test('closing the active tab focuses the adjacent remaining tab', () => {
    const result = closeSessionTab(
      [
        { id: 's1', sessionId: 's1', title: '你好' },
        { id: 's2', sessionId: 's2', title: '新 Agent 会话' },
        { id: 's3', sessionId: 's3', title: '第三个会话' },
      ],
      's2',
      's2',
    )

    expect(result.tabs.map((tab) => tab.id)).toEqual(['s1', 's3'])
    expect(result.activeTabId).toBe('s3')
  })

  test('reconcile removes deleted sessions and refreshes titles from the latest session list', () => {
    const result = reconcileSessionTabs(
      [
        { id: 's1', sessionId: 's1', title: '旧标题' },
        { id: 's2', sessionId: 's2', title: '保留标题' },
      ],
      's1',
      [
        { id: 's2', title: '新标题' },
        { id: 's3', title: '第三个会话' },
      ],
    )

    expect(result.tabs).toEqual<SessionTab[]>([
      { id: 's2', sessionId: 's2', title: '新标题' },
    ])
    expect(result.activeTabId).toBe('s2')
  })

  test('initializeSessionTabs restores the current session when it still exists', () => {
    const result = initializeSessionTabs('s2', [
      { id: 's1', title: '你好' },
      { id: 's2', title: '第二个会话' },
    ])

    expect(result).toEqual({
      tabs: [{ id: 's2', sessionId: 's2', title: '第二个会话' }],
      activeTabId: 's2',
      currentSessionId: 's2',
    })
  })

  test('initializeSessionTabs restores persisted open tabs on reload and keeps the active tab', () => {
    const result = (initializeSessionTabs as unknown as (
      currentSessionId: string | null,
      sessions: Array<{ id: string; title: string }>,
      persistedTabs: SessionTab[],
      persistedActiveTabId: string | null,
    ) => {
      tabs: SessionTab[]
      activeTabId: string | null
      currentSessionId: string | null
    })(
      null,
      [
        { id: 's1', title: '你好' },
        { id: 's2', title: '第二个会话' },
        { id: 's3', title: '第三个会话' },
      ],
      [
        { id: 's1', sessionId: 's1', title: '你好' },
        { id: 's2', sessionId: 's2', title: '旧标题' },
      ],
      's2',
    )

    expect(result).toEqual({
      tabs: [
        { id: 's1', sessionId: 's1', title: '你好' },
        { id: 's2', sessionId: 's2', title: '第二个会话' },
      ],
      activeTabId: 's2',
      currentSessionId: 's2',
    })
  })

  test('initializeSessionTabs falls back to the newest available session when the current one is missing', () => {
    const result = initializeSessionTabs('missing', [
      { id: 's3', title: '最新会话' },
      { id: 's1', title: '你好' },
    ])

    expect(result).toEqual({
      tabs: [{ id: 's3', sessionId: 's3', title: '最新会话' }],
      activeTabId: 's3',
      currentSessionId: 's3',
    })
  })
})
