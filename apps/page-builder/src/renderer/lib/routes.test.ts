import { describe, expect, test } from 'bun:test'
import { buildBuilderPath, parsePageBuilderRoute } from './routes'

describe('page builder routes', () => {
  test('parses the homepage route', () => {
    expect(parsePageBuilderRoute('/')).toEqual({ name: 'home' })
  })

  test('parses builder route params from the pathname', () => {
    expect(parsePageBuilderRoute('/builder/workspace-1/session-1')).toEqual({
      name: 'builder',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })
  })

  test('marks unexpected paths as not found', () => {
    expect(parsePageBuilderRoute('/missing')).toEqual({ name: 'not-found' })
  })

  test('builds an encoded builder path from workspace and session ids', () => {
    expect(buildBuilderPath('workspace 1', 'session/1')).toBe('/builder/workspace%201/session%2F1')
  })
})
