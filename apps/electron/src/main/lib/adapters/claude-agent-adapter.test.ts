import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { ClaudeAgentQueryOptions } from './claude-agent-adapter'

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
})
