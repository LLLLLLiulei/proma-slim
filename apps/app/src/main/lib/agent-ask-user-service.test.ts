import { afterEach, describe, expect, test } from 'bun:test'
import { AgentAskUserService } from './agent-ask-user-service'

const originalSetTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout

afterEach(() => {
  globalThis.setTimeout = originalSetTimeout
  globalThis.clearTimeout = originalClearTimeout
})

describe('AgentAskUserService', () => {
  test('does not register a timeout when askUserTimeoutMs is 0', async () => {
    let setTimeoutCalls = 0

    globalThis.setTimeout = (((_handler: TimerHandler, _timeout?: number) => {
      setTimeoutCalls += 1
      return 0 as unknown as ReturnType<typeof setTimeout>
    }) as unknown as typeof setTimeout)
    globalThis.clearTimeout = (((_id?: ReturnType<typeof setTimeout>) => {}) as unknown as typeof clearTimeout)

    const service = new AgentAskUserService(() => 0)
    const abortController = new AbortController()
    let capturedRequestId: string | null = null

    const pending = service.handleAskUserQuestion(
      'session-1',
      {
        questions: [{
          header: '风格',
          question: '你想要什么风格？',
          options: [{ label: '极简' }],
        }],
      },
      abortController.signal,
      (request) => {
        capturedRequestId = request.requestId
      },
    )

    expect(setTimeoutCalls).toBe(0)
    expect(capturedRequestId).toBeTruthy()

    const sessionId = service.respondToAskUser(capturedRequestId!, { 0: '极简' })
    const result = await pending

    expect(sessionId).toBe('session-1')
    expect(result).toEqual({
      behavior: 'allow',
      updatedInput: {
        questions: [{
          header: '风格',
          question: '你想要什么风格？',
          options: [{ label: '极简' }],
        }],
        answers: { 0: '极简' },
      },
    })
  })

  test('registers a timeout when askUserTimeoutMs is a positive number', async () => {
    let capturedTimeoutMs: number | undefined
    let timeoutHandler: (() => void) | null = null

    globalThis.setTimeout = (((handler: TimerHandler, timeout?: number) => {
      capturedTimeoutMs = timeout
      timeoutHandler = handler as () => void
      return 1 as unknown as ReturnType<typeof setTimeout>
    }) as unknown as typeof setTimeout)
    globalThis.clearTimeout = (((_id?: ReturnType<typeof setTimeout>) => {}) as unknown as typeof clearTimeout)

    const service = new AgentAskUserService(() => 1500)
    const abortController = new AbortController()

    const pending = service.handleAskUserQuestion(
      'session-2',
      {
        questions: [{
          header: '配色',
          question: '你想要什么颜色？',
          options: [{ label: '蓝色' }],
        }],
      },
      abortController.signal,
      () => {},
    )

    expect(capturedTimeoutMs).toBe(1500)
    expect(timeoutHandler).toBeTruthy()

    const fireTimeout = timeoutHandler as unknown as () => void
    fireTimeout()
    const result = await pending

    expect(result).toEqual({
      behavior: 'deny',
      message: 'AskUser 请求超时，已自动结束',
    })
  })
})
