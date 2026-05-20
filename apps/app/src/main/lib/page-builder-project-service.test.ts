import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getAgentSessionMessagesPath, getAgentSessionsIndexPath, getAgentWorkspacesDir } from './config-paths'
import { createAgentSession, listAgentSessions } from './agent-session-manager'
import { createAgentWorkspace, ensureDefaultWorkspace, listAgentWorkspaces } from './workspace-service'
import { deletePageBuilderProject, listPageBuilderProjects } from './page-builder-project-service'
import { pageBuilderEditLockService } from './page-builder-edit-lock-service'

describe('page builder project service', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-page-builder-projects-'))
    process.env.PROMA_CONFIG_DIR = configDir
  })

  afterEach(() => {
    delete process.env.PROMA_CONFIG_DIR
    delete process.env.AI_PAGE_BUILDER_BASE_PATH
    mock.restore()
    rmSync(configDir, { recursive: true, force: true })
  })

  test('lists only page-builder projects with preview urls and latest session ordering', () => {
    ensureDefaultWorkspace()
    const builderAlpha = createAgentWorkspace('Alpha Project', { template: 'page-builder' })
    const builderBeta = createAgentWorkspace('Beta Project', { template: 'page-builder' })
    createAgentWorkspace('Regular Workspace')

    const alphaSession = createAgentSession('Alpha Session', undefined, builderAlpha.id)
    const betaSession = createAgentSession('Beta Session', undefined, builderBeta.id)

    const sessionsIndexPath = getAgentSessionsIndexPath()
    const sessionsIndex = JSON.parse(readFileSync(sessionsIndexPath, 'utf-8')) as {
      version: number
      sessions: Array<{
        id: string
        title: string
        workspaceId?: string
        createdAt: number
        updatedAt: number
      }>
    }
    sessionsIndex.sessions = sessionsIndex.sessions.map((session) => {
      if (session.id === alphaSession.id) {
        return { ...session, createdAt: 100, updatedAt: 500 }
      }
      if (session.id === betaSession.id) {
        return { ...session, createdAt: 200, updatedAt: 900 }
      }
      return session
    })
    writeFileSync(sessionsIndexPath, JSON.stringify(sessionsIndex, null, 2), 'utf-8')

    const alphaWorkspaceFiles = join(getAgentWorkspacesDir(), builderAlpha.slug, 'workspace-files')
    writeFileSync(
      join(alphaWorkspaceFiles, 'index.html'),
      '<!doctype html><html><body><h1>Alpha</h1></body></html>',
      'utf-8',
    )

    const projects = listPageBuilderProjects()

    expect(projects).toHaveLength(2)
    expect(projects.map((project) => project.workspaceId)).toEqual([builderBeta.id, builderAlpha.id])
    expect(projects[0]).toMatchObject({
      workspaceId: builderBeta.id,
      workspaceName: 'Beta Project',
      latestSessionId: betaSession.id,
      previewUrl: null,
      lastActiveAt: 900,
    })
    expect(projects[1]).toMatchObject({
      workspaceId: builderAlpha.id,
      workspaceName: 'Alpha Project',
      latestSessionId: alphaSession.id,
      previewUrl: `/api/workspaces/${builderAlpha.id}/preview/`,
      lastActiveAt: 500,
    })
  })

  test('lists project preview urls with the configured public base path', () => {
    process.env.AI_PAGE_BUILDER_BASE_PATH = '/pagebuilder'
    const builder = createAgentWorkspace('Base Path Project', { template: 'page-builder' })
    createAgentSession('Base Path Session', undefined, builder.id)

    const workspaceFiles = join(getAgentWorkspacesDir(), builder.slug, 'workspace-files')
    writeFileSync(
      join(workspaceFiles, 'index.html'),
      '<!doctype html><html><body><h1>Base Path</h1></body></html>',
      'utf-8',
    )

    const projects = listPageBuilderProjects()

    expect(projects.find((project) => project.workspaceId === builder.id)?.previewUrl)
      .toBe(`/pagebuilder/api/workspaces/${builder.id}/preview/`)
  })

  test('lists active page-builder session ids for recoverable projects', () => {
    const workspace = createAgentWorkspace('Recoverable Project', { template: 'page-builder' })
    const latestSession = createAgentSession('Latest Idle Session', undefined, workspace.id)
    const activeSession = createAgentSession('Active Session', undefined, workspace.id)
    const originalGetEditState = pageBuilderEditLockService.getEditState.bind(pageBuilderEditLockService)
    const originalGetActiveAgentSessionId = pageBuilderEditLockService.getActiveAgentSessionId.bind(pageBuilderEditLockService)
    pageBuilderEditLockService.getEditState = ((workspaceId: string) => (
      workspaceId === workspace.id
        ? { status: 'locked', reason: 'agent', activeSessionId: activeSession.id }
        : originalGetEditState(workspaceId)
    )) as typeof pageBuilderEditLockService.getEditState
    pageBuilderEditLockService.getActiveAgentSessionId = ((workspaceId: string) => (
      workspaceId === workspace.id ? activeSession.id : originalGetActiveAgentSessionId(workspaceId)
    )) as typeof pageBuilderEditLockService.getActiveAgentSessionId

    try {
      const projects = listPageBuilderProjects()

      expect(projects.find((project) => project.workspaceId === workspace.id)).toMatchObject({
        latestSessionId: activeSession.id,
        activeSessionId: activeSession.id,
        editState: {
          status: 'locked',
          reason: 'agent',
          activeSessionId: activeSession.id,
        },
      })
      expect(latestSession.id).not.toBe(activeSession.id)
    } finally {
      pageBuilderEditLockService.getEditState = originalGetEditState as typeof pageBuilderEditLockService.getEditState
      pageBuilderEditLockService.getActiveAgentSessionId = originalGetActiveAgentSessionId as typeof pageBuilderEditLockService.getActiveAgentSessionId
    }
  })

  test('lists active page-builder session ids even when the workspace currently has an editor lock', () => {
    const workspace = createAgentWorkspace('Locked Recoverable Project', { template: 'page-builder' })
    const latestSession = createAgentSession('Latest Locked Session', undefined, workspace.id)
    const activeSession = createAgentSession('Active Locked Session', undefined, workspace.id)
    const originalGetEditState = pageBuilderEditLockService.getEditState.bind(pageBuilderEditLockService)
    const originalGetActiveAgentSessionId = pageBuilderEditLockService.getActiveAgentSessionId.bind(pageBuilderEditLockService)
    pageBuilderEditLockService.getEditState = ((workspaceId: string) => (
      workspaceId === workspace.id
        ? { status: 'locked', reason: 'editor', expiresAt: Date.now() + 60_000 }
        : originalGetEditState(workspaceId)
    )) as typeof pageBuilderEditLockService.getEditState
    pageBuilderEditLockService.getActiveAgentSessionId = ((workspaceId: string) => (
      workspaceId === workspace.id ? activeSession.id : originalGetActiveAgentSessionId(workspaceId)
    )) as typeof pageBuilderEditLockService.getActiveAgentSessionId

    try {
      const projects = listPageBuilderProjects()

      expect(projects.find((project) => project.workspaceId === workspace.id)).toMatchObject({
        latestSessionId: activeSession.id,
        activeSessionId: activeSession.id,
        editState: {
          status: 'locked',
          reason: 'editor',
        },
      })
      expect(latestSession.id).not.toBe(activeSession.id)
    } finally {
      pageBuilderEditLockService.getEditState = originalGetEditState as typeof pageBuilderEditLockService.getEditState
      pageBuilderEditLockService.getActiveAgentSessionId = originalGetActiveAgentSessionId as typeof pageBuilderEditLockService.getActiveAgentSessionId
    }
  })

  test('deletes a page-builder project with its sessions, messages, and workspace root', () => {
    ensureDefaultWorkspace()
    const workspace = createAgentWorkspace('Delete Me', { template: 'page-builder' })
    const session = createAgentSession('Draft', undefined, workspace.id)
    const workspaceRoot = join(getAgentWorkspacesDir(), workspace.slug)
    const messagesPath = getAgentSessionMessagesPath(session.id)

    writeFileSync(messagesPath, JSON.stringify({
      id: 'message-1',
      role: 'user',
      content: 'hello',
      createdAt: 1,
    }) + '\n', 'utf-8')
    writeFileSync(join(workspaceRoot, 'workspace-files', 'index.html'), '<h1>Preview</h1>', 'utf-8')

    deletePageBuilderProject(workspace.id)

    expect(listAgentWorkspaces().some((entry) => entry.id === workspace.id)).toBe(false)
    expect(listAgentSessions().some((entry) => entry.id === session.id)).toBe(false)
    expect(existsSync(messagesPath)).toBe(false)
    expect(existsSync(workspaceRoot)).toBe(false)
  })
})
