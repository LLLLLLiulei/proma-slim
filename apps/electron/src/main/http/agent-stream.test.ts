import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { AgentSendInput } from '@proma/shared'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createAgentSession, getAgentSessionMeta } from '../lib/agent-session-manager'
import { sseManager } from '../sse-manager'
import { createAgentStreamCallbacks, createSendResponse, persistGeneratedSessionTitle } from './agent-stream'

const decoder = new TextDecoder()

afterEach(() => {
  mock.restore()
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

describe('SSEManager lifecycle', () => {
  test('canceling one reader does not close other SSE connections for the same session', async () => {
    const sessionId = 'session-shared-connections'
    const responseA = sseManager.createResponse(sessionId)
    const responseB = sseManager.createResponse(sessionId)
    const readerA = responseA.body?.getReader()
    const readerB = responseB.body?.getReader()

    expect(readerA).not.toBeNull()
    expect(readerB).not.toBeNull()

    await readerA!.read()
    await readerB!.read()

    await readerA!.cancel()

    expect(sseManager.hasSession(sessionId)).toBe(true)

    sseManager.emitAgentEvent(sessionId, { type: 'text_delta', text: 'still connected' })

    const nextChunk = await readerB!.read()
    expect(nextChunk.done).toBe(false)
    expect(decoder.decode(nextChunk.value)).toContain('event: text_delta')
    expect(decoder.decode(nextChunk.value)).toContain('"text":"still connected"')

    sseManager.closeSession(sessionId)
  })
})

describe('persistGeneratedSessionTitle', () => {
  test('persists a generated title for default-titled sessions before streaming starts', async () => {
    const session = createAgentSession()

    await persistGeneratedSessionTitle(session.id, '只回复 TITLE_123456', {
      generateTitle: mock(async () => '只回复 TITLE_123456'),
    })

    expect(getAgentSessionMeta(session.id)?.title).toBe('只回复 TITLE_123456')
  })

  test('does not overwrite a customized session title', async () => {
    const session = createAgentSession('手动命名的会话')

    await persistGeneratedSessionTitle(session.id, '只回复 TITLE_654321', {
      generateTitle: mock(async () => '只回复 TITLE_654321'),
    })

    expect(getAgentSessionMeta(session.id)?.title).toBe('手动命名的会话')
  })
})

describe('createSendResponse', () => {
  test('returns 409 when the session is already active', async () => {
    const runAgent = mock(async () => {})

    const response = await createSendResponse('session-1', { userMessage: 'Hello' }, {
      isAgentSessionActive: () => true,
      runAgent,
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: '上一条消息仍在处理中，请稍候再试',
    })
    expect(runAgent).not.toHaveBeenCalled()
  })

  test('returns 400 when userMessage is blank', async () => {
    await expect(createSendResponse('session-1', { userMessage: '   ' })).rejects.toThrow('消息内容不能为空')
  })

  test('creates an event-stream response and dispatches the agent run when idle', async () => {
    const runAgent = mock(async (_input: AgentSendInput) => {})

    const response = await createSendResponse('session-1', { userMessage: 'Hello from browser' }, {
      isAgentSessionActive: () => false,
      runAgent,
      generateTitle: mock(async () => null),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(runAgent).toHaveBeenCalledTimes(1)
    expect(runAgent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: 'session-1',
      userMessage: 'Hello from browser',
      channelId: '',
    })

    const reader = response.body?.getReader()
    expect(reader).not.toBeNull()

    const connectedChunk = await reader!.read()
    expect(connectedChunk.done).toBe(false)
    expect(decoder.decode(connectedChunk.value)).toContain(': connected')

    sseManager.closeSession('session-1')
  })

  test('disconnecting the response does not implicitly stop the running agent', async () => {
    const stopAgent = mock(() => {})
    let active = false
    const runAgent = mock(async (_input: AgentSendInput) => {
      await new Promise(() => {})
    })

    const response = await createSendResponse('session-implicit-stop', { userMessage: 'keep running' }, {
      isAgentSessionActive: () => active,
      runAgent,
      stopAgent,
      generateTitle: mock(async () => null),
    })

    const reader = response.body?.getReader()
    expect(reader).not.toBeNull()

    await reader!.read()
    active = true
    await reader!.cancel()

    expect(stopAgent).not.toHaveBeenCalled()
    expect(runAgent).toHaveBeenCalledTimes(1)
  })
})
