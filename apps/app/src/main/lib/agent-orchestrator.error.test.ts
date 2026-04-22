import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { AgentEvent, AgentProviderAdapter, AgentQueryInput, TypedError } from '@proma/shared'
import { AgentEventBus } from './agent-event-bus'
import { AgentOrchestrator } from './agent-orchestrator'
import { createAgentSession, getAgentSessionMessages } from './agent-session-manager'
import { LOGIN_CONFIGURATION_ERROR_MESSAGE } from './agent-friendly-error'

class TypedErrorAdapter implements AgentProviderAdapter {
  constructor(private readonly error: TypedError) {}

  async *query(_input: AgentQueryInput): AsyncIterable<AgentEvent> {
    yield { type: 'typed_error', error: this.error }
  }

  abort(): void {}

  dispose(): void {}
}

class ThrowingAdapter implements AgentProviderAdapter {
  constructor(private readonly error: Error) {}

  async *query(_input: AgentQueryInput): AsyncIterable<AgentEvent> {
    throw this.error
  }

  abort(): void {}

  dispose(): void {}
}

class CompactRecoveryAdapter implements AgentProviderAdapter {
  readonly calls: Array<{
    prompt: string
    resumeSessionId?: string
    mcpServerNames?: string[]
  }> = []

  constructor(private readonly mode: 'catch' | 'typed_error') {}

  async *query(input: AgentQueryInput): AsyncIterable<AgentEvent> {
    const captured = input as AgentQueryInput & {
      prompt: string
      resumeSessionId?: string
      onSessionId?: (sessionId: string) => void
      mcpServers?: Record<string, unknown>
    }

    this.calls.push({
      prompt: captured.prompt,
      resumeSessionId: captured.resumeSessionId,
      mcpServerNames: captured.mcpServers ? Object.keys(captured.mcpServers) : undefined,
    })

    if (this.calls.length === 1) {
      captured.onSessionId?.('sdk-context-session')

      if (this.mode === 'typed_error') {
        yield {
          type: 'typed_error',
          error: {
            code: 'prompt_too_long',
            title: '上下文过长',
            message: '当前对话的上下文已超出模型限制，请压缩上下文或开启新会话',
            actions: [{ key: 'c', label: '压缩上下文', action: 'compact' }],
            canRetry: false,
            originalError: 'API Error: The model has reached its context window limit.',
          },
        }
        return
      }

      throw new Error('API Error: The model has reached its context window limit.')
    }

    if (captured.prompt === '/compact') {
      yield { type: 'compacting' }
      yield { type: 'compact_complete' }
      yield { type: 'complete' }
      return
    }

    yield { type: 'text_delta', text: '恢复后的回复' }
    yield { type: 'complete' }
  }

  abort(): void {}

  dispose(): void {}
}

describe('AgentOrchestrator friendly error handling', () => {
  let configDir: string
  let originalApiKey: string | undefined
  let originalBaseUrl: string | undefined

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-orchestrator-errors-'))
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

  test('keeps typed_error realtime content consistent with the persisted status message', async () => {
    const eventBus = new AgentEventBus()
    const emittedErrors: TypedError[] = []
    eventBus.on((_sessionId, event) => {
      if (event.type === 'typed_error') {
        emittedErrors.push(event.error)
      }
    })

    const adapter = new TypedErrorAdapter({
      code: 'unknown_error',
      title: '',
      message: LOGIN_CONFIGURATION_ERROR_MESSAGE,
      actions: [],
      canRetry: false,
      originalError: 'Not logged in. Please run /login to authenticate.',
    })
    const orchestrator = new AgentOrchestrator(adapter, eventBus)
    const session = createAgentSession('Friendly typed error session')

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: 'trigger typed error',
        channelId: '',
      },
      {
        onError: (message) => {
          throw new Error(`unexpected onError: ${message}`)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    const persistedStatus = getAgentSessionMessages(session.id).findLast((message) => message.role === 'status')

    expect(emittedErrors).toHaveLength(1)
    expect(emittedErrors[0]?.message).toBe(LOGIN_CONFIGURATION_ERROR_MESSAGE)
    expect(persistedStatus?.content).toBe(LOGIN_CONFIGURATION_ERROR_MESSAGE)
    expect(persistedStatus?.errorOriginal).toBe('Not logged in. Please run /login to authenticate.')
  })

  test('uses the same friendly message for catch-path realtime errors and persisted status messages', async () => {
    const adapter = new ThrowingAdapter(new Error('Not logged in. Please run /login to authenticate.'))
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const session = createAgentSession('Friendly thrown error session')
    const onErrorMessages: string[] = []

    await expect(orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: 'trigger catch error',
        channelId: '',
      },
      {
        onError: (message) => {
          onErrorMessages.push(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )).rejects.toThrow('Not logged in. Please run /login to authenticate.')

    const persistedStatus = getAgentSessionMessages(session.id).findLast((message) => message.role === 'status')

    expect(onErrorMessages).toEqual([LOGIN_CONFIGURATION_ERROR_MESSAGE])
    expect(persistedStatus?.content).toBe(LOGIN_CONFIGURATION_ERROR_MESSAGE)
    expect(persistedStatus?.errorDetails?.some((detail) => detail.includes('Not logged in. Please run /login to authenticate.'))).toBe(true)
    expect(persistedStatus?.errorOriginal).toContain('Not logged in. Please run /login to authenticate.')
  })

  test('auto-compacts and retries when a catch-path context-window-limit error is raised', async () => {
    const eventBus = new AgentEventBus()
    const emittedEventTypes: string[] = []
    eventBus.on((_sessionId, event) => {
      emittedEventTypes.push(event.type)
    })

    const adapter = new CompactRecoveryAdapter('catch')
    const orchestrator = new AgentOrchestrator(adapter, eventBus)
    const session = createAgentSession('Catch prompt too long session')
    const onErrorMessages: string[] = []

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请继续当前任务',
        channelId: '',
      },
      {
        onError: (message) => {
          onErrorMessages.push(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    const persistedMessages = getAgentSessionMessages(session.id)
    const persistedAssistant = persistedMessages.findLast((message) => message.role === 'assistant')
    const persistedStatus = persistedMessages.findLast((message) => message.role === 'status')

    expect(adapter.calls).toHaveLength(3)
    expect(adapter.calls[1]).toEqual({ prompt: '/compact', resumeSessionId: 'sdk-context-session' })
    expect(adapter.calls[2]?.prompt).not.toBe('/compact')
    expect(adapter.calls[2]?.resumeSessionId).toBe('sdk-context-session')
    expect(emittedEventTypes).toContain('compacting')
    expect(emittedEventTypes).toContain('compact_complete')
    expect(onErrorMessages).toEqual([])
    expect(persistedAssistant?.content).toBe('恢复后的回复')
    expect(persistedStatus).toBeUndefined()
  })

  test('auto-compacts and retries when the adapter emits a prompt_too_long typed error', async () => {
    const eventBus = new AgentEventBus()
    const emittedEventTypes: string[] = []
    eventBus.on((_sessionId, event) => {
      emittedEventTypes.push(event.type)
    })

    const adapter = new CompactRecoveryAdapter('typed_error')
    const orchestrator = new AgentOrchestrator(adapter, eventBus)
    const session = createAgentSession('Typed error prompt too long session')
    const onErrorMessages: string[] = []

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请继续当前任务',
        channelId: '',
      },
      {
        onError: (message) => {
          onErrorMessages.push(message)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    const persistedMessages = getAgentSessionMessages(session.id)
    const persistedAssistant = persistedMessages.findLast((message) => message.role === 'assistant')
    const persistedStatus = persistedMessages.findLast((message) => message.role === 'status')

    expect(adapter.calls).toHaveLength(3)
    expect(adapter.calls[1]).toEqual({ prompt: '/compact', resumeSessionId: 'sdk-context-session' })
    expect(adapter.calls[2]?.prompt).not.toBe('/compact')
    expect(adapter.calls[2]?.resumeSessionId).toBe('sdk-context-session')
    expect(emittedEventTypes).toContain('compacting')
    expect(emittedEventTypes).toContain('compact_complete')
    expect(onErrorMessages).toEqual([])
    expect(persistedAssistant?.content).toBe('恢复后的回复')
    expect(persistedStatus).toBeUndefined()
  })

  test('auto-compact recovery does not forward runtime sdk mcp servers into the nested compact query', async () => {
    const adapter = new CompactRecoveryAdapter('typed_error')
    const orchestrator = new AgentOrchestrator(adapter, new AgentEventBus())
    const session = createAgentSession('Compact recovery strips runtime sdk mcp servers')

    await orchestrator.sendMessage(
      {
        sessionId: session.id,
        userMessage: '请继续当前任务',
        channelId: '',
        customMcpServers: {
          cms: {
            type: 'sdk',
            name: 'cms',
            instance: {
              connect: async () => {},
              close: async () => {},
            },
          },
        },
      },
      {
        onError: (message) => {
          throw new Error(`unexpected onError: ${message}`)
        },
        onComplete: () => {},
        onTitleUpdated: () => {},
      },
    )

    expect(adapter.calls).toHaveLength(3)
    expect(adapter.calls[0]?.mcpServerNames).toEqual(['cms'])
    expect(adapter.calls[1]?.prompt).toBe('/compact')
    expect(adapter.calls[1]?.mcpServerNames).toBeUndefined()
    expect(adapter.calls[2]?.mcpServerNames).toEqual(['cms'])
  })
})
