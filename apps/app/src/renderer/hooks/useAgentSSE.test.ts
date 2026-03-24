import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { Provider, createStore } from 'jotai'
import { act, create } from 'react-test-renderer'
import {
  agentMessageRefreshAtom,
  agentSessionsAtom,
  agentStreamErrorsAtom,
  agentStreamingStatesAtom,
  allPendingAskUserRequestsAtom,
  allPendingPermissionRequestsAtom,
} from '../atoms/agent-atoms'
import { api } from '@/lib/api'
import { useAgentSSE } from './useAgentSSE'

const originalSendMessage = api.sendMessage
const originalStopSession = api.stopSession

afterEach(() => {
  mock.restore()
  api.sendMessage = originalSendMessage
  api.stopSession = originalStopSession
})

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}

function createHookHarness() {
  const store = createStore()
  let controls: ReturnType<typeof useAgentSSE> | null = null

  function Probe() {
    controls = useAgentSSE()
    return null
  }

  let renderer: ReturnType<typeof create>
  act(() => {
    renderer = create(
      React.createElement(
        Provider,
        { store },
        React.createElement(Probe),
      ),
    )
  })

  return {
    store,
    get controls() {
      if (!controls) {
        throw new Error('hook controls unavailable')
      }
      return controls
    },
    unmount() {
      act(() => {
        renderer.unmount()
      })
    },
  }
}

describe('useAgentSSE helpers', () => {
  test('extractSSEFrames rebuilds complete frames and leaves the trailing partial chunk', async () => {
    const { extractSSEFrames } = await import('./useAgentSSE')

    const parsed = extractSSEFrames([
      ': connected',
      '',
      'event: text_delta',
      'data: {"sessionId":"session-1","event":{"type":"text_delta","text":"hel"}}',
      '',
      'event: text_delta',
      'data: {"sessionId":"session-1","event":{"type":"text_delta","text":"lo"}}',
      '',
      'event: title_upd',
    ].join('\n'))

    expect(parsed.frames).toEqual([
      {
        event: 'text_delta',
        data: '{"sessionId":"session-1","event":{"type":"text_delta","text":"hel"}}',
      },
      {
        event: 'text_delta',
        data: '{"sessionId":"session-1","event":{"type":"text_delta","text":"lo"}}',
      },
    ])
    expect(parsed.remainder).toBe('event: title_upd')
  })

  test('applyStreamFrame routes agent, permission, ask-user, title, and error payloads into atoms', async () => {
    const { applyStreamFrame } = await import('./useAgentSSE')
    const store = createStore()

    store.set(agentSessionsAtom, [{
      id: 'session-1',
      title: 'Original title',
      createdAt: 1,
      updatedAt: 1,
    }])

    applyStreamFrame(store, {
      event: 'text_delta',
      data: {
        sessionId: 'session-1',
        event: { type: 'text_delta', text: 'hello' },
      },
    })

    applyStreamFrame(store, {
      event: 'permission_request',
      data: {
        sessionId: 'session-1',
        event: {
          type: 'permission_request',
          request: {
            requestId: 'perm-1',
            sessionId: 'session-1',
            toolName: 'Bash',
            toolInput: { cmd: 'ls' },
            description: 'run ls',
            dangerLevel: 'normal',
          },
        },
      },
    })

    applyStreamFrame(store, {
      event: 'ask_user_request',
      data: {
        sessionId: 'session-1',
        event: {
          type: 'ask_user_request',
          request: {
            requestId: 'ask-1',
            sessionId: 'session-1',
            toolInput: {},
            questions: [
              {
                question: 'Continue?',
                options: [{ label: 'Yes' }],
              },
            ],
          },
        },
      },
    })

    applyStreamFrame(store, {
      event: 'title_updated',
      data: {
        sessionId: 'session-1',
        title: 'Updated title',
      },
    })

    applyStreamFrame(store, {
      event: 'error',
      data: {
        sessionId: 'session-1',
        event: { type: 'error', message: 'stream failed' },
      },
    })

    expect(store.get(agentStreamingStatesAtom).get('session-1')?.content).toBe('hello')
    expect(store.get(allPendingPermissionRequestsAtom).get('session-1')).toHaveLength(1)
    expect(store.get(allPendingAskUserRequestsAtom).get('session-1')).toHaveLength(1)
    expect(store.get(agentSessionsAtom)[0]?.title).toBe('Updated title')
    expect(store.get(agentStreamErrorsAtom).get('session-1')).toBe('stream failed')
  })

  test('ensureStreamingState can reset stale streaming content before a new request starts', async () => {
    const sseModule = await import('./useAgentSSE') as Record<string, unknown>
    expect(typeof sseModule.ensureStreamingState).toBe('function')

    const ensureStreamingState = sseModule.ensureStreamingState as (
      store: ReturnType<typeof createStore>,
      sessionId: string,
      options?: { reset?: boolean },
    ) => void

    const store = createStore()

    store.set(agentStreamingStatesAtom, new Map([
      ['session-1', {
        running: false,
        content: 'stale assistant reply',
        toolActivities: [{
          toolUseId: 'tool-1',
          toolName: 'Bash',
          input: { cmd: 'pwd' },
          done: false,
        }],
        teammates: [{
          taskId: 'task-1',
          description: 'stale teammate',
          index: 1,
          status: 'running',
          toolHistory: [],
          startedAt: 1,
        }],
        startedAt: 1,
      }],
    ]))

    ensureStreamingState(store, 'session-1', { reset: true })

    expect(store.get(agentStreamingStatesAtom).get('session-1')).toMatchObject({
      running: true,
      content: '',
      toolActivities: [],
      teammates: [],
    })
    expect(store.get(agentStreamingStatesAtom).get('session-1')?.startedAt).not.toBe(1)
  })

  test('finalizeStream stops the session, refreshes messages, and records disconnect errors', async () => {
    const { finalizeStream } = await import('./useAgentSSE')
    const store = createStore()

    store.set(agentStreamingStatesAtom, new Map([
      ['session-1', {
        running: true,
        content: 'partial answer',
        toolActivities: [],
        teammates: [],
        startedAt: 1,
      }],
    ]))

    finalizeStream(store, 'session-1', { error: '连接已断开' })

    expect(store.get(agentStreamingStatesAtom).get('session-1')?.running).toBe(false)
    expect(store.get(agentStreamErrorsAtom).get('session-1')).toBe('连接已断开')
    expect(store.get(agentMessageRefreshAtom).get('session-1')).toBe(1)
  })

  test('stopSession does not finalize local stream state when stop API fails', async () => {
    const stopSessionMock = mock(async () => {
      throw new Error('stop failed')
    })
    api.stopSession = stopSessionMock

    const harness = createHookHarness()
    harness.store.set(agentStreamingStatesAtom, new Map([
      ['session-1', {
        running: true,
        content: 'partial answer',
        toolActivities: [],
        teammates: [],
        startedAt: 1,
      }],
    ]))

    await expect(harness.controls.stopSession('session-1')).rejects.toThrow('stop failed')

    expect(harness.store.get(agentStreamingStatesAtom).get('session-1')?.running).toBe(true)
    expect(harness.store.get(agentMessageRefreshAtom).get('session-1')).toBeUndefined()
  })

  test('unmount abort only detaches the local stream and does not finalize or record an error', async () => {
    const pendingResponse = createDeferred<Response>()
    const sendMessageMock = mock((_sessionId: string, _payload: unknown, init?: Pick<RequestInit, 'signal'>) => {
      init?.signal?.addEventListener('abort', () => {
        pendingResponse.reject(createAbortError())
      }, { once: true })
      return pendingResponse.promise
    })
    api.sendMessage = sendMessageMock

    const harness = createHookHarness()
    const sendPromise = harness.controls.sendMessage('session-1', { userMessage: 'hello' })

    expect(harness.store.get(agentStreamingStatesAtom).get('session-1')?.running).toBe(true)

    harness.unmount()
    await sendPromise

    expect(harness.store.get(agentStreamingStatesAtom).get('session-1')?.running).toBe(true)
    expect(harness.store.get(agentStreamErrorsAtom).get('session-1')).toBeUndefined()
    expect(harness.store.get(agentMessageRefreshAtom).get('session-1')).toBeUndefined()
  })
})
