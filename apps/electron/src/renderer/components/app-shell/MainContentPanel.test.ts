import { describe, expect, test } from 'bun:test'
import { resolveRenderableSessionId } from './MainContentPanel'

describe('MainContentPanel session resolution', () => {
  test('suppresses stale persisted tabs until the session list is reconciled', () => {
    expect(resolveRenderableSessionId('missing-session', [])).toBeNull()
    expect(resolveRenderableSessionId('missing-session', [{ id: 'session-1' }])).toBeNull()
  })

  test('renders the active tab session once it exists in the loaded session list', () => {
    expect(resolveRenderableSessionId('session-1', [{ id: 'session-1' }])).toBe('session-1')
  })
})
