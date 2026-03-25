import { describe, expect, mock, test } from 'bun:test'
import type { AgentSessionMeta, AgentWorkspace } from '@proma/shared'
import {
  DEFAULT_PAGE_BUILDER_PROJECT_NAME,
  PageBuilderProjectStartError,
  createPageBuilderProject,
  retryPageBuilderSession,
} from './project-start'

const workspace: AgentWorkspace = {
  id: 'workspace-1',
  name: DEFAULT_PAGE_BUILDER_PROJECT_NAME,
  slug: 'workspace-1',
  createdAt: 1,
  updatedAt: 1,
}

const session: AgentSessionMeta = {
  id: 'session-1',
  title: '新 Agent 会话',
  workspaceId: workspace.id,
  createdAt: 1,
  updatedAt: 1,
}

describe('page builder project startup', () => {
  test('creates a page-builder workspace and the first session in sequence', async () => {
    const createWorkspace = mock(async (
      name: string,
      options?: { template?: 'page-builder' },
    ) => ({ ...workspace, name, slug: options?.template === 'page-builder' ? 'page-builder-workspace' : workspace.slug }))
    const createSession = mock(async (_title?: string, workspaceId?: string) => ({
      ...session,
      workspaceId,
    }))

    const result = await createPageBuilderProject({
      createWorkspace,
      createSession,
    })

    expect(createWorkspace).toHaveBeenCalledWith(DEFAULT_PAGE_BUILDER_PROJECT_NAME, {
      template: 'page-builder',
    })
    expect(createSession).toHaveBeenCalledWith(undefined, workspace.id)
    expect(result).toEqual({
      workspace: {
        ...workspace,
        name: DEFAULT_PAGE_BUILDER_PROJECT_NAME,
        slug: 'page-builder-workspace',
      },
      session: { ...session, workspaceId: workspace.id },
    })
  })

  test('exposes the created workspace when session creation fails', async () => {
    const createWorkspace = mock(async () => workspace)
    const createSession = mock(async () => {
      throw new Error('session failed')
    })

    await expect(createPageBuilderProject({
      createWorkspace,
      createSession,
    })).rejects.toMatchObject({
      name: 'PageBuilderProjectStartError',
      workspace,
      recoverable: true,
    } satisfies Partial<PageBuilderProjectStartError>)
  })

  test('retries only the session creation for an existing workspace', async () => {
    const createSession = mock(async (_title?: string, workspaceId?: string) => ({
      ...session,
      workspaceId,
    }))

    const retried = await retryPageBuilderSession(workspace.id, { createSession })

    expect(createSession).toHaveBeenCalledWith(undefined, workspace.id)
    expect(retried.workspaceId).toBe(workspace.id)
  })
})
