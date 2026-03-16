import { afterEach, describe, expect, test } from 'bun:test'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createAgentSession, getAgentSessionMeta } from './lib/agent-session-manager'
import { createAgentStreamCallbacks, persistGeneratedSessionTitle } from './http-router'
import { sseManager } from './sse-manager'

const decoder = new TextDecoder()

afterEach(() => {
  rmSync(join(homedir(), '.proma'), { recursive: true, force: true })
})

describe('createAgentStreamCallbacks', () => {
  test('onError emits an error event and closes the SSE stream', async () => {
    const sessionId = 'session-error-close'
    const response = sseManager.createResponse(sessionId)
    const reader = response.body?.getReader()

    expect(reader).not.toBeNull()

    const connectedChunk = await reader!.read()
    expect(connectedChunk.done).toBe(false)
    expect(decoder.decode(connectedChunk.value)).toContain(': connected')

    const callbacks = createAgentStreamCallbacks(sessionId)
    callbacks.onError('missing api key')

    const errorChunk = await reader!.read()
    expect(errorChunk.done).toBe(false)

    const errorFrame = decoder.decode(errorChunk.value)
    expect(errorFrame).toContain('event: error')
    expect(errorFrame).toContain('"message":"missing api key"')

    const closedChunk = await reader!.read()
    expect(closedChunk.done).toBe(true)
  })
})

describe('persistGeneratedSessionTitle', () => {
  test('persists a generated title for default-titled sessions before streaming starts', async () => {
    const session = createAgentSession()

    await persistGeneratedSessionTitle(session.id, '只回复 TITLE_123456')

    expect(getAgentSessionMeta(session.id)?.title).toBe('只回复 TITLE_123456')
  })

  test('does not overwrite a customized session title', async () => {
    const session = createAgentSession('手动命名的会话')

    await persistGeneratedSessionTitle(session.id, '只回复 TITLE_654321')

    expect(getAgentSessionMeta(session.id)?.title).toBe('手动命名的会话')
  })
})
