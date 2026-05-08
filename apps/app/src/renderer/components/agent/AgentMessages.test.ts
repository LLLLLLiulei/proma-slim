import { afterEach, describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgentMessages, shouldRenderTransientAssistantMessage } from './AgentMessages'
import { configureApiPublicBasePath } from '@/lib/api'
import type { AgentMessage } from '@ai-page-builder/shared'
import type { AgentStreamState } from '@/atoms/agent-atoms'

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

const TASK_CREATE_LABEL = '创建任务'
const TASK_LIST_LABEL = '查看任务列表'

afterEach(() => {
  configureApiPublicBasePath('/')
})

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

function createStreamingStateWithCompactNotice(message: string, options?: { isCompacting?: boolean }): AgentStreamState {
  return {
    running: true,
    content: '',
    model: 'claude-sonnet-4-6',
    startedAt: 1,
    teammates: [],
    toolActivities: [],
    isCompacting: options?.isCompacting ?? false,
    compactNotice: {
      kind: 'compact',
      level: 'info',
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

  test('suppresses transient assistant text after the current turn already persisted a newer assistant message', () => {
    const messages: AgentMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: '继续处理当前 CMS 绑定。',
        createdAt: 1,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '完成了！我已成功将 CMS 内容应用到画廊网格区域。',
        createdAt: 2,
      },
    ]

    expect(shouldRenderTransientAssistantMessage({
      messages,
      streaming: false,
      streamingContent: '',
      smoothContent: '我来处理这个 CMS 绑定申请。完成了！我已成功将 CMS 内容应用到画廊网格区域。',
      toolActivities: [],
      retrying: undefined,
    })).toBe(false)
  })

  test('keeps transient assistant text when the earlier persisted assistant only matches the beginning of the completed reply', () => {
    const messages: AgentMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: '继续处理当前 CMS 绑定。',
        createdAt: 1,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '我来处理这个 CMS 绑定申请。',
        createdAt: 2,
      },
    ]

    expect(shouldRenderTransientAssistantMessage({
      messages,
      streaming: false,
      streamingContent: '',
      smoothContent: '我来处理这个 CMS 绑定申请。完成了！我已成功将 CMS 内容应用到画廊网格区域。',
      toolActivities: [],
      retrying: undefined,
    })).toBe(true)
  })

  test('suppresses transient assistant text when the persisted current-turn assistant already ends with the completed summary', () => {
    const messages: AgentMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: '现在图片都不展示了呀',
        createdAt: 1,
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '让我检查一下图片的显示问题：让我检查一下图片的显示问题：我发现问题了！HTML中使用的是 `card-image-bg` 作为背景图片容器，而不是 `<img>` 标签。但我在CSS中删除了对应的样式。让我修复这个问题：我发现问题了！HTML中使用的是 `card-image-bg` 作为背景图片容器，而不是 `<img>` 标签。但我在CSS中删除了对应的样式。让我修复这个问题：好了，我已经修复了图片显示问题。问题是HTML中使用的是 `card-image-bg` 作为背景图片容器，而我在CSS中只写了 `img` 标签的样式。现在已经改成正确的样式了，图片应该能正常显示。',
        createdAt: 2,
      },
    ]

    expect(shouldRenderTransientAssistantMessage({
      messages,
      streaming: false,
      streamingContent: '',
      smoothContent: '好了，我已经修复了图片显示问题。问题是HTML中使用的是 `card-image-bg` 作为背景图片容器，而我在CSS中只写了 `img` 标签的样式。现在已经改成正确的样式了，图片应该能正常显示。',
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

    expect(countOccurrences(markup, TASK_CREATE_LABEL)).toBe(1)
    expect(countOccurrences(markup, TASK_LIST_LABEL)).toBe(1)
  })

  test('keeps transient tool activities but suppresses duplicate transient text once the completed assistant reply is persisted', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-completed-assistant-with-delayed-tool-events',
        messages: [{
          id: 'user-1',
          role: 'user',
          content: '继续处理当前 CMS 绑定。',
          createdAt: 1,
        }, {
          id: 'assistant-1',
          role: 'assistant',
          content: '完成了！我已成功将 CMS 内容应用到画廊网格区域。',
          createdAt: 2,
          model: 'claude-sonnet-4-6',
        }],
        streaming: false,
        streamState: {
          ...createCompletedToolStreamState('我来处理这个 CMS 绑定申请。完成了！我已成功将 CMS 内容应用到画廊网格区域。'),
        },
      })
    )

    expect(countOccurrences(markup, '完成了！我已成功将 CMS 内容应用到画廊网格区域。')).toBe(1)
    expect(countOccurrences(markup, TASK_CREATE_LABEL)).toBe(1)
    expect(countOccurrences(markup, TASK_LIST_LABEL)).toBe(1)
  })

  test('suppresses the transient shell when the persisted assistant already contains the final concise summary as a suffix', () => {
    const conciseSummary = '好了，我已经修复了图片显示问题。问题是HTML中使用的是 `card-image-bg` 作为背景图片容器，而我在CSS中只写了 `img` 标签的样式。现在已经改成正确的样式了，图片应该能正常显示。'
    const terminalSentence = '图片应该能正常显示。'
    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-persisted-verbose-with-transient-summary',
        messages: [{
          id: 'user-1',
          role: 'user',
          content: '现在图片都不展示了呀',
          createdAt: 1,
        }, {
          id: 'assistant-1',
          role: 'assistant',
          content: `让我检查一下图片的显示问题：让我检查一下图片的显示问题：我发现问题了！HTML中使用的是 \`card-image-bg\` 作为背景图片容器，而不是 \`<img>\` 标签。但我在CSS中删除了对应的样式。让我修复这个问题：我发现问题了！HTML中使用的是 \`card-image-bg\` 作为背景图片容器，而不是 \`<img>\` 标签。但我在CSS中删除了对应的样式。让我修复这个问题：${conciseSummary}`,
          createdAt: 2,
          model: 'claude-sonnet-4-6',
          events: [
            {
              type: 'tool_start',
              toolName: 'Read',
              toolUseId: 'tool-read-index-html',
              input: { file_path: 'index.html' },
            },
            {
              type: 'tool_result',
              toolName: 'Read',
              toolUseId: 'tool-read-index-html',
              result: 'index.html',
              isError: false,
            },
            {
              type: 'tool_start',
              toolName: 'Read',
              toolUseId: 'tool-read-style-css',
              input: { file_path: 'style.css' },
            },
            {
              type: 'tool_result',
              toolName: 'Read',
              toolUseId: 'tool-read-style-css',
              result: 'style.css',
              isError: false,
            },
          ],
        }],
        streaming: false,
        streamState: {
          running: false,
          content: conciseSummary,
          model: 'claude-sonnet-4-6',
          startedAt: 1,
          teammates: [],
          toolActivities: [],
        },
      })
    )

    expect(countOccurrences(markup, terminalSentence)).toBe(1)
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

    expect(countOccurrences(markup, TASK_CREATE_LABEL)).toBe(1)
    expect(countOccurrences(markup, TASK_LIST_LABEL)).toBe(1)
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

    expect(countOccurrences(markup, TASK_CREATE_LABEL)).toBe(1)
    expect(countOccurrences(markup, TASK_LIST_LABEL)).toBe(1)
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

  test('does not surface persisted assistant model metadata in the streaming header before model_resolved arrives', () => {
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

    expect(countOccurrences(markup, 'alt="claude-sonnet-4-6"')).toBe(0)
    expect(markup).not.toContain('claude-sonnet-4-6')
  })

  test('keeps persisted assistant messages on the fixed Agent identity even when model metadata exists', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-persisted-fixed-identity',
        messages: [{
          id: 'assistant-persisted',
          role: 'assistant',
          content: '这是已经落盘的助手回复。',
          createdAt: 1,
          model: 'claude-sonnet-4-6',
        }],
        streaming: false,
      })
    )

    expect(markup).not.toContain('claude-sonnet-4-6')
    expect(markup).toContain('Agent')
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

  test('renders a compacting notice and switches the loading label while context compaction is in progress', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-compacting',
        messages: [],
        streaming: true,
        streamState: createStreamingStateWithCompactNotice('正在压缩上下文，请稍候…', { isCompacting: true }),
      })
    )

    expect(markup).toContain('正在压缩上下文，请稍候…')
    expect(markup).toContain('正在压缩上下文...')
    expect(markup).not.toContain('正在思考...')
  })

  test('renders the compact success notice while the resumed turn is still processing', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-compact-complete',
        messages: [],
        streaming: true,
        streamState: createStreamingStateWithCompactNotice('已压缩，继续处理中'),
      })
    )

    expect(markup).toContain('已压缩，继续处理中')
  })

  test('renders structured user attachments through the session-scoped content route', () => {
    configureApiPublicBasePath('/')

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

  test('renders structured user attachments with the configured public base path', () => {
    configureApiPublicBasePath('/pagebuilder')

    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-attachments',
        messages: [{
          id: 'user-1',
          role: 'user',
          content: '请参考这张图',
          createdAt: 1,
          attachments: [
            {
              id: 'attachment-image',
              filename: 'reference.png',
              mediaType: 'image/png',
              localPath: 'attachments/reference.png',
              size: 128,
            },
          ],
        }],
        streaming: false,
      })
    )

    expect(markup).toContain('/pagebuilder/api/sessions/session-attachments/attachments/attachment-image/content')
    expect(markup).not.toContain('src="/api/sessions/session-attachments/attachments/attachment-image/content')
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

  test('renders status-message diagnostics and original upstream errors without any suggested actions', () => {
    const markup = renderToStaticMarkup(
      React.createElement(AgentMessages, {
        sessionId: 'session-status-error',
        messages: [{
          id: 'status-1',
          role: 'status',
          content: '上下文过长：当前对话的上下文已超出模型限制，请压缩上下文或开启新会话。',
          createdAt: 1,
          errorCode: 'prompt_too_long',
          errorTitle: '上下文过长',
          errorDetails: [
            'HTTP 400: prompt is too long',
            '请求已被上游模型提供方拒绝',
          ],
          errorOriginal: 'API Error: 400 {"error":{"message":"prompt is too long"}}',
          errorActions: [
            { key: 'c', label: '压缩上下文', action: 'compact' },
            { key: 'r', label: '重试', action: 'retry' },
          ],
        }],
        streaming: false,
        onRetry: () => {},
        onRetryInNewSession: () => {},
        onCompact: () => {},
      })
    )

    expect(markup).toContain('上下文过长：当前对话的上下文已超出模型限制，请压缩上下文或开启新会话。')
    expect(markup).toContain('诊断详情')
    expect(markup).toContain('prompt_too_long')
    expect(markup).toContain('HTTP 400: prompt is too long')
    expect(markup).toContain('原始错误')
    expect(markup).toContain('API Error: 400')
    expect(markup).not.toContain('建议操作：')
    expect(markup).not.toContain('>压缩上下文<')
    expect(markup).not.toContain('>重试<')
    expect(markup).not.toContain('>在新会话中重试<')
  })
})
