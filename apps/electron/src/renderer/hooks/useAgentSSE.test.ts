import { describe, expect, test } from 'bun:test'
import { createStore } from 'jotai'
import {
  agentMessageRefreshAtom,
  agentSessionsAtom,
  agentStreamErrorsAtom,
  agentStreamingStatesAtom,
  allPendingAskUserRequestsAtom,
  allPendingPermissionRequestsAtom,
} from '../atoms/agent-atoms'

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
})
