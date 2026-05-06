import { describe, expect, test } from 'bun:test'
import type { AgentMessage } from '@ai-page-builder/shared'
import { loadSessionMessagesWithCatchup } from './message-catchup'

function createMessage(id: string, role: AgentMessage['role'], content: string): AgentMessage {
  return {
    id,
    role,
    content,
    createdAt: Date.now(),
  }
}

describe('loadSessionMessagesWithCatchup', () => {
  test('polls again when initial history still ends with a user message', async () => {
    const firstBatch: AgentMessage[] = [
      createMessage('u1', 'user', 'first'),
      createMessage('a1', 'assistant', 'first reply'),
      createMessage('u2', 'user', 'second'),
    ]
    const secondBatch: AgentMessage[] = [
      ...firstBatch,
      createMessage('a2', 'assistant', 'second reply'),
    ]

    let callCount = 0
    const result = await loadSessionMessagesWithCatchup(
      async () => {
        callCount++
        return callCount === 1 ? firstBatch : secondBatch
      },
      {
        maxAttempts: 3,
        retryDelayMs: 0,
        wait: async () => {},
      },
    )

    expect(callCount).toBe(2)
    expect(result).toEqual(secondBatch)
  })

  test('does not poll again when initial history already ends with assistant', async () => {
    const batch: AgentMessage[] = [
      createMessage('u1', 'user', 'hello'),
      createMessage('a1', 'assistant', 'world'),
    ]

    let callCount = 0
    const result = await loadSessionMessagesWithCatchup(
      async () => {
        callCount++
        return batch
      },
      {
        maxAttempts: 3,
        retryDelayMs: 0,
        wait: async () => {},
      },
    )

    expect(callCount).toBe(1)
    expect(result).toEqual(batch)
  })

  test('continues catchup from provided initial messages without reloading the first batch again', async () => {
    const firstBatch: AgentMessage[] = [
      createMessage('u1', 'user', 'first'),
      createMessage('a1', 'assistant', 'first reply'),
      createMessage('u2', 'user', 'second'),
    ]
    const secondBatch: AgentMessage[] = [
      ...firstBatch,
      createMessage('a2', 'assistant', 'second reply'),
    ]

    let callCount = 0
    const result = await loadSessionMessagesWithCatchup(
      async () => {
        callCount++
        return secondBatch
      },
      {
        initialMessages: firstBatch,
        maxAttempts: 3,
        retryDelayMs: 0,
        wait: async () => {},
      },
    )

    expect(callCount).toBe(1)
    expect(result).toEqual(secondBatch)
  })
})
