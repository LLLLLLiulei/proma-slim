import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentEvent, AgentQueryInput, AgentProviderAdapter, AskUserRequest } from '@proma/shared'
import { AgentEventBus } from './agent-event-bus'
import { saveAgentSessionAttachments } from './agent-attachment-service'
import { AgentOrchestrator } from './agent-orchestrator'
import { askUserService } from './agent-ask-user-service'
import {
  buildStructuredRequestPayload,
  createRequestTraceContext,
  createTurnTraceContext,
} from './diagnostic-logging'
import {
  appendAgentMessage,
  getAgentSessionMessages,
  createAgentSession,
  getAgentSessionMeta,
  moveSessionToWorkspace,
  updateAgentSessionMeta,
} from './agent-session-manager'
import { updateSettings } from './settings-service'
import {
  attachWorkspaceDirectory,
  createAgentWorkspace,
  saveWorkspaceMcpConfig,
} from './workspace-service'
import {
  resolveAgentSessionAttachmentPath,
  getAgentSessionWorkspacePath,
  getAgentWorkspacePath,
  getWorkspaceMemoryFilePath,
  getWorkspaceCmsRenderingManifestPath,
  getWorkspaceFilesDir,
} from './config-paths'

type CapturedQueryInput = Omit<AgentQueryInput, 'prompt'> & {
  prompt: AgentQueryInput['prompt'] | AsyncIterable<unknown>
  additionalDirectories?: string[]
  mcpServers?: Record<string, unknown>
  allowedTools?: string[]
  plugins?: Array<{ type: 'local'; path: string }>
  resumeSessionId?: string
  sdkPermissionMode?: 'bypassPermissions' | 'default'
  allowDangerouslySkipPermissions?: boolean
  canUseTool?: (
    toolName: string,
    input: Record<string, unknown>,
    options: {
      signal: AbortSignal
      toolUseID: string
      agentID?: string
    },
  ) => Promise<{
    behavior: 'allow' | 'deny'
    updatedInput?: Record<string, unknown>
    message?: string
  }>
  hooks?: {
    PreToolUse?: Array<{
      matcher?: string
      hooks: Array<(
        input: {
          hook_event_name: 'PreToolUse'
          tool_name: string
          tool_input: unknown
          tool_use_id: string
        },
        toolUseID: string | undefined,
        options: { signal: AbortSignal },
      ) => Promise<{
        continue?: boolean
        hookSpecificOutput?: {
          hookEventName: 'PreToolUse'
          permissionDecision?: 'allow' | 'deny' | 'ask'
          permissionDecisionReason?: string
          updatedInput?: Record<string, unknown>
        }
      }>>
    }>
  }
  systemPrompt?: {
    type: 'preset'
    preset: string
    append: string
  }
}

class RecordingAdapter implements AgentProviderAdapter {
  inputs: CapturedQueryInput[] = []
  lastInput: CapturedQueryInput | null = null

  async *query(input: AgentQueryInput): AsyncIterable<AgentEvent> {
    this.lastInput = input as CapturedQueryInput
    this.inputs.push(this.lastInput)
    yield { type: 'complete' }
  }

  abort(): void {}

  dispose(): void {}
}

describe('AgentOrchestrator workspace runtime', () => {
  let configDir: string
  let claudeHomeDir: string
  let originalApiKey: string | undefined
  let originalBaseUrl: string | undefined
  let originalClaudeConfigDir: string | undefined
  let originalClaudeHome: string | undefined
  let originalCmsBaseUrl: string | undefined
  let originalCmsSiteId: string | undefined
  let originalCmsUsername: string | undefined
  let originalCmsPassword: string | undefined
  let originalPlaywrightMcpUrl: string | undefined
  let originalInternalAppOrigin: string | undefined
  let originalRuntimeEnv: string | undefined

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-orchestrator-workspace-'))
    claudeHomeDir = mkdtempSync(join(tmpdir(), 'proma-claude-home-'))
    process.env.PROMA_CONFIG_DIR = configDir
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
    delete process.env.CLAUDE_CONFIG_DIR
    originalClaudeHome = process.env.PROMA_CLAUDE_HOME
    process.env.PROMA_CLAUDE_HOME = claudeHomeDir
    originalApiKey = process.env.ANTHROPIC_API_KEY
    originalBaseUrl = process.env.ANTHROPIC_BASE_URL
    originalCmsBaseUrl = process.env.PROMA_CMS_BASE_URL
    originalCmsSiteId = process.env.PROMA_CMS_SITE_ID
    originalCmsUsername = process.env.PROMA_CMS_USERNAME
    originalCmsPassword = process.env.PROMA_CMS_PASSWORD
    originalPlaywrightMcpUrl = process.env.AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL
    originalInternalAppOrigin = process.env.AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN
    originalRuntimeEnv = process.env.AI_PAGE_BUILDER_RUNTIME_ENV
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
  })

  afterEach(() => {
    mock.restore()
    delete process.env.PROMA_CONFIG_DIR
    if (originalClaudeConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
    }
    if (originalClaudeHome === undefined) {
      delete process.env.PROMA_CLAUDE_HOME
    } else {
      process.env.PROMA_CLAUDE_HOME = originalClaudeHome
    }
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
    if (originalCmsBaseUrl === undefined) {
      delete process.env.PROMA_CMS_BASE_URL
    } else {
      process.env.PROMA_CMS_BASE_URL = originalCmsBaseUrl
    }
    if (originalCmsSiteId === undefined) {
      delete process.env.PROMA_CMS_SITE_ID
    } else {
      process.env.PROMA_CMS_SITE_ID = originalCmsSiteId
    }
    if (originalCmsUsername === undefined) {
      delete process.env.PROMA_CMS_USERNAME
    } else {
      process.env.PROMA_CMS_USERNAME = originalCmsUsername
    }
    if (originalCmsPassword === undefined) {
      delete process.env.PROMA_CMS_PASSWORD
    } else {
      process.env.PROMA_CMS_PASSWORD = originalCmsPassword
    }
    if (originalPlaywrightMcpUrl === undefined) {
      delete process.env.AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL
    } else {
      process.env.AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL = originalPlaywrightMcpUrl
    }
    if (originalInternalAppOrigin === undefined) {
      delete process.env.AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN
    } else {
      process.env.AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN = originalInternalAppOrigin
    }
    if (originalRuntimeEnv === undefined) {
      delete process.env.AI_PAGE_BUILDER_RUNTIME_ENV
    } else {
      process.env.AI_PAGE_BUILDER_RUNTIME_ENV = originalRuntimeEnv
    }
    rmSync(configDir, { recursive: true, force: true })
    rmSync(claudeHomeDir, { recursive: true, force: true })
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

  test('writes request payload and prompt sidecars when diagnostic context is provided', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Diagnostic Sidecars')
    const session = createAgentSession('Diagnostic sidecar session', undefined, workspace.id)
    const requestTrace = createRequestTraceContext({
      requestId: 'request-sidecar-test',
      method: 'POST',
      path: `/api/sessions/${session.id}/send`,
    })
    const turnTrace = createTurnTraceContext({
      requestId: requestTrace.requestId,
      turnId: 'turn-sidecar-test',
      sessionId: session.id,
      workspaceId: workspace.id,
    })

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: 'Inspect this workspace and summarize the current state.',
        channelId: '',
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
      {
        requestTrace,
        turnTrace,
        structuredRequestPayload: buildStructuredRequestPayload({
          contentType: 'application/json',
          body: {
            userMessage: 'Inspect this workspace and summarize the current state.',
            workspaceId: workspace.id,
          },
        }),
      },
    )

    const turnDir = join(configDir, 'logs', 'turns', turnTrace.turnId)
    const sidecarFiles = readdirSync(turnDir)

    expect(sidecarFiles).toEqual(expect.arrayContaining([
      'conversation-messages.part-001.txt',
      'final-prompt.part-001.txt',
      'request-payload.part-001.txt',
      'system-prompt.part-001.txt',
      'user-message.part-001.txt',
    ]))
    expect(readFileSync(join(turnDir, 'request-payload.part-001.txt'), 'utf-8')).toContain('Inspect this workspace')
    expect(readFileSync(join(turnDir, 'final-prompt.part-001.txt'), 'utf-8')).toContain('Inspect this workspace')
    expect(readFileSync(join(turnDir, 'system-prompt.part-001.txt'), 'utf-8')).toContain(session.id)
  })

  test('records only current-turn messages in the conversation sidecar instead of the full session history', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Diagnostic Turn Slice')
    const session = createAgentSession('Diagnostic turn slice session', undefined, workspace.id)

    appendAgentMessage(session.id, {
      id: 'history-user-message',
      role: 'user',
      content: 'Historical user message that should stay out of the sidecar.',
      createdAt: Date.now() - 2_000,
    })
    appendAgentMessage(session.id, {
      id: 'history-assistant-message',
      role: 'assistant',
      content: 'Historical assistant message that should stay out of the sidecar.',
      createdAt: Date.now() - 1_000,
      model: 'historical-model',
      events: [],
    })

    const requestTrace = createRequestTraceContext({
      requestId: 'request-turn-slice-test',
      method: 'POST',
      path: `/api/sessions/${session.id}/send`,
    })
    const turnTrace = createTurnTraceContext({
      requestId: requestTrace.requestId,
      turnId: 'turn-slice-test',
      sessionId: session.id,
      workspaceId: workspace.id,
    })

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: 'Only keep the current turn messages in the sidecar.',
        channelId: '',
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
      {
        requestTrace,
        turnTrace,
        structuredRequestPayload: buildStructuredRequestPayload({
          contentType: 'application/json',
          body: {
            userMessage: 'Only keep the current turn messages in the sidecar.',
            workspaceId: workspace.id,
          },
        }),
      },
    )

    const conversationMessages = readFileSync(
      join(configDir, 'logs', 'turns', turnTrace.turnId, 'conversation-messages.part-001.txt'),
      'utf-8',
    )

    expect(conversationMessages).toContain('scope: current_turn_messages')
    expect(conversationMessages).toContain('omittedHistoryMessageCount: 2')
    expect(conversationMessages).toContain('Only keep the current turn messages in the sidecar.')
    expect(conversationMessages).not.toContain('Historical user message that should stay out of the sidecar.')
    expect(conversationMessages).not.toContain('Historical assistant message that should stay out of the sidecar.')
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

  test('passes workspace scoped mcp servers to the adapter query options with stable startup fields', async () => {
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
          env: { FOO: 'bar' },
          timeout: 45,
          enabled: true,
        },
        browser: {
          type: 'sse',
          url: 'https://example.com/browser',
          headers: { Authorization: 'Bearer token' },
          enabled: true,
        },
        disabled: {
          type: 'http',
          url: 'https://example.com/disabled',
          enabled: false,
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
        env: {
          PATH: process.env.PATH,
          FOO: 'bar',
        },
        startup_timeout_sec: 45,
        required: false,
      },
      browser: {
        type: 'sse',
        url: 'https://example.com/browser',
        headers: { Authorization: 'Bearer token' },
        required: false,
      },
    })
  })

  test('suppresses default page-builder MCP servers on the very first turn', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Page Builder MCP First Turn', { template: 'page-builder' })
    const session = createAgentSession('First turn session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '你好',
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

    expect(adapter.lastInput?.mcpServers).toMatchObject({
      image_search: {
        type: 'sdk',
        name: 'image_search',
      },
    })
    expect(adapter.lastInput?.mcpServers).not.toHaveProperty('playwright')
    expect(adapter.lastInput?.mcpServers).not.toHaveProperty('server-sequential-thinking')
  })

  test('restores default page-builder MCP servers after the first turn completes when runtime playwright is not configured', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Page Builder MCP Follow-up', { template: 'page-builder' })
    const session = createAgentSession('Follow-up session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '你好',
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

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '帮我生成一个极简首页',
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

    expect(adapter.inputs).toHaveLength(2)
    expect(adapter.inputs[0]?.mcpServers).toMatchObject({
      image_search: {
        type: 'sdk',
        name: 'image_search',
      },
    })
    expect(adapter.inputs[0]?.mcpServers).not.toHaveProperty('playwright')
    expect(adapter.inputs[0]?.mcpServers).not.toHaveProperty('server-sequential-thinking')
    expect(adapter.inputs[1]?.mcpServers).toMatchObject({
      image_search: {
        type: 'sdk',
        name: 'image_search',
      },
      playwright: {
        type: 'stdio',
        command: 'npx',
      },
      'server-sequential-thinking': {
        type: 'stdio',
        command: 'npx',
      },
    })
  })

  test('allows an explicitly mentioned MCP server on the first page-builder turn when runtime playwright is not configured', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Page Builder MCP Mention', { template: 'page-builder' })
    const session = createAgentSession('Mention session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请使用浏览器检查预览',
        channelId: '',
        mentionedMcpServers: ['playwright'],
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(adapter.lastInput?.mcpServers).toMatchObject({
      image_search: {
        type: 'sdk',
        name: 'image_search',
      },
      playwright: {
        type: 'stdio',
        command: 'npx',
        args: ['@playwright/mcp@latest', '--headless', '--browser', 'chrome'],
        env: {
          PATH: process.env.PATH,
        },
        required: false,
        startup_timeout_sec: 30,
      },
    })
  })

  test('suppresses the default page-builder playwright MCP in docker runtime when no sidecar endpoint is configured', async () => {
    process.env.AI_PAGE_BUILDER_RUNTIME_ENV = 'docker'

    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Page Builder Docker Without Sidecar', { template: 'page-builder' })
    const session = createAgentSession('Docker without sidecar session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '你好',
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

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请使用浏览器检查预览',
        channelId: '',
        mentionedMcpServers: ['playwright'],
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(adapter.inputs).toHaveLength(2)
    expect(adapter.inputs[1]?.mcpServers).toMatchObject({
      'server-sequential-thinking': {
        type: 'stdio',
        command: 'npx',
      },
    })
    expect(adapter.inputs[1]?.mcpServers).not.toHaveProperty('playwright')
    expect(adapter.inputs[1]?.prompt).not.toContain('<mentioned_tools>')
  })

  test('does not fail the query when the docker internal app origin is invalid', async () => {
    process.env.AI_PAGE_BUILDER_RUNTIME_ENV = 'docker'
    process.env.AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL = 'http://playwright:8931/mcp'
    process.env.AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN = 'server:8888'

    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Page Builder Invalid Origin', { template: 'page-builder' })
    const session = createAgentSession('Invalid origin session', undefined, workspace.id)
    const workspaceFilesDir = getWorkspaceFilesDir(workspace.slug)

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(join(workspaceFilesDir, 'index.html'), '<!doctype html><html><body><h1>Preview</h1></body></html>', 'utf-8')

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请使用浏览器检查预览',
        channelId: '',
        mentionedMcpServers: ['playwright'],
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(adapter.lastInput?.mcpServers).toMatchObject({
      image_search: {
        type: 'sdk',
        name: 'image_search',
      },
      playwright: {
        type: 'http',
        url: 'http://playwright:8931/mcp',
        required: false,
      },
    })
    expect(adapter.lastInput?.prompt).toContain('<page_builder_runtime_playwright>docker-http</page_builder_runtime_playwright>')
    expect(adapter.lastInput?.prompt).not.toContain('<page_builder_internal_preview_url>')
  })

  test('resolves the default page-builder playwright MCP to the docker runtime endpoint when configured', async () => {
    process.env.AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL = 'http://playwright:8931/mcp'

    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Page Builder Docker Playwright', { template: 'page-builder' })
    const session = createAgentSession('Docker playwright session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请使用浏览器检查预览',
        channelId: '',
        mentionedMcpServers: ['playwright'],
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(adapter.lastInput?.mcpServers).toMatchObject({
      image_search: {
        type: 'sdk',
        name: 'image_search',
      },
      playwright: {
        type: 'http',
        url: 'http://playwright:8931/mcp',
        required: false,
      },
    })
  })

  test('does not override a custom page-builder playwright MCP when docker runtime is configured', async () => {
    process.env.AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL = 'http://playwright:8931/mcp'

    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Page Builder Custom Playwright', { template: 'page-builder' })
    const session = createAgentSession('Custom playwright session', undefined, workspace.id)

    saveWorkspaceMcpConfig(workspace.slug, {
      servers: {
        playwright: {
          type: 'stdio',
          command: 'node',
          args: ['custom-playwright.js'],
          enabled: true,
          timeout: 88,
        },
      },
    })

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请使用浏览器检查预览',
        channelId: '',
        mentionedMcpServers: ['playwright'],
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(adapter.lastInput?.mcpServers).toMatchObject({
      image_search: {
        type: 'sdk',
        name: 'image_search',
      },
      playwright: {
        type: 'stdio',
        command: 'node',
        args: ['custom-playwright.js'],
        env: {
          PATH: process.env.PATH,
        },
        required: false,
        startup_timeout_sec: 88,
      },
    })
  })

  test('injects an internal preview url into the page-builder prompt when docker playwright runtime is active', async () => {
    process.env.AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL = 'http://playwright:8931/mcp'
    process.env.AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN = 'http://server:8888'

    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Page Builder Internal Preview', { template: 'page-builder' })
    const session = createAgentSession('Internal preview session', undefined, workspace.id)
    const workspaceFilesDir = getWorkspaceFilesDir(workspace.slug)

    mkdirSync(workspaceFilesDir, { recursive: true })
    writeFileSync(join(workspaceFilesDir, 'index.html'), '<!doctype html><html><body><h1>Preview</h1></body></html>', 'utf-8')

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请使用浏览器检查预览',
        channelId: '',
        mentionedMcpServers: ['playwright'],
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(adapter.lastInput?.prompt).toContain('<page_builder_internal_preview_url>')
    expect(adapter.lastInput?.prompt).toContain(`http://server:8888/api/workspaces/${workspace.id}/preview/`)
    expect(adapter.lastInput?.prompt).toContain('<page_builder_runtime_playwright>docker-http</page_builder_runtime_playwright>')
    expect(adapter.lastInput?.prompt).toContain('不要对 workspace 文件使用 file:// URL')
    expect(adapter.lastInput?.prompt).toContain('- playwright (http, 已启用): http://playwright:8931/mcp')
    expect(adapter.lastInput?.prompt).not.toContain('- playwright (stdio, 已启用): npx @playwright/mcp@latest --headless --browser chrome')
  })

  test('does not inject an internal preview url when no preview is available', async () => {
    process.env.AI_PAGE_BUILDER_PLAYWRIGHT_MCP_URL = 'http://playwright:8931/mcp'
    process.env.AI_PAGE_BUILDER_INTERNAL_APP_ORIGIN = 'http://server:8888'

    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Page Builder Missing Preview', { template: 'page-builder' })
    const session = createAgentSession('Missing preview session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请使用浏览器检查预览',
        channelId: '',
        mentionedMcpServers: ['playwright'],
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(adapter.lastInput?.prompt).not.toContain('<page_builder_internal_preview_url>')
    expect(adapter.lastInput?.prompt).not.toContain(`http://server:8888/api/workspaces/${workspace.id}/preview/`)
    expect(adapter.lastInput?.prompt).toContain('<page_builder_runtime_playwright>docker-http</page_builder_runtime_playwright>')
    expect(adapter.lastInput?.prompt).toContain('不要对 workspace 文件使用 file:// URL')
  })

  test('auto-injects runtime cms sdk tools into page-builder queries when cms env is configured', async () => {
    process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/manager'
    process.env.PROMA_CMS_SITE_ID = '277'
    process.env.PROMA_CMS_USERNAME = 'test-user'
    process.env.PROMA_CMS_PASSWORD = 'test-pass'

    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Page Builder CMS Runtime', { template: 'page-builder' })
    const session = createAgentSession('CMS runtime session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '读取 CMS 栏目',
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

    expect(adapter.lastInput?.mcpServers).toMatchObject({
      cms: {
        type: 'sdk',
        name: 'cms',
      },
    })
    expect(adapter.lastInput?.mcpServers?.cms).toHaveProperty('instance')
    expect(adapter.lastInput?.allowedTools).toEqual(expect.arrayContaining([
      'mcp__cms__list_catalogs',
      'mcp__cms__list_contents',
      'mcp__cms__decide_cms_binding',
      'mcp__cms__apply_cms_binding',
    ]))
  })

  test('auto-injects runtime image search sdk tools into page-builder queries without persisting them to workspace mcp config', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Page Builder Image Search Runtime', { template: 'page-builder' })
    const session = createAgentSession('image search runtime session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '帮我搜索一些适合首页 hero 的图片',
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

    expect(adapter.lastInput?.mcpServers).toMatchObject({
      image_search: {
        type: 'sdk',
        name: 'image_search',
      },
    })
    expect(adapter.lastInput?.mcpServers?.image_search).toHaveProperty('instance')
    expect(adapter.lastInput?.allowedTools).toEqual(expect.arrayContaining([
      'mcp__image_search__search_images',
      'mcp__image_search__download_images',
    ]))
  })

  test('injects runtime cms sdk tools when page-builder explicitly mentions the cms MCP server', async () => {
    process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/manager'
    process.env.PROMA_CMS_SITE_ID = '277'
    process.env.PROMA_CMS_USERNAME = 'test-user'
    process.env.PROMA_CMS_PASSWORD = 'test-pass'

    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Page Builder CMS Runtime Mention', { template: 'page-builder' })
    const session = createAgentSession('CMS runtime mention session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '读取 CMS 栏目并绑定到当前区块',
        channelId: '',
        mentionedMcpServers: ['cms'],
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(adapter.lastInput?.mcpServers).toMatchObject({
      cms: {
        type: 'sdk',
        name: 'cms',
      },
    })
    expect(adapter.lastInput?.mcpServers?.cms).toHaveProperty('instance')
    expect(adapter.lastInput?.allowedTools).toEqual(expect.arrayContaining([
      'mcp__cms__list_catalogs',
      'mcp__cms__list_contents',
      'mcp__cms__decide_cms_binding',
      'mcp__cms__apply_cms_binding',
    ]))
    expect(adapter.lastInput?.prompt).toContain('- MCP 服务器: cms（请使用此 MCP 服务器的工具来完成任务）')
  })

  test('injects runtime cms sdk tools when page-builder explicitly mentions the cms-binding-apply skill', async () => {
    process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/manager'
    process.env.PROMA_CMS_SITE_ID = '277'
    process.env.PROMA_CMS_USERNAME = 'test-user'
    process.env.PROMA_CMS_PASSWORD = 'test-pass'

    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Page Builder CMS Skill Mention', { template: 'page-builder' })
    const session = createAgentSession('CMS skill mention session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请使用 cms-binding-apply 处理当前区块',
        channelId: '',
        mentionedSkills: ['cms-binding-apply'],
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(adapter.lastInput?.mcpServers).toMatchObject({
      cms: {
        type: 'sdk',
        name: 'cms',
      },
    })
    expect(adapter.lastInput?.allowedTools).toEqual(expect.arrayContaining([
      'mcp__cms__list_catalogs',
      'mcp__cms__list_contents',
      'mcp__cms__decide_cms_binding',
      'mcp__cms__apply_cms_binding',
    ]))
    expect(adapter.lastInput?.prompt).toContain(`- Skill: ${workspace.slug}:cms-binding-apply（请立即调用此 Skill）`)
  })

  test('injects host-bootstrapped skill context for confirmed cms handoff turns without relying only on mentioned skills', async () => {
    process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/manager'
    process.env.PROMA_CMS_SITE_ID = '277'
    process.env.PROMA_CMS_USERNAME = 'test-user'
    process.env.PROMA_CMS_PASSWORD = 'test-pass'

    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Page Builder CMS Bootstrapped Skill', { template: 'page-builder' })
    const session = createAgentSession('CMS bootstrapped skill session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请根据刚确认的 CMS 选择结果，判断如何应用到当前区块',
        composedUserMessage: '<cms_binding_apply_input>{"version":8,"handoffId":"handoff-1"}</cms_binding_apply_input>',
        channelId: '',
        mentionedSkills: ['cms-binding-apply'],
        bootstrappedSkills: ['cms-binding-apply'],
        mentionedMcpServers: ['cms'],
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(adapter.lastInput?.prompt).toContain('<bootstrapped_skills>')
    expect(adapter.lastInput?.prompt).toContain('宿主已为本次 turn 预加载以下 Skill')
    expect(adapter.lastInput?.prompt).toContain('cms-binding-apply')
    expect(adapter.lastInput?.prompt).toContain('Use this skill after CMS browsing is already complete.')
    expect(adapter.lastInput?.prompt).toContain('<mentioned_tools>')
    expect(adapter.lastInput?.prompt).toContain('- MCP 服务器: cms（请使用此 MCP 服务器的工具来完成任务）')
    expect(adapter.lastInput?.prompt).not.toContain(`- Skill: ${workspace.slug}:cms-binding-apply（请立即调用此 Skill）`)
  })

  test('keeps existing cms ordinary-edit turns on the page-builder owner chain with bootstrapped consult skill context', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Existing CMS Ordinary Edit', { template: 'page-builder' })
    const session = createAgentSession('Existing CMS Ordinary Edit Session', undefined, workspace.id)
    const composedUserMessage = [
      '<page_builder_turn_routing>{"sceneKind":"existing-cms-region-ordinary-edit","ownerSkill":"page-builder-guided-generation","ownerLockedForTurn":true,"consultSkills":["page-builder-cms-region-authoring-guidance"]}</page_builder_turn_routing>',
      '<page_builder_selection>{"targetSelection":{"kind":"cms-island","selector":"section:nth-of-type(2) > cms-content:nth-of-type(1)","sourceSelector":"section:nth-of-type(2) > cms-content:nth-of-type(1)","parentBlockSelector":"[data-proma-block-id=\\"pb_blk_news\\"]","component":"cms-content"}}</page_builder_selection>',
      '<page_builder_cms_guidance_notice>{"mode":"page-has-existing-cms-regions","consultSkill":"page-builder-cms-region-authoring-guidance","currentPageHasExistingCmsRegions":true,"doNotInventCmsTags":true,"doNotGuessBindingProps":true,"doNotAddPageWideVueRuntime":true,"queryPropsChangeRequiresConfirmedApply":true}</page_builder_cms_guidance_notice>',
      '<page_builder_cms_region_authoring>{"mode":"ordinary-existing-region","component":"cms-content","sourceType":"contents-by-catalog","boundary":{"editBoundary":"source-atomic","sourceFirst":true,"queryPropsChangeRequiresConfirmedApply":true}}</page_builder_cms_region_authoring>',
      '继续修改这个区块，把卡片间距调紧一些。',
    ].join('\n\n')

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '继续修改这个区块，把卡片间距调紧一些。',
        composedUserMessage,
        channelId: '',
        mentionedSkills: ['page-builder-guided-generation'],
        bootstrappedSkills: ['page-builder-guided-generation', 'page-builder-cms-region-authoring-guidance'],
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(adapter.lastInput?.prompt).toContain('<bootstrapped_skills>')
    expect(adapter.lastInput?.prompt).toContain('page-builder-guided-generation')
    expect(adapter.lastInput?.prompt).toContain('page-builder-cms-region-authoring-guidance')
    expect(adapter.lastInput?.prompt).toContain('<page_builder_turn_routing>')
    expect(adapter.lastInput?.prompt).toContain('"sceneKind":"existing-cms-region-ordinary-edit"')
    expect(adapter.lastInput?.prompt).toContain('<page_builder_cms_guidance_notice>')
    expect(adapter.lastInput?.prompt).toContain('"mode":"page-has-existing-cms-regions"')
    expect(adapter.lastInput?.prompt).toContain('<page_builder_cms_region_authoring>')
    expect(adapter.lastInput?.prompt).toContain('"sourceType":"contents-by-catalog"')
    expect(adapter.lastInput?.prompt).not.toContain(`- Skill: ${workspace.slug}:page-builder-guided-generation（请立即调用此 Skill）`)
    expect(adapter.lastInput?.prompt).not.toContain(`- Skill: ${workspace.slug}:page-builder-cms-region-authoring-guidance（请立即调用此 Skill）`)
  })

  test('keeps page-builder queries on the existing string prompt path even when cms env is configured', async () => {
    process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/manager'
    process.env.PROMA_CMS_SITE_ID = '277'
    process.env.PROMA_CMS_USERNAME = 'test-user'
    process.env.PROMA_CMS_PASSWORD = 'test-pass'

    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Page Builder CMS Prompt', { template: 'page-builder' })
    const session = createAgentSession('CMS prompt session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '给我一条 CMS 内容摘要',
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

    expect(typeof adapter.lastInput?.prompt).toBe('string')
  })

  test('keeps ordinary workspaces on the existing string prompt path without cms runtime tools', async () => {
    process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/manager'
    process.env.PROMA_CMS_SITE_ID = '277'
    process.env.PROMA_CMS_USERNAME = 'test-user'
    process.env.PROMA_CMS_PASSWORD = 'test-pass'

    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Regular Workspace')
    const session = createAgentSession('Regular session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '读取一下工作区信息',
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

    expect(typeof adapter.lastInput?.prompt).toBe('string')
    expect(adapter.lastInput?.mcpServers).toBeUndefined()
    expect(adapter.lastInput?.allowedTools).not.toEqual(expect.arrayContaining([
      'mcp__cms__list_catalogs',
      'mcp__cms__list_contents',
    ]))
    expect(adapter.lastInput?.allowedTools).not.toEqual(expect.arrayContaining([
      'mcp__image_search__search_images',
      'mcp__image_search__download_images',
    ]))
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
    expect(adapter.lastInput?.prompt).toContain(`- Skill: ${workspace.slug}:docs（请立即调用此 Skill）`)
    expect(adapter.lastInput?.prompt).not.toContain(`proma-workspace-${workspace.slug}:docs`)
    expect(adapter.lastInput?.prompt).toContain('<workspace_slug>')
    expect(adapter.lastInput?.prompt).toContain('<workspace_memory_file>')
    expect(adapter.lastInput?.prompt).toContain(getWorkspaceMemoryFilePath(workspace.slug))
    expect(adapter.lastInput?.prompt).toContain('不要猜测或改写为 sdk-config/projects')
    expect(adapter.lastInput?.prompt).toContain('<workspace_root>')
    expect(adapter.lastInput?.prompt).toContain(getAgentWorkspacePath(workspace.slug))
    expect(adapter.lastInput?.prompt).toContain('<workspace_files_dir>')
    expect(adapter.lastInput?.prompt).toContain(getWorkspaceFilesDir(workspace.slug))
    expect(adapter.lastInput?.prompt).toContain('<workspace_runtime_mode>scratch</workspace_runtime_mode>')
    expect(adapter.lastInput?.prompt).toContain('宿主管理的 workspace session scratch 目录')
    expect(adapter.lastInput?.prompt).not.toContain('Proma 管理的 workspace session scratch 目录')
    expect(adapter.lastInput?.prompt).toContain('纯研究、搜索、总结、规划类 subagent 默认不要请求 worktree isolation')
    expect(adapter.lastInput?.systemPrompt?.append).toContain('你是当前工作台内置的 AI 助手')
    expect(adapter.lastInput?.systemPrompt?.append).toContain('当用户问“你是谁”“你是什么”时')
    expect(adapter.lastInput?.systemPrompt?.append).toContain('任何时候都不要把自己描述为某个具体产品、模型、CLI、SDK、厂商服务或内部代号')
    expect(adapter.lastInput?.systemPrompt?.append).not.toContain('## Proma Agent')
    expect(adapter.lastInput?.systemPrompt?.append).not.toContain('你是专题网页开发助手')
    expect(adapter.lastInput?.systemPrompt?.append).not.toContain('Proma scratch 目录')
  })

  test('injects structured attachments into the runtime prompt while keeping persisted user content clean', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Attachment Prompt Docs')
    const session = createAgentSession('Attachment Prompt Session', undefined, workspace.id)
    const attachments = await saveAgentSessionAttachments({
      sessionId: session.id,
      workspaceId: workspace.id,
      files: [new File(['preview'], 'reference.png', { type: 'image/png' })],
    })

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请按照附件里的视觉风格生成页面',
        channelId: '',
        attachments,
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    const persistedUserMessage = getAgentSessionMessages(session.id).find((message) => message.role === 'user')

    expect(persistedUserMessage?.content).toBe('请按照附件里的视觉风格生成页面')
    expect(persistedUserMessage?.attachments).toEqual(attachments)
    expect(adapter.lastInput?.prompt).toContain('<attached_files>')
    expect(adapter.lastInput?.prompt).toContain(attachments[0]!.filename)
    expect(adapter.lastInput?.prompt).toContain(resolveAgentSessionAttachmentPath(workspace.slug, session.id, attachments[0]!.localPath))
  })

  test('keeps page-builder selection context out of persisted history while still injecting it into the runtime prompt', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Selection Prompt Docs')
    const session = createAgentSession('Selection Prompt Session', undefined, workspace.id)
    const composedUserMessage = [
      '<page_builder_selection>',
      'selector: h1:nth-of-type(1)',
      '</page_builder_selection>',
      '',
      '把标题改成产品首页',
    ].join('\n')

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '把标题改成产品首页',
        composedUserMessage,
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

    const persistedUserMessage = getAgentSessionMessages(session.id).find((message) => message.role === 'user')

    expect(persistedUserMessage?.content).toBe('把标题改成产品首页')
    expect(String(persistedUserMessage?.content)).not.toContain('<page_builder_selection>')
    expect(adapter.lastInput?.prompt).toContain('<page_builder_selection>')
    expect(adapter.lastInput?.prompt).toContain('selector: h1:nth-of-type(1)')
    expect(adapter.lastInput?.prompt).toContain('把标题改成产品首页')
  })

  test('rolls back saved attachments when preflight fails before the user message is persisted', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Attachment Rollback Docs')
    const session = createAgentSession('Attachment Rollback Session', undefined, workspace.id)
    const attachments = await saveAgentSessionAttachments({
      sessionId: session.id,
      workspaceId: workspace.id,
      files: [new File(['preview'], 'reference.png', { type: 'image/png' })],
    })
    const attachmentPath = resolveAgentSessionAttachmentPath(workspace.slug, session.id, attachments[0]!.localPath)

    delete process.env.ANTHROPIC_API_KEY

    const onErrors: string[] = []
    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请参考附件',
        channelId: '',
        attachments,
      },
      {
        onError: (message) => {
          onErrors.push(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(onErrors).toEqual(['未检测到 ANTHROPIC_API_KEY 环境变量，请先在终端配置后再发送消息'])
    expect(getAgentSessionMessages(session.id)).toEqual([])
    expect(existsSync(attachmentPath)).toBe(false)
  })

  test('keeps smart-mode sessions on the canUseTool path instead of bypassing permissions entirely', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Guardrail Docs')
    const session = createAgentSession('Guardrail session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请创建一个 scratch subagent',
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

    expect(adapter.lastInput?.sdkPermissionMode).toBe('default')
    expect(adapter.lastInput?.canUseTool).toBeDefined()
    expect(adapter.lastInput?.allowDangerouslySkipPermissions).toBe(false)

    const permissionResult = await adapter.lastInput?.canUseTool?.(
      'Agent',
      {
        description: 'scratch researcher',
        isolation: 'worktree',
        mode: 'default',
        model: 'sonnet',
        name: 'weather-researcher',
        prompt: '只做天气检索',
        resume: '',
        run_in_background: false,
        subagent_type: 'general-purpose',
        team_name: '',
      },
      {
        signal: new AbortController().signal,
        toolUseID: 'tool-1',
      },
    )

    expect(permissionResult?.behavior).toBe('allow')
    expect(permissionResult?.updatedInput).toEqual({
      description: 'scratch researcher',
      mode: 'default',
      model: 'sonnet',
      name: 'weather-researcher',
      prompt: '只做天气检索',
      resume: '',
      run_in_background: false,
      subagent_type: 'general-purpose',
    })
  })

  test('keeps page-builder sessions on canUseTool in global auto mode and preserves AskUserQuestion', async () => {
    updateSettings({ agentPermissionMode: 'auto' })

    const adapter = new RecordingAdapter()
    const eventBus = new AgentEventBus()
    const askUserRequests: AskUserRequest[] = []
    eventBus.on((_sessionId, event) => {
      if (event.type === 'ask_user_request') {
        askUserRequests.push(event.request)
      }
    })

    const orchestrator = new AgentOrchestrator(adapter, eventBus)
    const workspace = createAgentWorkspace('Page Builder Docs', { template: 'page-builder' })
    const session = createAgentSession('Page Builder Session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请帮我做一个页面',
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

    expect(adapter.lastInput?.sdkPermissionMode).toBe('default')
    expect(adapter.lastInput?.allowDangerouslySkipPermissions).toBe(false)
    expect(adapter.lastInput?.canUseTool).toBeDefined()

    const writeResult = await adapter.lastInput?.canUseTool?.(
      'Write',
      {
        file_path: 'workspace-files/index.html',
        content: '<html><body>hello</body></html>',
      },
      {
        signal: new AbortController().signal,
        toolUseID: 'tool-write-1',
      },
    )

    expect(writeResult?.behavior).toBe('allow')
    expect(askUserRequests).toHaveLength(0)

    const askInput = {
      questions: [{
        header: '风格',
        question: '你想要什么网页风格？',
        options: [{ label: '极简', description: '留白多，信息清晰' }],
      }],
    }
    const askPromise = adapter.lastInput?.canUseTool?.(
      'AskUserQuestion',
      askInput,
      {
        signal: new AbortController().signal,
        toolUseID: 'tool-ask-1',
      },
    )

    expect(askUserRequests).toHaveLength(1)
    const request = askUserRequests[0]!
    expect(request.sessionId).toBe(session.id)
    expect(request.questions[0]?.question).toBe('你想要什么网页风格？')

    expect(askUserService.respondToAskUser(request.requestId, { 0: '极简' })).toBe(session.id)
    const askResult = await askPromise

    expect(askResult?.behavior).toBe('allow')
    expect(askResult?.updatedInput).toEqual({
      ...askInput,
      answers: { 0: '极简' },
    })
  })

  test('keeps ordinary workspaces on SDK bypass in global auto mode', async () => {
    updateSettings({ agentPermissionMode: 'auto' })

    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Auto Docs')
    const session = createAgentSession('Auto Session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '读取一下目录',
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

    expect(adapter.lastInput?.sdkPermissionMode).toBe('bypassPermissions')
    expect(adapter.lastInput?.allowDangerouslySkipPermissions).toBe(true)
    expect(adapter.lastInput?.canUseTool).toBeUndefined()
  })

  test('registers a PreToolUse hook that rewrites scratch Agent worktree requests', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Hook Docs')
    const session = createAgentSession('Hook session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请创建一个研究型 subagent',
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

    const preToolUseHook = adapter.lastInput?.hooks?.PreToolUse?.[0]?.hooks[0]
    expect(preToolUseHook).toBeDefined()

    const hookResult = await preToolUseHook?.(
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'Agent',
        tool_input: {
          description: 'hook rewrite',
          isolation: 'worktree',
          mode: 'default',
          model: 'sonnet',
          name: 'hook-agent',
          prompt: '只做研究',
          resume: '',
          run_in_background: false,
          subagent_type: 'general-purpose',
          team_name: '',
        },
        tool_use_id: 'tool-1',
      },
      'tool-1',
      { signal: new AbortController().signal },
    )

    expect(hookResult?.continue).toBe(true)
    expect(hookResult?.hookSpecificOutput).toEqual({
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: 'Scratch workspace subagents run without worktree isolation',
      updatedInput: {
        description: 'hook rewrite',
        mode: 'default',
        model: 'sonnet',
        name: 'hook-agent',
        prompt: '只做研究',
        resume: '',
        run_in_background: false,
        subagent_type: 'general-purpose',
      },
    })
  })

  test('blocks owner-controller switching inside a page-builder turn that already has a locked owner', async () => {
    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Page Builder Hook', { template: 'page-builder' })
    const session = createAgentSession('Hook session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '继续修改当前页面',
        composedUserMessage: [
          '<page_builder_turn_routing>{"sceneKind":"ordinary-page-flow","ownerSkill":"page-builder-guided-generation","ownerLockedForTurn":true}</page_builder_turn_routing>',
          '继续修改当前页面',
        ].join('\n\n'),
        channelId: '',
        bootstrappedSkills: ['page-builder-guided-generation'],
      },
      {
        onError: (message) => {
          throw new Error(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    const preToolUseHook = adapter.lastInput?.hooks?.PreToolUse?.[0]?.hooks[0]
    expect(preToolUseHook).toBeDefined()

    const hookResult = await preToolUseHook?.(
      {
        hook_event_name: 'PreToolUse',
        tool_name: `${workspace.slug}:cms-binding-apply`,
        tool_input: {},
        tool_use_id: 'tool-owner-switch-1',
      },
      'tool-owner-switch-1',
      { signal: new AbortController().signal },
    )

    expect(hookResult?.continue).toBe(false)
    expect(hookResult?.hookSpecificOutput).toEqual({
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: '当前 turn owner 已被宿主锁定为 page-builder-guided-generation，不得在同一轮内切换到 cms-binding-apply。如需切换 owner，必须等待宿主发起新的 handoff turn。',
    })
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

  test('persists a repeated sdk session id only once', async () => {
    class RepeatedSessionIdAdapter implements AgentProviderAdapter {
      async *query(input: AgentQueryInput): AsyncIterable<AgentEvent> {
        const captured = input as CapturedQueryInput & {
          onSessionId?: (sessionId: string) => void
        }
        captured.onSessionId?.('sdk-repeat-session')
        captured.onSessionId?.('sdk-repeat-session')
        yield { type: 'complete' }
      }

      abort(): void {}

      dispose(): void {}
    }

    const originalConsoleLog = console.log
    const logLines: string[] = []
    console.log = (...args: unknown[]) => {
      logLines.push(args.map((entry) => String(entry)).join(' '))
    }

    try {
      const orchestrator = new AgentOrchestrator(new RepeatedSessionIdAdapter(), new AgentEventBus())
      const workspace = createAgentWorkspace('Repeated SDK Session Docs')
      const session = createAgentSession('Repeated SDK Session', undefined, workspace.id)

      await orchestrator.sendMessage(
        {
          sessionId: session.id,
          userMessage: 'hello',
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

      expect(getAgentSessionMeta(session.id)?.sdkSessionId).toBe('sdk-repeat-session')
      expect(logLines.filter((line) => line.includes('已保存 SDK session_id: sdk-repeat-session'))).toHaveLength(1)
    } finally {
      console.log = originalConsoleLog
    }
  })

  test('validates resumed sdk sessions against the isolated sdk config dir', async () => {
    const observedClaudeConfigDirs: string[] = []
    const listSessionsMock = mock(async () => {
      observedClaudeConfigDirs.push(process.env.CLAUDE_CONFIG_DIR ?? '')

      if (process.env.CLAUDE_CONFIG_DIR === join(configDir, 'sdk-config')) {
        return [{ sessionId: 'sdk-live-session' }]
      }

      return []
    })

    mock.module('@anthropic-ai/claude-agent-sdk', () => ({
      listSessions: listSessionsMock,
    }))

    const adapter = new RecordingAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Resume Validation Docs')
    const session = createAgentSession('Resume validation session', undefined, workspace.id)
    updateAgentSessionMeta(session.id, { sdkSessionId: 'sdk-live-session' })

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: 'Resume this conversation',
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

    expect(listSessionsMock).toHaveBeenCalledTimes(1)
    expect(observedClaudeConfigDirs).toEqual([join(configDir, 'sdk-config')])
    expect(process.env.CLAUDE_CONFIG_DIR).toBeUndefined()
    expect(adapter.lastInput?.resumeSessionId).toBe('sdk-live-session')
    expect(getAgentSessionMeta(session.id)?.sdkSessionId).toBe('sdk-live-session')
  })

  test('prefers team inbox output when auto-resuming teammate results', async () => {
    class TeamResumeAdapter implements AgentProviderAdapter {
      inputs: Array<CapturedQueryInput> = []

      async *query(input: AgentQueryInput): AsyncIterable<AgentEvent> {
        const captured = input as CapturedQueryInput & {
          onSessionId?: (sessionId: string) => void
        }
        this.inputs.push(captured)

        if (this.inputs.length === 1) {
          captured.onSessionId?.('sdk-team-session-1')
          yield {
            type: 'task_started',
            taskId: 'task-1',
            description: 'Search weather sources',
          }
          yield {
            type: 'task_notification',
            taskId: 'task-1',
            status: 'completed',
            summary: 'summary fallback should not win when inbox exists',
          }
          yield { type: 'complete' }
          return
        }

        yield { type: 'text_delta', text: '主代理已汇总 teammate 输出' }
        yield { type: 'complete' }
      }

      abort(): void {}

      dispose(): void {}
    }

    const adapter = new TeamResumeAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const workspace = createAgentWorkspace('Team Resume Docs')
    const session = createAgentSession('Team Resume Session', undefined, workspace.id)

    const teamDir = join(claudeHomeDir, 'teams', 'scratch-research')
    const inboxDir = join(teamDir, 'inboxes')
    mkdirSync(inboxDir, { recursive: true })
    writeFileSync(
      join(teamDir, 'config.json'),
      JSON.stringify({
        name: 'scratch-research',
        createdAt: Date.now(),
        leadSessionId: 'sdk-team-session-1',
        members: [],
      }, null, 2),
      'utf-8',
    )
    writeFileSync(
      join(inboxDir, 'team-lead.json'),
      JSON.stringify([
        { from: 'weather-daily-cn', text: JSON.stringify({ content: '逐日天气结果' }) },
      ], null, 2),
      'utf-8',
    )

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请创建 subagent 并汇总结果',
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

    expect(adapter.inputs).toHaveLength(2)
    expect(adapter.inputs[1]?.resumeSessionId).toBe('sdk-team-session-1')
    expect(adapter.inputs[1]?.prompt).toContain('以下是他们发送的完整工作结果')
    expect(adapter.inputs[1]?.prompt).toContain('逐日天气结果')
    expect(adapter.inputs[1]?.prompt).not.toContain('summary fallback should not win when inbox exists')
  })

  test('keeps invalid direct page-builder html edits after the agent turn completes', async () => {
    const workspace = createAgentWorkspace('Page Builder CMS Guardrails', { template: 'page-builder' })
    const entryPath = join(getWorkspaceFilesDir(workspace.slug), 'index.html')
    const manifestPath = getWorkspaceCmsRenderingManifestPath(workspace.slug)
    const originalHtml = '<!doctype html><html><body><section data-proma-block-id="pb_blk_news"><h1>Safe</h1></section></body></html>'

    mkdirSync(dirname(entryPath), { recursive: true })
    writeFileSync(entryPath, originalHtml, 'utf-8')

    class InvalidCmsEditAdapter implements AgentProviderAdapter {
      async *query(): AsyncIterable<AgentEvent> {
        writeFileSync(
          entryPath,
          [
            '<!doctype html><html><body>',
            '<section data-proma-block-id="pb_blk_news">',
            '  <cms-content site-id="1" catalog-id="6">',
            '    <template v-slot:default="{ items }">',
            '      <style>.bad { color: red; }</style>',
            '      <ul><li v-for="item in items" :key="item.id"><a :href="item.url">{{ item.title }}</a></li></ul>',
            '    </template>',
            '  </cms-content>',
            '</section>',
            '</body></html>',
          ].join('\n'),
          'utf-8',
        )

        yield { type: 'text_delta', text: '完成！我已经更新了当前 CMS 区块。' }
        yield { type: 'complete' }
      }

      abort(): void {}

      dispose(): void {}
    }

    const adapter = new InvalidCmsEditAdapter()
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const session = createAgentSession('Page Builder CMS Guardrails Session', undefined, workspace.id)

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '修改当前选中的 CMS 区块',
        channelId: '',
      },
      {
        onError: () => {},
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    const invalidHtml = [
      '<!doctype html><html><body>',
      '<section data-proma-block-id="pb_blk_news">',
      '  <cms-content site-id="1" catalog-id="6">',
      '    <template v-slot:default="{ items }">',
      '      <style>.bad { color: red; }</style>',
      '      <ul><li v-for="item in items" :key="item.id"><a :href="item.url">{{ item.title }}</a></li></ul>',
      '    </template>',
      '  </cms-content>',
      '</section>',
      '</body></html>',
    ].join('\n')

    expect(readFileSync(entryPath, 'utf-8')).toBe(invalidHtml)
    expect(existsSync(manifestPath)).toBe(false)

    const messages = getAgentSessionMessages(session.id)
    expect(messages.some((message) =>
      message.role === 'status'
      && message.content.includes('CMS authoring 校验失败'),
    )).toBe(false)
  })
})
