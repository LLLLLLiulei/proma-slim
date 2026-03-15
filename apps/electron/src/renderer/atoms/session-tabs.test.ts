import { describe, expect, test } from 'bun:test'
import {
  closeSessionTab,
  openSessionTab,
  reconcileSessionTabs,
  type SessionTab,
} from './session-tabs'

describe('session tab state', () => {
  test('opening different sessions keeps existing tabs and focuses the new tab', () => {
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
})
