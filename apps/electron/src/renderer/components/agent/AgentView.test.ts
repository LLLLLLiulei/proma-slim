import { describe, expect, test } from 'bun:test'
import type { AgentMessage } from '@proma/shared'
import {
  appendMessageForSession,
  getMessagesForSession,
  replaceMessagesForSession,
  syncSessionMessages,
} from './AgentView'

function createMessage(id: string, role: AgentMessage['role'], content: string): AgentMessage {
  return {
    id,
    role,
    content,
    createdAt: 1,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('AgentView session-scoped message state', () => {
  test('keeps each session message list isolated inside the local message cache', () => {
    let state = new Map<string, AgentMessage[]>()

    state = appendMessageForSession(state, 'session-a', createMessage('a-1', 'user', 'A'))
    state = appendMessageForSession(state, 'session-b', createMessage('b-1', 'user', 'B'))

    expect(getMessagesForSession(state, 'session-a').map((message) => message.content)).toEqual(['A'])
    expect(getMessagesForSession(state, 'session-b').map((message) => message.content)).toEqual(['B'])
  })

  test('replacing one session history does not overwrite another in-progress session', () => {
    let state = new Map<string, AgentMessage[]>()

    state = appendMessageForSession(state, 'session-a', createMessage('a-1', 'user', 'A optimistic'))
    state = replaceMessagesForSession(state, 'session-b', [createMessage('b-1', 'user', 'B persisted')])

    expect(getMessagesForSession(state, 'session-a').map((message) => message.content)).toEqual(['A optimistic'])
    expect(getMessagesForSession(state, 'session-b').map((message) => message.content)).toEqual(['B persisted'])
  })

  test('syncSessionMessages emits persisted history immediately before tail catchup finishes', async () => {
    const firstBatch = [
      createMessage('u1', 'user', '几点了'),
      createMessage('a1', 'assistant', '19:49'),
      createMessage('u2', 'user', '天气怎么样'),
    ]
    const secondBatch = [
      ...firstBatch,
      createMessage('a2', 'assistant', '晴天'),
    ]
    const deferred = createDeferred<AgentMessage[]>()
    const seen: string[][] = []

    const syncPromise = syncSessionMessages(
      async () => firstBatch,
      (messages) => {
        seen.push(messages.map((message) => message.content))
      },
      {
        loadSessionMessagesWithCatchup: async () => deferred.promise,
      },
    )

    await Promise.resolve()

    expect(seen).toEqual([['几点了', '19:49', '天气怎么样']])

    deferred.resolve(secondBatch)
    await syncPromise

    expect(seen).toEqual([
      ['几点了', '19:49', '天气怎么样'],
      ['几点了', '19:49', '天气怎么样', '晴天'],
    ])
  })
})
