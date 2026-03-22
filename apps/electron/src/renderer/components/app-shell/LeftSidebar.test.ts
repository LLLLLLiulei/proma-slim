import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AgentSessionMeta } from '@proma/shared'
import {
  LeftSidebar,
  getVisibleSessionsForWorkspace,
  resolveInitialWorkspaceId,
} from './LeftSidebar'

function createSession(id: string, workspaceId: string): AgentSessionMeta {
  return {
    id,
    title: id,
    workspaceId,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('LeftSidebar workspace initialization', () => {
  test('prefers the persisted workspace id when it still exists in the loaded list', () => {
    expect(resolveInitialWorkspaceId(
      [
        { id: 'workspace-b' },
        { id: 'workspace-a' },
      ],
      'workspace-a',
    )).toBe('workspace-a')
  })

  test('falls back to the first workspace when the persisted id is missing', () => {
    expect(resolveInitialWorkspaceId(
      [
        { id: 'workspace-b' },
        { id: 'workspace-a' },
      ],
      'workspace-missing',
    )).toBe('workspace-b')
  })

  test('returns null when no workspaces are available', () => {
    expect(resolveInitialWorkspaceId([], 'workspace-a')).toBeNull()
  })
})

describe('LeftSidebar workspace session visibility', () => {
  test('shows only sessions that belong to the currently selected workspace', () => {
    expect(getVisibleSessionsForWorkspace(
      [
        createSession('session-a1', 'workspace-a'),
        createSession('session-b1', 'workspace-b'),
        createSession('session-a2', 'workspace-a'),
      ],
      'workspace-a',
    ).map((session) => session.id)).toEqual(['session-a1', 'session-a2'])
  })

  test('hides all sessions when no workspace is currently selected', () => {
    expect(getVisibleSessionsForWorkspace(
      [
        createSession('session-a1', 'workspace-a'),
        createSession('session-b1', 'workspace-b'),
      ],
      null,
    )).toEqual([])
  })
})

describe('LeftSidebar footer actions', () => {
  test('does not render the workspace capability summary button or settings entry', () => {
    const markup = renderToStaticMarkup(React.createElement(LeftSidebar))

    expect(markup).not.toContain('0 MCP')
    expect(markup).not.toContain('0 Skills')
    expect(markup).not.toContain('>设置<')
    expect(markup).not.toContain('主题与用户档案')
  })
})
