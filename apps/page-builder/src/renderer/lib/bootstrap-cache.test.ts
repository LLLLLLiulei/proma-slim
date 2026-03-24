import { describe, expect, test } from 'bun:test'
import {
  clearBootstrapPayload,
  readBootstrapPayload,
  writeBootstrapPayload,
} from './bootstrap-cache'

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const state = new Map(Object.entries(initial))

  return {
    get length() {
      return state.size
    },
    clear() {
      state.clear()
    },
    getItem(key) {
      return state.get(key) ?? null
    },
    key(index) {
      return Array.from(state.keys())[index] ?? null
    },
    removeItem(key) {
      state.delete(key)
    },
    setItem(key, value) {
      state.set(key, value)
    },
  }
}

describe('page builder bootstrap cache', () => {
  test('writes and reads a bootstrap payload by session id', () => {
    const storage = createMemoryStorage()

    writeBootstrapPayload(storage, {
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      initialPrompt: '生成一个落地页',
    })

    expect(readBootstrapPayload(storage, 'session-1')).toEqual({
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      initialPrompt: '生成一个落地页',
    })
  })

  test('clears a bootstrap payload once it is consumed', () => {
    const storage = createMemoryStorage()

    writeBootstrapPayload(storage, {
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      initialPrompt: '生成一个落地页',
    })
    clearBootstrapPayload(storage, 'session-1')

    expect(readBootstrapPayload(storage, 'session-1')).toBeNull()
  })

  test('drops malformed bootstrap payloads instead of crashing', () => {
    const storage = createMemoryStorage({
      'page-builder.bootstrap.session-1': '{invalid json',
    })

    expect(readBootstrapPayload(storage, 'session-1')).toBeNull()
    expect(storage.getItem('page-builder.bootstrap.session-1')).toBeNull()
  })
})
