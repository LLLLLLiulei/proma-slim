import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentEvent, AgentQueryInput, AgentProviderAdapter, AskUserRequest } from '@proma/shared'
import { AgentEventBus } from './agent-event-bus'
import { saveAgentSessionAttachments } from './agent-attachment-service'
import { AgentOrchestrator } from './agent-orchestrator'
import { askUserService } from './agent-ask-user-service'
import {
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
  let originalClaudeHome: string | undefined
  let originalCmsBaseUrl: string | undefined
  let originalCmsZusid: string | undefined
  let originalCmsCurrentSite: string | undefined

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-orchestrator-workspace-'))
    claudeHomeDir = mkdtempSync(join(tmpdir(), 'proma-claude-home-'))
    process.env.PROMA_CONFIG_DIR = configDir
    originalClaudeHome = process.env.PROMA_CLAUDE_HOME
    process.env.PROMA_CLAUDE_HOME = claudeHomeDir
    originalApiKey = process.env.ANTHROPIC_API_KEY
    originalBaseUrl = process.env.ANTHROPIC_BASE_URL
    originalCmsBaseUrl = process.env.PROMA_CMS_BASE_URL
    originalCmsZusid = process.env.PROMA_CMS_ZUSID
    originalCmsCurrentSite = process.env.PROMA_CMS_CURRENT_SITE
    process.env.ANTHROPIC_API_KEY = 'test-api-key'
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
  })

  afterEach(() => {
    delete process.env.PROMA_CONFIG_DIR
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
    if (originalCmsZusid === undefined) {
      delete process.env.PROMA_CMS_ZUSID
    } else {
      process.env.PROMA_CMS_ZUSID = originalCmsZusid
    }
    if (originalCmsCurrentSite === undefined) {
      delete process.env.PROMA_CMS_CURRENT_SITE
    } else {
      process.env.PROMA_CMS_CURRENT_SITE = originalCmsCurrentSite
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

    expect(adapter.lastInput?.mcpServers).toBeUndefined()
  })

  test('restores default page-builder MCP servers after the first turn completes', async () => {
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
    expect(adapter.inputs[0]?.mcpServers).toBeUndefined()
    expect(adapter.inputs[1]?.mcpServers).toMatchObject({
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

  test('allows an explicitly mentioned MCP server on the first page-builder turn', async () => {
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

    expect(adapter.lastInput?.mcpServers).toEqual({
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

  test('does not auto-inject runtime cms sdk tools into page-builder queries', async () => {
    process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/zcmstest'
    process.env.PROMA_CMS_ZUSID = 'test-zusid'
    process.env.PROMA_CMS_CURRENT_SITE = '277'

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

    expect(adapter.lastInput?.mcpServers).toBeUndefined()
    expect(adapter.lastInput?.allowedTools).not.toEqual(expect.arrayContaining([
      'mcp__cms__list_catalogs',
      'mcp__cms__list_contents',
    ]))
  })

  test('keeps page-builder queries on the existing string prompt path even when cms env is configured', async () => {
    process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/zcmstest'
    process.env.PROMA_CMS_ZUSID = 'test-zusid'
    process.env.PROMA_CMS_CURRENT_SITE = '277'

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
    process.env.PROMA_CMS_BASE_URL = 'https://demo.zving.com/zcmstest'
    process.env.PROMA_CMS_ZUSID = 'test-zusid'
    process.env.PROMA_CMS_CURRENT_SITE = '277'

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
    expect(adapter.lastInput?.prompt).toContain('纯研究、搜索、总结、规划类 subagent 默认不要请求 worktree isolation')
    expect(adapter.lastInput?.systemPrompt?.append).toContain('只有在真实 git 仓库中执行代码修改类任务时，才考虑使用 worktree isolation')
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
      permissionDecisionReason: 'Proma scratch workspace subagents run without worktree isolation',
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
})
