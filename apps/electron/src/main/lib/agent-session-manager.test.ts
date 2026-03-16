import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  appendAgentMessage,
  createAgentSession,
  getAgentSessionMessages,
  getAgentSessionMeta,
  listAgentSessions,
  moveSessionToWorkspace,
} from './agent-session-manager'
import {
  createAgentWorkspace,
  ensureDefaultWorkspace,
} from './workspace-service'
import {
  getAgentSessionWorkspacePath,
  getAgentSessionsIndexPath,
} from './config-paths'

function removePromaDir(): void {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
}

afterEach(() => {
  removePromaDir()
})

describe('agent session workspace ownership', () => {
  test('creates new sessions in the default workspace when workspaceId is omitted', () => {
    const defaultWorkspace = ensureDefaultWorkspace()

    const session = createAgentSession('默认工作区会话')

    expect(session.workspaceId).toBe(defaultWorkspace.id)
    expect(getAgentSessionMeta(session.id)?.workspaceId).toBe(defaultWorkspace.id)
    expect(existsSync(getAgentSessionWorkspacePath(defaultWorkspace.slug, session.id))).toBe(true)
  })

  test('backfills legacy sessions without workspaceId into the default workspace', () => {
    const defaultWorkspace = ensureDefaultWorkspace()
    const sessionsPath = getAgentSessionsIndexPath()
    const now = Date.now()

    mkdirSync(join(homedir(), '.proma'), { recursive: true })
    writeFileSync(
      sessionsPath,
      JSON.stringify({
        version: 1,
        sessions: [
          {
            id: 'legacy-session',
            title: '旧会话',
            createdAt: now,
            updatedAt: now,
          },
        ],
      }, null, 2),
      'utf-8',
    )

    const sessions = listAgentSessions()

    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.workspaceId).toBe(defaultWorkspace.id)
    expect(getAgentSessionMeta('legacy-session')?.workspaceId).toBe(defaultWorkspace.id)
    expect(existsSync(getAgentSessionWorkspacePath(defaultWorkspace.slug, 'legacy-session'))).toBe(true)
  })

  test('moves a session to another workspace without losing message history and clears sdkSessionId', () => {
    const defaultWorkspace = ensureDefaultWorkspace()
    const targetWorkspace = createAgentWorkspace('Proma Docs')
    const session = createAgentSession('可迁移会话', undefined, defaultWorkspace.id)
    const sourceDir = getAgentSessionWorkspacePath(defaultWorkspace.slug, session.id)

    writeFileSync(join(sourceDir, 'notes.txt'), 'workspace-bound file', 'utf-8')
    appendAgentMessage(session.id, {
      id: 'message-1',
      role: 'user',
      content: 'hello workspace',
      createdAt: Date.now(),
    })

    const updated = moveSessionToWorkspace(session.id, targetWorkspace.id)

    expect(updated.workspaceId).toBe(targetWorkspace.id)
    expect(updated.sdkSessionId).toBeUndefined()
    expect(getAgentSessionMeta(session.id)?.workspaceId).toBe(targetWorkspace.id)
    expect(getAgentSessionMeta(session.id)?.sdkSessionId).toBeUndefined()
    expect(getAgentSessionMessages(session.id)).toHaveLength(1)
    expect(existsSync(join(sourceDir, 'notes.txt'))).toBe(false)
    expect(existsSync(join(getAgentSessionWorkspacePath(targetWorkspace.slug, session.id), 'notes.txt'))).toBe(true)
  })
})
