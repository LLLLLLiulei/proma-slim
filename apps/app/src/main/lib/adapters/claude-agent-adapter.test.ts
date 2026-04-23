import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { ClaudeAgentQueryOptions } from './claude-agent-adapter'
import { LOGIN_CONFIGURATION_ERROR_MESSAGE } from '../agent-friendly-error'

afterEach(() => {
  mock.restore()
})

describe('ClaudeAgentAdapter SDK option pass-through', () => {
  test('forwards workspace additionalDirectories and mcpServers to the SDK query options', async () => {
    const queryMock = mock(async function* (input: { options: Record<string, unknown> }) {
      yield {
        type: 'result',
        subtype: 'success',
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      }
    })

    mock.module('@anthropic-ai/claude-agent-sdk', () => ({
      query: queryMock,
    }))

    const { ClaudeAgentAdapter } = await import('./claude-agent-adapter')
    const adapter = new ClaudeAgentAdapter()

    for await (const _event of adapter.query({
      sessionId: 'session-1',
      prompt: 'Inspect workspace runtime',
      cwd: '/tmp/workspace/session-1',
      sdkCliPath: '/tmp/claude.js',
      executable: { type: 'node', path: '/usr/bin/node' },
      executableArgs: [],
      env: {},
      sdkPermissionMode: 'default',
      allowDangerouslySkipPermissions: false,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: '' },
      additionalDirectories: ['/tmp/workspace-files', '/tmp/external-docs'],
      mcpServers: {
        docs: {
          type: 'stdio',
          command: 'node',
          args: ['server.js'],
        },
      },
      plugins: [{ type: 'local', path: '/tmp/workspace' }],
    } as ClaudeAgentQueryOptions)) {
      // consume the async iterable so the mocked SDK query executes fully
    }

    expect(queryMock).toHaveBeenCalledTimes(1)
    const sdkCall = queryMock.mock.calls[0]?.[0] as { options: Record<string, unknown> }
    expect(sdkCall.options.additionalDirectories).toEqual(['/tmp/workspace-files', '/tmp/external-docs'])
    expect(sdkCall.options.mcpServers).toEqual({
      docs: {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
      },
    })
    expect(sdkCall.options.plugins).toEqual([{ type: 'local', path: '/tmp/workspace' }])
  })

  test('forwards streamed prompt inputs and runtime sdk mcp server configs to the SDK query options', async () => {
    const queryMock = mock(async function* (input: { prompt: unknown; options: Record<string, unknown> }) {
      yield {
        type: 'result',
        subtype: 'success',
        usage: {
          input_tokens: 3,
          output_tokens: 5,
        },
      }
    })

    mock.module('@anthropic-ai/claude-agent-sdk', () => ({
      query: queryMock,
    }))

    const streamedPrompt = (async function* () {
      yield {
        type: 'user' as const,
        message: {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: 'Inspect runtime CMS tools' }],
        },
        parent_tool_use_id: null,
        session_id: 'sdk-session-1',
      }
    })()

    const runtimeCmsServer = {
      type: 'sdk',
      name: 'cms',
      instance: {
        connect: () => Promise.resolve(),
        close: () => Promise.resolve(),
      },
    }

    const { ClaudeAgentAdapter } = await import('./claude-agent-adapter')
    const adapter = new ClaudeAgentAdapter()

    for await (const _event of adapter.query({
      sessionId: 'session-streamed-prompt',
      prompt: streamedPrompt,
      cwd: '/tmp/workspace/session-streamed-prompt',
      sdkCliPath: '/tmp/claude.js',
      executable: { type: 'node', path: '/usr/bin/node' },
      executableArgs: [],
      env: {},
      sdkPermissionMode: 'default',
      allowDangerouslySkipPermissions: false,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: '' },
      mcpServers: {
        cms: runtimeCmsServer,
      },
    } as ClaudeAgentQueryOptions)) {
      // consume the async iterable so the mocked SDK query executes fully
    }

    expect(queryMock).toHaveBeenCalledTimes(1)
    const sdkCall = queryMock.mock.calls[0]?.[0] as { prompt: unknown; options: Record<string, unknown> }
    expect(sdkCall.prompt).toBe(streamedPrompt)
    expect(sdkCall.options.mcpServers).toEqual({
      cms: runtimeCmsServer,
    })
  })

  test('translates known sdk login errors into a friendly typed error while preserving the raw message', async () => {
    mock.module('@anthropic-ai/claude-agent-sdk', () => ({
      query: async function* () {
        yield {
          type: 'assistant',
          parent_tool_use_id: null,
          error: {
            message: 'Not logged in. Please run /login to authenticate.',
          },
          message: {
            content: [
              {
                type: 'text',
                text: 'Not logged in. Please run /login to authenticate.',
              },
            ],
          },
        }
      },
    }))

    const { ClaudeAgentAdapter } = await import('./claude-agent-adapter')
    const adapter = new ClaudeAgentAdapter()
    const events = []

    for await (const event of adapter.query({
      sessionId: 'session-login-error',
      prompt: 'Inspect auth',
      cwd: '/tmp/workspace/session-login-error',
      sdkCliPath: '/tmp/claude.js',
      executable: { type: 'node', path: '/usr/bin/node' },
      executableArgs: [],
      env: {},
      sdkPermissionMode: 'default',
      allowDangerouslySkipPermissions: false,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: '' },
    } as ClaudeAgentQueryOptions)) {
      events.push(event)
    }

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'typed_error',
      error: {
        message: LOGIN_CONFIGURATION_ERROR_MESSAGE,
        originalError: 'Not logged in. Please run /login to authenticate.',
      },
    })
  })

  test('does not attach a placeholder settings action to unknown typed errors', async () => {
    mock.module('@anthropic-ai/claude-agent-sdk', () => ({
      query: async function* () {
        yield {
          type: 'assistant',
          parent_tool_use_id: null,
          error: {
            message: 'Unexpected upstream failure',
          },
          message: {
            content: [
              {
                type: 'text',
                text: 'Unexpected upstream failure',
              },
            ],
          },
        }
      },
    }))

    const { ClaudeAgentAdapter } = await import('./claude-agent-adapter')
    const adapter = new ClaudeAgentAdapter()
    const events = []

    for await (const event of adapter.query({
      sessionId: 'session-unknown-error',
      prompt: 'Inspect upstream failure',
      cwd: '/tmp/workspace/session-unknown-error',
      sdkCliPath: '/tmp/claude.js',
      executable: { type: 'node', path: '/usr/bin/node' },
      executableArgs: [],
      env: {},
      sdkPermissionMode: 'default',
      allowDangerouslySkipPermissions: false,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: '' },
    } as ClaudeAgentQueryOptions)) {
      events.push(event)
    }

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'typed_error',
      error: {
        code: 'unknown_error',
        actions: [],
      },
    })
  })

  test('translates known sdk result errors into a friendly realtime error message', async () => {
    mock.module('@anthropic-ai/claude-agent-sdk', () => ({
      query: async function* () {
        yield {
          type: 'result',
          subtype: 'error',
          usage: {
            input_tokens: 10,
            output_tokens: 0,
          },
          errors: ['Not logged in. Please run /login to authenticate.'],
        }
      },
    }))

    const { ClaudeAgentAdapter } = await import('./claude-agent-adapter')
    const adapter = new ClaudeAgentAdapter()
    const events = []

    for await (const event of adapter.query({
      sessionId: 'session-result-error',
      prompt: 'Inspect auth',
      cwd: '/tmp/workspace/session-result-error',
      sdkCliPath: '/tmp/claude.js',
      executable: { type: 'node', path: '/usr/bin/node' },
      executableArgs: [],
      env: {},
      sdkPermissionMode: 'default',
      allowDangerouslySkipPermissions: false,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: '' },
    } as ClaudeAgentQueryOptions)) {
      events.push(event)
    }

    expect(events[0]).toEqual({
      type: 'error',
      message: LOGIN_CONFIGURATION_ERROR_MESSAGE,
    })
    expect(events[1]).toMatchObject({
      type: 'complete',
      usage: {
        inputTokens: 10,
        outputTokens: 0,
      },
    })
  })

  test('emits a visible status notice for auth_status messages', async () => {
    mock.module('@anthropic-ai/claude-agent-sdk', () => ({
      query: async function* () {
        yield {
          type: 'auth_status',
          isAuthenticating: true,
          output: ['Waiting for authentication'],
        }
        yield {
          type: 'result',
          subtype: 'success',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
          },
        }
      },
    }))

    const { ClaudeAgentAdapter } = await import('./claude-agent-adapter')
    const adapter = new ClaudeAgentAdapter()
    const events = []

    for await (const event of adapter.query({
      sessionId: 'session-auth-status',
      prompt: 'Inspect auth status',
      cwd: '/tmp/workspace/session-auth-status',
      sdkCliPath: '/tmp/claude.js',
      executable: { type: 'node', path: '/usr/bin/node' },
      executableArgs: [],
      env: {},
      sdkPermissionMode: 'default',
      allowDangerouslySkipPermissions: false,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: '' },
    } as ClaudeAgentQueryOptions)) {
      events.push(event)
    }

    expect(events).toContainEqual({
      type: 'status_notice',
      level: 'info',
      message: 'Waiting for authentication',
    })
  })

  test('does not surface internal hook system subtypes as visible status notices', async () => {
    mock.module('@anthropic-ai/claude-agent-sdk', () => ({
      query: async function* () {
        yield {
          type: 'system',
          subtype: 'hook_started',
        }
        yield {
          type: 'result',
          subtype: 'success',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
          },
        }
      },
    }))

    const { ClaudeAgentAdapter } = await import('./claude-agent-adapter')
    const adapter = new ClaudeAgentAdapter()
    const events = []

    for await (const event of adapter.query({
      sessionId: 'session-system-status',
      prompt: 'Inspect system status',
      cwd: '/tmp/workspace/session-system-status',
      sdkCliPath: '/tmp/claude.js',
      executable: { type: 'node', path: '/usr/bin/node' },
      executableArgs: [],
      env: {},
      sdkPermissionMode: 'default',
      allowDangerouslySkipPermissions: false,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: '' },
    } as ClaudeAgentQueryOptions)) {
      events.push(event)
    }

    expect(events.some((event) => (
      event.type === 'status_notice'
      && event.message.includes('hook_started')
    ))).toBe(false)
  })

  test('does not surface the normal system init event as a visible status notice', async () => {
    mock.module('@anthropic-ai/claude-agent-sdk', () => ({
      query: async function* () {
        yield {
          type: 'system',
          subtype: 'init',
          model: 'claude-sonnet-4-6',
        }
        yield {
          type: 'result',
          subtype: 'success',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
          },
        }
      },
    }))

    const { ClaudeAgentAdapter } = await import('./claude-agent-adapter')
    const adapter = new ClaudeAgentAdapter()
    const events = []

    for await (const event of adapter.query({
      sessionId: 'session-system-init',
      prompt: 'Inspect system init',
      cwd: '/tmp/workspace/session-system-init',
      sdkCliPath: '/tmp/claude.js',
      executable: { type: 'node', path: '/usr/bin/node' },
      executableArgs: [],
      env: {},
      sdkPermissionMode: 'default',
      allowDangerouslySkipPermissions: false,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: '' },
    } as ClaudeAgentQueryOptions)) {
      events.push(event)
    }

    expect(events).not.toContainEqual({
      type: 'status_notice',
      level: 'warning',
      message: '收到未处理的 SDK system 事件: init',
    })
  })

  test('emits a visible warning when rate limit status enters warning mode', async () => {
    mock.module('@anthropic-ai/claude-agent-sdk', () => ({
      query: async function* () {
        yield {
          type: 'rate_limit_event',
          rate_limit_info: {
            status: 'allowed_warning',
          },
        }
        yield {
          type: 'result',
          subtype: 'success',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
          },
        }
      },
    }))

    const { ClaudeAgentAdapter } = await import('./claude-agent-adapter')
    const adapter = new ClaudeAgentAdapter()
    const events = []

    for await (const event of adapter.query({
      sessionId: 'session-rate-limit-warning',
      prompt: 'Inspect rate limit warning',
      cwd: '/tmp/workspace/session-rate-limit-warning',
      sdkCliPath: '/tmp/claude.js',
      executable: { type: 'node', path: '/usr/bin/node' },
      executableArgs: [],
      env: {},
      sdkPermissionMode: 'default',
      allowDangerouslySkipPermissions: false,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: '' },
    } as ClaudeAgentQueryOptions)) {
      events.push(event)
    }

    expect(events).toContainEqual({
      type: 'status_notice',
      level: 'warning',
      message: '接近使用上限，请尽快完成当前操作。',
    })
  })

  test('keeps normal rate limit updates off the user-facing status area', async () => {
    mock.module('@anthropic-ai/claude-agent-sdk', () => ({
      query: async function* () {
        yield {
          type: 'rate_limit_event',
          rate_limit_info: {
            status: 'allowed',
          },
        }
        yield {
          type: 'result',
          subtype: 'success',
          usage: {
            input_tokens: 1,
            output_tokens: 1,
          },
        }
      },
    }))

    const { ClaudeAgentAdapter } = await import('./claude-agent-adapter')
    const adapter = new ClaudeAgentAdapter()
    const events = []

    for await (const event of adapter.query({
      sessionId: 'session-rate-limit-allowed',
      prompt: 'Inspect rate limit allowed',
      cwd: '/tmp/workspace/session-rate-limit-allowed',
      sdkCliPath: '/tmp/claude.js',
      executable: { type: 'node', path: '/usr/bin/node' },
      executableArgs: [],
      env: {},
      sdkPermissionMode: 'default',
      allowDangerouslySkipPermissions: false,
      systemPrompt: { type: 'preset', preset: 'claude_code', append: '' },
    } as ClaudeAgentQueryOptions)) {
      events.push(event)
    }

    expect(events.some((event) => event.type === 'status_notice')).toBe(false)
  })
})
