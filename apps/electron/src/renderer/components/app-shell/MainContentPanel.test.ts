import { describe, expect, test } from 'bun:test'
import { resolveRenderableSessionId, resolveSelectionSyncFromActiveTab } from './MainContentPanel'

describe('MainContentPanel session resolution', () => {
  test('suppresses stale persisted tabs until the session list is reconciled', () => {
    expect(resolveRenderableSessionId('missing-session', [])).toBeNull()
    expect(resolveRenderableSessionId('missing-session', [{ id: 'session-1' }])).toBeNull()
  })

  test('renders the active tab session once it exists in the loaded session list', () => {
    expect(resolveRenderableSessionId('session-1', [{ id: 'session-1' }])).toBe('session-1')
  })
})

describe('MainContentPanel selection sync', () => {
  test('returns the active tab selection when the workspace id is stale even if the session id already matches', () => {
    expect(resolveSelectionSyncFromActiveTab(
      {
        sessionId: 'session-1',
        workspaceId: 'workspace-stale',
      },
      [
        {
          id: 'tab-1',
          sessionId: 'session-1',
          title: 'Session 1',
        },
      ],
      'tab-1',
      [
        {
          id: 'session-1',
          workspaceId: 'workspace-1',
        },
      ],
    )).toEqual({
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
    })
  })

  test('returns null when both session and workspace already match the active tab selection', () => {
    expect(resolveSelectionSyncFromActiveTab(
      {
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
      },
      [
        {
          id: 'tab-1',
          sessionId: 'session-1',
          title: 'Session 1',
        },
      ],
      'tab-1',
      [
        {
          id: 'session-1',
          workspaceId: 'workspace-1',
        },
      ],
    )).toBeNull()
  })
})
