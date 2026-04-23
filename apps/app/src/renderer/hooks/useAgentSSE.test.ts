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
const originalGetSessionActivity = api.getSessionActivity
const originalStopSession = api.stopSession

afterEach(() => {
  mock.restore()
  api.sendMessage = originalSendMessage
  api.getSessionActivity = originalGetSessionActivity
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

interface TestStreamController {
  enqueue(chunk: Uint8Array): void
  close(): void
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

  test('applyStreamFrame derives compact lifecycle state from compacting events and clears it when resumed output arrives', async () => {
    const { applyStreamFrame } = await import('./useAgentSSE')
    const store = createStore()

    applyStreamFrame(store, {
      event: 'compacting',
      data: {
        sessionId: 'session-1',
        event: { type: 'compacting' },
      },
    })

    let state = store.get(agentStreamingStatesAtom).get('session-1') as (typeof store extends never ? never : {
      isCompacting?: boolean
      compactNotice?: { kind: string; level: string; message: string }
      content?: string
    }) | undefined

    expect(state?.isCompacting).toBe(true)
    expect(state?.compactNotice).toEqual({
      kind: 'compact',
      level: 'info',
      message: '正在压缩上下文，请稍候…',
    })

    applyStreamFrame(store, {
      event: 'compact_complete',
      data: {
        sessionId: 'session-1',
        event: { type: 'compact_complete' },
      },
    })

    state = store.get(agentStreamingStatesAtom).get('session-1') as typeof state
    expect(state?.isCompacting).toBe(false)
    expect(state?.compactNotice?.message).toBe('已压缩，继续处理中')

    applyStreamFrame(store, {
      event: 'text_delta',
      data: {
        sessionId: 'session-1',
        event: { type: 'text_delta', text: '恢复后的回复' },
      },
    })

    state = store.get(agentStreamingStatesAtom).get('session-1') as typeof state
    expect(state?.content).toBe('恢复后的回复')
    expect(state?.compactNotice).toBeUndefined()
  })

  test('applyStreamFrame keeps regular status notices separate from locally derived compact notices', async () => {
    const { applyStreamFrame } = await import('./useAgentSSE')
    const store = createStore()

    applyStreamFrame(store, {
      event: 'status_notice',
      data: {
        sessionId: 'session-1',
        event: {
          type: 'status_notice',
          level: 'warning',
          message: '接近使用上限，请尽快完成当前操作。',
        },
      },
    })

    let state = store.get(agentStreamingStatesAtom).get('session-1') as (typeof store extends never ? never : {
      statusNotice?: { message: string }
      compactNotice?: { message: string }
    }) | undefined

    expect(state?.statusNotice?.message).toBe('接近使用上限，请尽快完成当前操作。')
    expect(state?.compactNotice).toBeUndefined()

    applyStreamFrame(store, {
      event: 'compact_complete',
      data: {
        sessionId: 'session-1',
        event: { type: 'compact_complete' },
      },
    })

    state = store.get(agentStreamingStatesAtom).get('session-1') as typeof state
    expect(state?.statusNotice).toBeUndefined()
    expect(state?.compactNotice?.message).toBe('已压缩，继续处理中')
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

  test('reconcileSessionStreaming clears a stale local stream after the backend reports the session is idle', async () => {
    const pendingResponse = createDeferred<Response>()
    const sendMessageMock = mock((_sessionId: string, _payload: unknown, init?: Pick<RequestInit, 'signal'>) => {
      init?.signal?.addEventListener('abort', () => {
        pendingResponse.reject(createAbortError())
      }, { once: true })
      return pendingResponse.promise
    })
    const getSessionActivityMock = mock(async (_sessionId: string) => ({ active: false }))
    api.sendMessage = sendMessageMock
    api.getSessionActivity = getSessionActivityMock

    const harness = createHookHarness()
    const sendPromise = harness.controls.sendMessage('session-1', { userMessage: 'hello' })

    expect(harness.store.get(agentStreamingStatesAtom).get('session-1')?.running).toBe(true)

    await expect(harness.controls.reconcileSessionStreaming('session-1')).resolves.toBe(false)
    await sendPromise

    expect(getSessionActivityMock).toHaveBeenCalledWith('session-1')
    expect(harness.store.get(agentStreamingStatesAtom).get('session-1')?.running).toBe(false)
    expect(harness.store.get(agentStreamErrorsAtom).get('session-1')).toBeUndefined()
    expect(harness.store.get(agentMessageRefreshAtom).get('session-1')).toBe(1)
  })

  test('reconcileSessionStreaming deduplicates concurrent passive probes for the same session', async () => {
    const getSessionActivityDeferred = createDeferred<{ active: boolean }>()
    const getSessionActivityMock = mock(async (_sessionId: string) => getSessionActivityDeferred.promise)
    api.getSessionActivity = getSessionActivityMock

    const harness = createHookHarness()
    harness.store.set(agentStreamingStatesAtom, new Map([
      ['session-1', {
        running: true,
        content: '',
        toolActivities: [],
        teammates: [],
        startedAt: 1,
      }],
    ]))

    const probeA = harness.controls.reconcileSessionStreaming('session-1', { passive: true })
    const probeB = harness.controls.reconcileSessionStreaming('session-1', { passive: true })

    getSessionActivityDeferred.resolve({ active: true })

    await expect(probeA).resolves.toBe(true)
    await expect(probeB).resolves.toBe(true)
    expect(getSessionActivityMock).toHaveBeenCalledTimes(1)
  })

  test('reconcileSessionStreaming throttles back-to-back passive probes within the cooldown window', async () => {
    const getSessionActivityMock = mock(async (_sessionId: string) => ({ active: true }))
    api.getSessionActivity = getSessionActivityMock

    const harness = createHookHarness()
    harness.store.set(agentStreamingStatesAtom, new Map([
      ['session-1', {
        running: true,
        content: '',
        toolActivities: [],
        teammates: [],
        startedAt: 1,
      }],
    ]))

    await expect(harness.controls.reconcileSessionStreaming('session-1', { passive: true })).resolves.toBe(true)
    await expect(harness.controls.reconcileSessionStreaming('session-1', { passive: true })).resolves.toBe(true)

    expect(getSessionActivityMock).toHaveBeenCalledTimes(1)
  })

  test('reconcileSessionStreaming restores a local busy state after refresh when the backend still reports the session active', async () => {
    const getSessionActivityMock = mock(async (_sessionId: string) => ({ active: true }))
    api.getSessionActivity = getSessionActivityMock

    const harness = createHookHarness()

    await expect(harness.controls.reconcileSessionStreaming(
      'session-1',
      {
        passive: true,
        recoverIfActive: true,
        reason: 'message-reload-last-user',
        source: 'agent-view',
      } as unknown as Parameters<typeof harness.controls.reconcileSessionStreaming>[1],
    )).resolves.toBe(true)

    const restoredState = harness.store.get(agentStreamingStatesAtom).get('session-1')
    expect(restoredState?.running).toBe(true)
    expect(restoredState?.content).toBe('')
    expect(restoredState?.lastActivityAt).toBeDefined()
    expect(harness.store.get(agentStreamErrorsAtom).get('session-1')).toBeUndefined()
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

  test('sendMessage resolves after the SSE stream is established and continues consuming frames in the background', async () => {
    const encoder = new TextEncoder()
    let streamController: TestStreamController | null = null
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller as unknown as TestStreamController
      },
    }))

    const sendMessageMock = mock(async () => response)
    api.sendMessage = sendMessageMock

    const harness = createHookHarness()

    await harness.controls.sendMessage('session-1', { userMessage: 'hello' })

    expect(harness.store.get(agentStreamingStatesAtom).get('session-1')?.running).toBe(true)
    expect(harness.store.get(agentMessageRefreshAtom).get('session-1')).toBeUndefined()

    if (!streamController) {
      throw new Error('stream controller unavailable')
    }

    const activeStreamController = streamController as TestStreamController

    activeStreamController.enqueue(encoder.encode([
      'event: text_delta',
      'data: {"sessionId":"session-1","event":{"type":"text_delta","text":"你好"}}',
      '',
      '',
    ].join('\n')))
    activeStreamController.close()

    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(harness.store.get(agentStreamingStatesAtom).get('session-1')?.content).toBe('你好')
    expect(harness.store.get(agentStreamingStatesAtom).get('session-1')?.running).toBe(false)
    expect(harness.store.get(agentMessageRefreshAtom).get('session-1')).toBe(1)
  })

  test('sendMessage rethrows request-start failures so callers can preserve composer state', async () => {
    const sendMessageMock = mock(async () => {
      throw new Error('payload rejected')
    })
    api.sendMessage = sendMessageMock

    const harness = createHookHarness()

    await expect(harness.controls.sendMessage('session-1', { userMessage: 'hello' })).rejects.toThrow('payload rejected')

    expect(harness.store.get(agentStreamingStatesAtom).get('session-1')?.running).toBe(false)
    expect(harness.store.get(agentStreamErrorsAtom).get('session-1')).toBe('payload rejected')
  })
})
