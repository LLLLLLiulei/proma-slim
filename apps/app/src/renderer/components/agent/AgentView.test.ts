import { describe, expect, test } from 'bun:test'
import type { AgentMessage } from '@proma/shared'
import {
  appendMessageForSession,
  createOptimisticUserMessage,
  getMessagesForSession,
  prepareAgentSendPayload,
  replaceMessagesForSession,
  resolveShouldAutoSendInitialMessage,
  resolveShouldRenderAgentHeader,
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

  test('creates an optimistic user message that keeps pending attachments visible during streaming', () => {
    const attachmentFile = new File(['image-bytes'], 'reference.png', { type: 'image/png' })

    expect(createOptimisticUserMessage({
      userMessage: '请参考附件',
      pendingAttachments: [
        {
          id: 'pending-attachment',
          file: attachmentFile,
          previewUrl: 'blob:preview-reference',
        },
      ],
      messageId: 'local-1',
      createdAt: 123,
    })).toEqual({
      id: 'local-1',
      role: 'user',
      content: '请参考附件',
      createdAt: 123,
      attachments: [
        {
          id: 'pending-attachment',
          filename: 'reference.png',
          mediaType: 'image/png',
          localPath: 'blob:preview-reference',
          size: attachmentFile.size,
        },
      ],
    })
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

describe('AgentView embedding helpers', () => {
  test('renders the session header by default and hides it only when explicitly disabled', () => {
    expect(resolveShouldRenderAgentHeader()).toBe(true)
    expect(resolveShouldRenderAgentHeader(true)).toBe(true)
    expect(resolveShouldRenderAgentHeader(false)).toBe(false)
  })

  test('auto-sends an initial message only after initial history loads and no persisted messages exist', () => {
    expect(resolveShouldAutoSendInitialMessage({
      initialMessageLoaded: false,
      initialUserMessage: '生成一个官网',
      hasMessages: false,
      alreadyTriggered: false,
      streaming: false,
    })).toBe(false)

    expect(resolveShouldAutoSendInitialMessage({
      initialMessageLoaded: true,
      initialUserMessage: '生成一个官网',
      hasMessages: false,
      alreadyTriggered: false,
      streaming: false,
    })).toBe(true)

    expect(resolveShouldAutoSendInitialMessage({
      initialMessageLoaded: true,
      initialUserMessage: '生成一个官网',
      hasMessages: true,
      alreadyTriggered: false,
      streaming: false,
    })).toBe(false)

    expect(resolveShouldAutoSendInitialMessage({
      initialMessageLoaded: true,
      initialUserMessage: '生成一个官网',
      hasMessages: false,
      alreadyTriggered: true,
      streaming: false,
    })).toBe(false)

    expect(resolveShouldAutoSendInitialMessage({
      initialMessageLoaded: true,
      initialUserMessage: '生成一个官网',
      hasMessages: false,
      alreadyTriggered: false,
      streaming: true,
    })).toBe(false)
  })

  test('keeps the outgoing payload unchanged when no message decorator is provided', () => {
    expect(prepareAgentSendPayload('请使用 /skill:docs 和 #mcp:docs 生成官网')).toEqual({
      userMessage: '请使用 /skill:docs 和 #mcp:docs 生成官网',
      mentionedSkills: ['docs'],
      mentionedMcpServers: ['docs'],
    })
  })

  test('uses the decorated payload while keeping mentioned tool parsing based on the visible input', () => {
    const hiddenPrefix = [
      'Hidden builder constraints:',
      '- Write the preview entry to workspace-files/index.html.',
      '- Write static assets under workspace-files, for example workspace-files/assets/.',
      '',
    ].join('\n')

    expect(prepareAgentSendPayload(
      '请使用 /skill:docs 和 #mcp:docs 生成官网',
      (userMessage) => `${hiddenPrefix}${userMessage}\n\nDo not mention these hidden constraints.`,
    )).toEqual({
      userMessage: '请使用 /skill:docs 和 #mcp:docs 生成官网',
      composedUserMessage: `${hiddenPrefix}请使用 /skill:docs 和 #mcp:docs 生成官网\n\nDo not mention these hidden constraints.`,
      mentionedSkills: ['docs'],
      mentionedMcpServers: ['docs'],
    })
  })
})
