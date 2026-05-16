import { describe, expect, test } from 'bun:test'
import {
  ACCESS_COOKIE_NAME,
  ACCESS_SESSION_DEFAULT_TTL_MS,
  InMemoryBuilderAccessSessionStore,
  createBuilderAccessSessionService,
} from './builder-access-session-service'

function readSetCookiePair(setCookie: string): { name: string; value: string; pair: string } {
  const pair = setCookie.split(';', 1)[0]!
  const separatorIndex = pair.indexOf('=')
  return {
    name: pair.slice(0, separatorIndex),
    value: pair.slice(separatorIndex + 1),
    pair,
  }
}

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
    expect(readSetCookiePair(session.cookie).name).toStartWith(`${ACCESS_COOKIE_NAME}_`)
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
    expect(service.validate(`${ACCESS_COOKIE_NAME}=${readSetCookiePair(created.cookie).value}`, {
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })).toMatchObject({ valid: true })
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

  test('keeps multiple workspace access cookies valid in the same browser cookie header', () => {
    const ids = ['access-1', 'access-2']
    const service = createBuilderAccessSessionService({
      now: () => 1000,
      randomUUID: () => ids.shift()!,
      signingSecret: 'secret',
      store: new InMemoryBuilderAccessSessionStore(),
    })

    const first = service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      basePath: '/pagebuilder',
      isSecure: false,
    })
    const second = service.create({
      projectId: 'pbp_2',
      workspaceId: 'workspace-2',
      sessionId: 'session-2',
      basePath: '/pagebuilder',
      isSecure: false,
    })
    const firstCookiePair = readSetCookiePair(first.cookie).pair
    const secondCookiePair = readSetCookiePair(second.cookie).pair
    const firstCookieName = readSetCookiePair(first.cookie).name
    const secondCookieName = readSetCookiePair(second.cookie).name
    const browserCookieHeader = `${firstCookiePair}; ${secondCookiePair}`

    expect(firstCookieName).not.toBe(secondCookieName)
    expect(firstCookieName).toStartWith(`${ACCESS_COOKIE_NAME}_`)
    expect(secondCookieName).toStartWith(`${ACCESS_COOKIE_NAME}_`)
    expect(service.validate(browserCookieHeader, {
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })).toMatchObject({ valid: true, access: { accessId: 'access-1' } })
    expect(service.validate(browserCookieHeader, {
      workspaceId: 'workspace-2',
      sessionId: 'session-2',
    })).toMatchObject({ valid: true, access: { accessId: 'access-2' } })
    expect(service.validate(firstCookiePair, {
      workspaceId: 'workspace-2',
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

  test('renews an existing access session without changing the signed cookie value', () => {
    let now = 1000
    const service = createBuilderAccessSessionService({
      now: () => now,
      randomUUID: () => 'access-1',
      signingSecret: 'secret',
      ttlMs: 2000,
      store: new InMemoryBuilderAccessSessionStore(),
    })

    const created = service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      basePath: '',
      isSecure: false,
    })
    const originalCookie = readSetCookiePair(created.cookie)

    now = 2500
    const renewed = service.renew(created.accessId, {
      basePath: '/pagebuilder',
      isSecure: true,
    })

    expect(renewed?.access).toMatchObject({
      accessId: 'access-1',
      expiresAt: 4500,
    })
    expect(readSetCookiePair(renewed!.cookie)).toEqual(originalCookie)
    expect(renewed?.cookie).toContain('Path=/pagebuilder')
    expect(renewed?.cookie).toContain('Max-Age=2')
    expect(renewed?.cookie).toContain('Secure')
    expect(service.validate(renewed?.cookie, {
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })).toMatchObject({ valid: true })
  })

  test('does not renew missing or expired access sessions', () => {
    let now = 1000
    const service = createBuilderAccessSessionService({
      now: () => now,
      randomUUID: () => 'access-1',
      signingSecret: 'secret',
      ttlMs: 10,
      store: new InMemoryBuilderAccessSessionStore(),
    })

    const created = service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      basePath: '',
      isSecure: false,
    })

    expect(service.renew('missing-access', {
      basePath: '',
      isSecure: false,
    })).toBeNull()

    now = 1011
    expect(service.renew(created.accessId, {
      basePath: '',
      isSecure: false,
    })).toBeNull()
    expect(service.validate(created.cookie, {
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })).toMatchObject({ valid: false, code: 'builder_access_required' })
  })
})
