import { describe, expect, test } from 'bun:test'
import type { AgentMessage } from '@proma/shared'
import {
  appendMessageForSession,
  getMessagesForSession,
  replaceMessagesForSession,
} from './AgentView'

function createMessage(id: string, role: AgentMessage['role'], content: string): AgentMessage {
  return {
    id,
    role,
    content,
    createdAt: 1,
  }
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
})
