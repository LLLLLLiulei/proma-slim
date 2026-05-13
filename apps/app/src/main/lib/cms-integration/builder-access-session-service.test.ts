import { describe, expect, test } from 'bun:test'
import {
  ACCESS_COOKIE_NAME,
  ACCESS_SESSION_DEFAULT_TTL_MS,
  InMemoryBuilderAccessSessionStore,
  createBuilderAccessSessionService,
} from './builder-access-session-service'

describe('builder access session service', () => {
  test('creates signed access cookies with path, ttl and secure handling', () => {
    const service = createBuilderAccessSessionService({
      now: () => 1000,
      randomUUID: () => 'access-1',
      signingSecret: 'secret',
      store: new InMemoryBuilderAccessSessionStore(),
    })

    const session = service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      basePath: '/pagebuilder',
      isSecure: true,
    })

    expect(session).toMatchObject({
      accessId: 'access-1',
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      expiresAt: 1000 + ACCESS_SESSION_DEFAULT_TTL_MS,
    })
    expect(session.cookie).toContain(`${ACCESS_COOKIE_NAME}=`)
    expect(session.cookie).toContain('HttpOnly')
    expect(session.cookie).toContain('SameSite=Lax')
    expect(session.cookie).toContain('Path=/pagebuilder')
    expect(session.cookie).toContain('Max-Age=259200')
    expect(session.cookie).toContain('Secure')
    expect(session.cookie).not.toContain('Domain=')
  })

  test('accepts root base path and rejects tampered access cookies', () => {
    const service = createBuilderAccessSessionService({
      now: () => 1000,
      randomUUID: () => 'access-1',
      signingSecret: 'secret',
      store: new InMemoryBuilderAccessSessionStore(),
    })

    const created = service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      basePath: '',
      isSecure: false,
    })

    expect(created.cookie).toContain('Path=/')
    expect(created.cookie).not.toContain('Secure')
    expect(service.readFromCookie(created.cookie)).toMatchObject({
      accessId: 'access-1',
      workspaceId: 'workspace-1',
    })
    expect(service.readFromCookie(`${ACCESS_COOKIE_NAME}=tampered.signature`)).toBeNull()
  })

  test('matches workspace and session access checks', () => {
    const service = createBuilderAccessSessionService({
      now: () => 1000,
      randomUUID: () => 'access-1',
      signingSecret: 'secret',
      store: new InMemoryBuilderAccessSessionStore(),
    })

    const access = service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      basePath: '',
      isSecure: false,
    })

    expect(service.validate(access.cookie, {
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })).toMatchObject({ valid: true })
    expect(service.validate(access.cookie, {
      workspaceId: 'workspace-1',
    })).toMatchObject({ valid: true })
    expect(service.validate(access.cookie, {
      workspaceId: 'workspace-2',
      sessionId: 'session-1',
    })).toMatchObject({ valid: false, code: 'builder_access_mismatch' })
    expect(service.validate(access.cookie, {
      workspaceId: 'workspace-1',
      sessionId: 'session-2',
    })).toMatchObject({ valid: false, code: 'builder_access_mismatch' })
  })

  test('prunes expired access sessions when creating new sessions', () => {
    let now = 1000
    const ids = ['access-1', 'access-2']
    const store = new InMemoryBuilderAccessSessionStore()
    const service = createBuilderAccessSessionService({
      now: () => now,
      randomUUID: () => ids.shift()!,
      signingSecret: 'secret',
      ttlMs: 10,
      store,
    })

    service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      basePath: '',
      isSecure: false,
    })
    now = 1011
    service.create({
      projectId: 'pbp_2',
      workspaceId: 'workspace-2',
      sessionId: 'session-2',
      basePath: '',
      isSecure: false,
    })

    expect(store.get('access-1')).toBeNull()
    expect(store.get('access-2')).toBeTruthy()
  })
})
