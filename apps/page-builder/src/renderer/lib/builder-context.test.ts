import { describe, expect, test } from 'bun:test'
import type { AgentSessionMeta, AgentWorkspace } from '@proma/shared'
import { resolveBuilderContext } from './builder-context'

const workspace: AgentWorkspace = {
  id: 'workspace-1',
  name: '未命名项目',
  slug: 'workspace-1',
  createdAt: 1,
  updatedAt: 1,
}

const session: AgentSessionMeta = {
  id: 'session-1',
  title: '新 Agent 会话',
  workspaceId: 'workspace-1',
  createdAt: 1,
  updatedAt: 1,
}

describe('builder context resolution', () => {
  test('returns the current workspace and session when both ids match', () => {
    expect(resolveBuilderContext({
      workspaceId: workspace.id,
      sessionId: session.id,
      workspaces: [workspace],
      sessions: [session],
    })).toEqual({
      workspace,
      session,
      error: null,
    })
  })

  test('reports a workspace mismatch when the session belongs to another workspace', () => {
    expect(resolveBuilderContext({
      workspaceId: 'workspace-2',
      sessionId: session.id,
      workspaces: [workspace, { ...workspace, id: 'workspace-2', slug: 'workspace-2' }],
      sessions: [session],
    })).toEqual({
      workspace: null,
      session: null,
      error: 'workspace-mismatch',
    })
  })

  test('reports missing resources when either the workspace or session cannot be found', () => {
    expect(resolveBuilderContext({
      workspaceId: workspace.id,
      sessionId: 'missing-session',
      workspaces: [workspace],
      sessions: [session],
    }).error).toBe('session-not-found')

    expect(resolveBuilderContext({
      workspaceId: 'missing-workspace',
      sessionId: session.id,
      workspaces: [workspace],
      sessions: [session],
    }).error).toBe('workspace-not-found')
  })
})
