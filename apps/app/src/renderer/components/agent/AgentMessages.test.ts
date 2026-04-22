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

function createStreamingState(content: string, model?: string): AgentStreamState {
  return {
    running: true,
    content,
    model: model ?? 'claude-sonnet-4-6',
    startedAt: 1,
    teammates: [],
    toolActivities: [],
  }
}

function createStreamingStateWithStatusNotice(message: string): AgentStreamState {
  return {
    running: true,
    content: '',
    model: 'claude-sonnet-4-6',
    startedAt: 1,
    teammates: [],
    toolActivities: [],
    statusNotice: {
      level: 'warning',
      message,
    },
  } as AgentStreamState
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

  test('suppresses leftover smooth content once the persisted latest assistant already contains that prefix', () => {
    const messages: AgentMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '根据搜索结果，湖南长沙今天的天气情况如下：多云，17°C 到 11°C。',
        createdAt: Date.now(),
      },
    ]

    expect(shouldRenderTransientAssistantMessage({
      messages,
      streaming: false,
      streamingContent: '',
      smoothContent: '根据搜索结果，湖南长沙今天的天气情况如下：',
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

  test('does not render a leftover transient tool block when an earlier persisted assistant already contains those tool events', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-resume-tools',
        messages: [
          createAssistantMessageWithToolEvents('我来先执行工具。', true),
          {
            id: 'assistant-2',
            role: 'assistant',
            content: '这是最终总结。',
            createdAt: 2,
            model: 'claude-sonnet-4-6',
          },
        ],
        streaming: false,
        streamState: createCompletedToolStreamState('这是最终总结。'),
      })
    )

    expect(countOccurrences(markup, 'TaskCreate')).toBe(1)
    expect(countOccurrences(markup, 'TaskList')).toBe(1)
  })

  test('shows an explicit loading label while partial assistant text is still streaming', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-streaming',
        messages: [],
        streaming: true,
        streamState: createStreamingState('这是正在流式输出的部分内容。'),
      })
    )

    expect(markup).toContain('这是正在流式输出的部分内容。')
    expect(markup).toContain('正在处理...')
  })

  test('does not duplicate persisted assistant model info into the transient streaming header before model_resolved arrives', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-streaming-model-fallback',
        messages: [{
          id: 'assistant-existing',
          role: 'assistant',
          content: '上一条回复',
          createdAt: 1,
          model: 'claude-sonnet-4-6',
        }],
        streaming: true,
        streamState: { ...createStreamingState('新的流式回复'), model: undefined },
      })
    )

    expect(countOccurrences(markup, 'alt="claude-sonnet-4-6"')).toBe(1)
  })

  test('does not render a fallback model identity in the transient streaming header for a brand-new session', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-streaming-model-default',
        messages: [],
        streaming: true,
        streamState: { ...createStreamingState('首条流式回复'), model: undefined },
      })
    )

    expect(markup).not.toContain('claude-sonnet-4-5-20250929')
    expect(markup).not.toContain('alt="claude-sonnet-4-5-20250929"')
    expect(markup).toContain('Agent')
  })

  test('renders a transient status notice while the sdk is waiting without assistant text yet', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-status-notice',
        messages: [],
        streaming: true,
        streamState: createStreamingStateWithStatusNotice('正在等待 SDK 完成鉴权…'),
      })
    )

    expect(markup).toContain('正在等待 SDK 完成鉴权…')
    expect(markup).toContain('正在思考...')
  })

  test('renders structured user attachments through the session-scoped content route', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-attachments',
        messages: [{
          id: 'user-1',
          role: 'user',
          content: '请参考这张图和附件文档',
          createdAt: 1,
          attachments: [
            {
              id: 'attachment-image',
              filename: 'reference.png',
              mediaType: 'image/png',
              localPath: 'attachments/reference.png',
              size: 128,
            },
            {
              id: 'attachment-doc',
              filename: 'brief.pdf',
              mediaType: 'application/pdf',
              localPath: 'attachments/brief.pdf',
              size: 256,
            },
          ],
        }],
        streaming: false,
      })
    )

    expect(markup).toContain('/api/sessions/session-attachments/attachments/attachment-image/content')
    expect(markup).toContain('/api/sessions/session-attachments/attachments/attachment-doc/content')
    expect(markup).toContain('brief.pdf')
  })

  test('renders multiple image attachments with max dimensions and proportional scaling instead of cropping', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-multi-image-attachments',
        messages: [{
          id: 'user-2',
          role: 'user',
          content: '请看这两张参考图',
          createdAt: 2,
          attachments: [
            {
              id: 'attachment-image-a',
              filename: 'hero-reference.png',
              mediaType: 'image/png',
              localPath: 'attachments/hero-reference.png',
              size: 512,
            },
            {
              id: 'attachment-image-b',
              filename: 'layout-reference.png',
              mediaType: 'image/png',
              localPath: 'attachments/layout-reference.png',
              size: 768,
            },
          ],
        }],
        streaming: false,
      })
    )

    expect(markup).toContain('max-w-[240px]')
    expect(markup).toContain('max-h-[180px]')
    expect(markup).toContain('object-contain')
  })

  test('renders a single image attachment with the same max dimensions as the multi-image layout', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-single-image-attachment',
        messages: [{
          id: 'user-3',
          role: 'user',
          content: '请参考这张图',
          createdAt: 3,
          attachments: [
            {
              id: 'attachment-image-single',
              filename: 'single-reference.png',
              mediaType: 'image/png',
              localPath: 'attachments/single-reference.png',
              size: 1024,
            },
          ],
        }],
        streaming: false,
      })
    )

    expect(markup).toContain('max-w-[240px]')
    expect(markup).toContain('max-h-[180px]')
    expect(markup).toContain('object-contain')
    expect(markup).not.toContain('sm:max-w-[500px]')
  })

  test('renders status-message diagnostics and original upstream errors inside expandable sections', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-status-error',
        messages: [{
          id: 'status-1',
          role: 'status',
          content: 'Anthropic 认证失败，请检查 ANTHROPIC_API_KEY 是否正确。',
          createdAt: 1,
          errorCode: 'invalid_api_key',
          errorTitle: '认证失败',
          errorDetails: [
            'HTTP 401: invalid x-api-key',
            '请求已被上游模型提供方拒绝',
          ],
          errorOriginal: 'API Error: 401 {"error":{"message":"invalid x-api-key"}}',
          errorActions: [
            { key: 's', label: '设置', action: 'settings' },
            { key: 'r', label: '重试', action: 'retry' },
          ],
        }],
        streaming: false,
      })
    )

    expect(markup).toContain('Anthropic 认证失败，请检查 ANTHROPIC_API_KEY 是否正确。')
    expect(markup).toContain('诊断详情')
    expect(markup).toContain('invalid_api_key')
    expect(markup).toContain('HTTP 401: invalid x-api-key')
    expect(markup).toContain('原始错误')
    expect(markup).toContain('API Error: 401')
  })
})
