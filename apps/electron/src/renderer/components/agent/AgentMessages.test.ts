import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgentMessages, shouldRenderTransientAssistantMessage } from './AgentMessages'
import type { AgentMessage } from '@proma/shared'
import type { AgentStreamState } from '@/atoms/agent-atoms'

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

function createCompletedToolStreamState(content: string): AgentStreamState {
  return {
    running: false,
    content,
    model: 'claude-sonnet-4-6',
    startedAt: 1,
    teammates: [],
    toolActivities: [
      {
        toolUseId: 'tool-create',
        toolName: 'TaskCreate',
        input: { title: '测试 TodoList 工具' },
        result: '创建成功',
        done: true,
      },
      {
        toolUseId: 'tool-list',
        toolName: 'TaskList',
        input: {},
        result: '#1 [pending] 测试 TodoList 工具',
        done: true,
      },
    ],
  }
}

function createAssistantMessageWithToolEvents(content: string, includeEvents: boolean): AgentMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content,
    createdAt: 1,
    model: 'claude-sonnet-4-6',
    ...(includeEvents && {
      events: [
        {
          type: 'tool_start' as const,
          toolName: 'TaskCreate',
          toolUseId: 'tool-create',
          input: { title: '测试 TodoList 工具' },
        },
        {
          type: 'tool_result' as const,
          toolUseId: 'tool-create',
          toolName: 'TaskCreate',
          result: '创建成功',
          isError: false,
        },
        {
          type: 'tool_start' as const,
          toolName: 'TaskList',
          toolUseId: 'tool-list',
          input: {},
        },
        {
          type: 'tool_result' as const,
          toolUseId: 'tool-list',
          toolName: 'TaskList',
          result: '#1 [pending] 测试 TodoList 工具',
          isError: false,
        },
      ],
    }),
  }
}

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

  test('does not render a duplicate transient tool block after the persisted assistant message already contains the same tool events', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-tools',
        messages: [createAssistantMessageWithToolEvents('已帮你测试。', true)],
        streaming: false,
        streamState: createCompletedToolStreamState('已帮你测试。'),
      })
    )

    expect(countOccurrences(markup, 'TaskCreate')).toBe(1)
    expect(countOccurrences(markup, 'TaskList')).toBe(1)
  })

  test('keeps the transient tool block visible until the persisted assistant message catches up with tool events', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-tools',
        messages: [createAssistantMessageWithToolEvents('已帮你测试。', false)],
        streaming: false,
        streamState: createCompletedToolStreamState('已帮你测试。'),
      })
    )

    expect(countOccurrences(markup, 'TaskCreate')).toBe(1)
    expect(countOccurrences(markup, 'TaskList')).toBe(1)
  })
})
