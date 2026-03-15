import { describe, expect, test } from 'bun:test'
import { createAgentStreamCallbacks } from './http-router'
import { sseManager } from './sse-manager'

const decoder = new TextDecoder()

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
