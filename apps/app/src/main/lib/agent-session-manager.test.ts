import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  appendAgentMessage,
  createAgentSession,
  deleteAgentSession,
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
  getAgentSessionAttachmentsDir,
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
    const sourceAttachmentDir = getAgentSessionAttachmentsDir(defaultWorkspace.slug, session.id)

    writeFileSync(join(sourceDir, 'notes.txt'), 'workspace-bound file', 'utf-8')
    writeFileSync(join(sourceAttachmentDir, 'attachment.png'), 'image-data', 'utf-8')
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
    expect(existsSync(join(sourceAttachmentDir, 'attachment.png'))).toBe(false)
    expect(existsSync(join(getAgentSessionAttachmentsDir(targetWorkspace.slug, session.id), 'attachment.png'))).toBe(true)
  })

  test('deletes the entire session directory including attachments when a session is removed', () => {
    const workspace = createAgentWorkspace('Delete Docs')
    const session = createAgentSession('待删除会话', undefined, workspace.id)
    const sessionDir = join(homedir(), '.proma', 'agent-workspaces', workspace.slug, session.id)
    const attachmentDir = getAgentSessionAttachmentsDir(workspace.slug, session.id)

    writeFileSync(join(attachmentDir, 'attachment.png'), 'image-data', 'utf-8')

    deleteAgentSession(session.id)

    expect(getAgentSessionMeta(session.id)).toBeUndefined()
    expect(existsSync(sessionDir)).toBe(false)
  })

  test('reconstructs assistant content from persisted text_complete events when legacy records stored an empty content field', () => {
    const session = createAgentSession('兼容旧 assistant 记录')

    appendAgentMessage(session.id, {
      id: 'assistant-legacy-empty-content',
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      model: 'claude-sonnet-4-6',
      events: [
        {
          type: 'text_complete',
          text: '先说明当前状态。',
          isIntermediate: true,
        },
        {
          type: 'tool_start',
          toolName: 'mcp__cms__apply_cms_binding',
          toolUseId: 'tool-legacy-fix',
          input: {},
        },
        {
          type: 'tool_result',
          toolUseId: 'tool-legacy-fix',
          toolName: 'mcp__cms__apply_cms_binding',
          result: 'ok',
          isError: false,
        },
        {
          type: 'text_complete',
          text: '最终结果：绑定成功。',
          isIntermediate: false,
        },
      ],
    })

    const messages = getAgentSessionMessages(session.id)

    expect(messages[0]?.content).toBe('先说明当前状态。最终结果：绑定成功。')
  })
})
