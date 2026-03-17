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
})
