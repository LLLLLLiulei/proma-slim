import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentEvent, AgentQueryInput, AgentProviderAdapter } from '@proma/shared'
import { AgentEventBus } from './agent-event-bus'
import { AgentOrchestrator } from './agent-orchestrator'
import {
  createAgentSession,
  getAgentSessionMeta,
  moveSessionToWorkspace,
  updateAgentSessionMeta,
} from './agent-session-manager'
import {
  attachWorkspaceDirectory,
  createAgentWorkspace,
  saveWorkspaceMcpConfig,
} from './workspace-service'
import {
  getAgentSessionWorkspacePath,
  getAgentWorkspacePath,
  getWorkspaceFilesDir,
} from './config-paths'

interface CapturedQueryInput extends AgentQueryInput {
  additionalDirectories?: string[]
  mcpServers?: Record<string, unknown>
  plugins?: Array<{ type: 'local'; path: string }>
  resumeSessionId?: string
}

class RecordingAdapter implements AgentProviderAdapter {
  lastInput: CapturedQueryInput | null = null

  async *query(input: AgentQueryInput): AsyncIterable<AgentEvent> {
    this.lastInput = input as CapturedQueryInput
    yield { type: 'complete' }
  }

  abort(): void {}

  dispose(): void {}
}

describe('AgentOrchestrator workspace runtime', () => {
  let configDir: string
  let originalApiKey: string | undefined
  let originalBaseUrl: string | undefined

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-orchestrator-workspace-'))
    process.env.PROMA_CONFIG_DIR = configDir
    originalApiKey = process.env.ANTHROPIC_API_KEY
    originalBaseUrl = process.env.ANTHROPIC_BASE_URL
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
  })

  afterEach(() => {
    delete process.env.PROMA_CONFIG_DIR
    if (originalApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = originalApiKey
    }
    if (originalBaseUrl === undefined) {
      delete process.env.ANTHROPIC_BASE_URL
    } else {
      process.env.ANTHROPIC_BASE_URL = originalBaseUrl
    }
    rmSync(configDir, { recursive: true, force: true })
  })

  test('uses the workspace session directory as cwd and loads the workspace plugin path', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Proma Docs')
    const session = createAgentSession('Workspace session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: 'Inspect this workspace',
        channelId: '',
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(adapter.lastInput?.cwd).toBe(getAgentSessionWorkspacePath(workspace.slug, session.id))
    expect(adapter.lastInput?.plugins).toEqual([
      { type: 'local', path: getAgentWorkspacePath(workspace.slug) },
    ])
  })

  test('adds workspace-files and attached directories into additionalDirectories', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Attached Docs')
    const session = createAgentSession('Attached session', undefined, workspace.id)
    const attachedDir = join(configDir, 'external-docs')
    attachWorkspaceDirectory(workspace.slug, attachedDir)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: 'Use attached directories',
        channelId: '',
        additionalDirectories: [join(configDir, 'manual-context')],
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(adapter.lastInput?.additionalDirectories).toEqual([
      join(configDir, 'manual-context'),
      attachedDir,
      getWorkspaceFilesDir(workspace.slug),
    ])
  })

  test('passes workspace scoped mcp servers to the adapter query options', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('MCP Docs')
    const session = createAgentSession('MCP session', undefined, workspace.id)

    saveWorkspaceMcpConfig(workspace.slug, {
      servers: {
        docs: {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
          enabled: true,
        },
      },
    })

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: 'Use MCP docs',
        channelId: '',
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(adapter.lastInput?.mcpServers).toEqual({
      docs: {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
      },
    })
  })

  test('injects mentioned skill and MCP references into the prompt for the current workspace', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Prompt Docs')
    const session = createAgentSession('Prompt session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请使用 /skill:docs 和 #mcp:docs 完成任务',
        channelId: '',
        mentionedSkills: ['docs'],
        mentionedMcpServers: ['docs'],
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(adapter.lastInput?.prompt).toContain('<mentioned_tools>')
    expect(adapter.lastInput?.prompt).toContain(`proma-workspace-${workspace.slug}:docs`)
    expect(adapter.lastInput?.prompt).toContain('<workspace_slug>')
  })

  test('rebinds cwd after workspace migration and does not resume with the cleared sdkSessionId', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const sourceWorkspace = createAgentWorkspace('Source Docs')
    const targetWorkspace = createAgentWorkspace('Target Docs')
    const session = createAgentSession('Migrated session', undefined, sourceWorkspace.id)

    updateAgentSessionMeta(session.id, { sdkSessionId: 'stale-sdk-session' })
    const movedSession = moveSessionToWorkspace(session.id, targetWorkspace.id)

    expect(movedSession.sdkSessionId).toBeUndefined()
    expect(getAgentSessionMeta(session.id)?.sdkSessionId).toBeUndefined()

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: 'Use the migrated workspace',
        channelId: '',
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(adapter.lastInput?.cwd).toBe(getAgentSessionWorkspacePath(targetWorkspace.slug, session.id))
    expect(adapter.lastInput?.plugins).toEqual([
      { type: 'local', path: getAgentWorkspacePath(targetWorkspace.slug) },
    ])
    expect(adapter.lastInput?.resumeSessionId).toBeUndefined()
  })
})
