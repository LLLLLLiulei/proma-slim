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
  test('does not overwrite the selected workspace when only the active tab workspace differs', () => {
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
    )).toBeNull()
  })

  test('updates only the active session id when the active tab changes across workspaces', () => {
    expect(resolveSelectionSyncFromActiveTab(
      {
        sessionId: 'session-1',
        workspaceId: 'workspace-selected',
      },
      [
        {
          id: 'tab-2',
          sessionId: 'session-2',
          title: 'Session 2',
        },
      ],
      'tab-2',
      [
        {
          id: 'session-2',
          workspaceId: 'workspace-2',
        },
      ],
    )).toEqual({
      sessionId: 'session-2',
      workspaceId: 'workspace-selected',
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
