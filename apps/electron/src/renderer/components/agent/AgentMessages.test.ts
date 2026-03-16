import { describe, expect, test } from 'bun:test'
import { shouldRenderTransientAssistantMessage } from './AgentMessages'
import type { AgentMessage } from '@proma/shared'

describe('AgentMessages transient assistant rendering', () => {
  test('suppresses duplicate completed assistant content once persisted messages catch up', () => {
    const messages: AgentMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '如果你在生气，可以直接说要我改什么。',
        createdAt: Date.now(),
      },
    ]

    expect(shouldRenderTransientAssistantMessage({
      messages,
      streaming: false,
      streamingContent: '',
      smoothContent: '如果你在生气，可以直接说要我改什么。',
      toolActivities: [],
      retrying: undefined,
    })).toBe(false)
  })

  test('keeps transient assistant message while streaming is still active', () => {
    const messages: AgentMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '如果你在生气，可以直接说要我改什么。',
        createdAt: Date.now(),
      },
    ]

    expect(shouldRenderTransientAssistantMessage({
      messages,
      streaming: true,
      streamingContent: '如果你在生气，可以直接说要我改什么。',
      smoothContent: '如果你在生气，可以直接说要我改什么。',
      toolActivities: [],
      retrying: undefined,
    })).toBe(true)
  })

  test('does not reuse stale smooth content when a new stream has started but no new text arrived yet', () => {
    const messages: AgentMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '上一轮回复',
        createdAt: Date.now(),
      },
    ]

    expect(shouldRenderTransientAssistantMessage({
      messages,
      streaming: true,
      streamingContent: '',
      smoothContent: '上一轮回复',
      toolActivities: [],
      retrying: undefined,
    })).toBe(false)
  })
})
