import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentEvent, AgentQueryInput, AgentProviderAdapter, AskUserRequest } from '@proma/shared'
import { AgentEventBus } from './agent-event-bus'
import { AgentOrchestrator } from './agent-orchestrator'
import { askUserService } from './agent-ask-user-service'
import {
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
  getAgentSessionWorkspacePath,
  getAgentWorkspacePath,
  getWorkspaceMemoryFilePath,
  getWorkspaceFilesDir,
} from './config-paths'

interface CapturedQueryInput extends AgentQueryInput {
  additionalDirectories?: string[]
  mcpServers?: Record<string, unknown>
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
  let claudeHomeDir: string
  let originalApiKey: string | undefined
  let originalBaseUrl: string | undefined
  let originalClaudeHome: string | undefined

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-orchestrator-workspace-'))
    claudeHomeDir = mkdtempSync(join(tmpdir(), 'proma-claude-home-'))
    process.env.PROMA_CONFIG_DIR = configDir
    originalClaudeHome = process.env.PROMA_CLAUDE_HOME
    process.env.PROMA_CLAUDE_HOME = claudeHomeDir
    originalApiKey = process.env.ANTHROPIC_API_KEY
    originalBaseUrl = process.env.ANTHROPIC_BASE_URL
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
