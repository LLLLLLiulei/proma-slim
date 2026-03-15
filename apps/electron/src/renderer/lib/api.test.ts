import { afterEach, describe, expect, mock, test } from 'bun:test'

const originalFetch = globalThis.fetch

function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers ?? {}),
    },
    ...init,
  })
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('renderer api wrappers', () => {
  test('getStatus requests /api/status and parses the JSON payload', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/status')
      expect(init?.method).toBeUndefined()
      return jsonResponse({ ok: true, apiKeyConfigured: true, sdkCliAvailable: true })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const status = await api.getStatus()

    expect(status).toEqual({ ok: true, apiKeyConfigured: true, sdkCliAvailable: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('updateSessionTitle PATCHes the session title endpoint', async () => {
    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/sessions/session-1')
      expect(init?.method).toBe('PATCH')
      expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
      expect(JSON.parse(String(init?.body))).toEqual({ title: 'Renamed session' })
      return jsonResponse({
        id: 'session-1',
        title: 'Renamed session',
        createdAt: 1,
        updatedAt: 2,
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const session = await api.updateSessionTitle('session-1', 'Renamed session')

    expect(session.title).toBe('Renamed session')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('sendMessage opens the POST SSE endpoint without consuming the stream', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close()
      },
    })

    const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/sessions/session-1/send')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({ userMessage: 'Hello from the browser' })
      return new Response(stream, {
        status: 200,
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
        },
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { api } = await import('./api')
    const response = await api.sendMessage('session-1', { userMessage: 'Hello from the browser' })

    expect(response.body).not.toBeNull()
    expect(response.headers.get('content-type')).toContain('text/event-stream')
  })
})
