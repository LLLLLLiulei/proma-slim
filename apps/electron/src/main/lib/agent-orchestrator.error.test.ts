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
    expect(persistedStatus?.errorOriginal).toContain('Not logged in. Please run /login to authenticate.')
  })
})
