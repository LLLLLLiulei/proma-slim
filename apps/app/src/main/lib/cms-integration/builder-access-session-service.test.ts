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
  test('creates bearer access cookies with path, ttl and secure handling', async () => {
    const service = createBuilderAccessSessionService({
      now: () => 1000,
      randomUUID: () => 'access-1',
      store: new InMemoryBuilderAccessSessionStore(),
    })

    const session = await service.create({
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
    const cookiePair = readSetCookiePair(session.cookie)
    expect(cookiePair.name).toStartWith(`${ACCESS_COOKIE_NAME}_`)
    expect(cookiePair.value).toBe('access-1')
    expect(session.cookie).toContain('HttpOnly')
    expect(session.cookie).toContain('SameSite=Lax')
    expect(session.cookie).toContain('Path=/pagebuilder')
    expect(session.cookie).toContain('Max-Age=28800')
    expect(session.cookie).toContain('Secure')
    expect(session.cookie).not.toContain('Domain=')
  })

  test('accepts root base path and rejects tampered access cookies', async () => {
    const service = createBuilderAccessSessionService({
      now: () => 1000,
      randomUUID: () => 'access-1',
      store: new InMemoryBuilderAccessSessionStore(),
    })

    const created = await service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      basePath: '',
      isSecure: false,
    })

    expect(created.cookie).toContain('Path=/')
    expect(created.cookie).not.toContain('Secure')
    expect(await service.readFromCookie(created.cookie)).toMatchObject({
      accessId: 'access-1',
      workspaceId: 'workspace-1',
    })
    expect(await service.validate(`${ACCESS_COOKIE_NAME}=${readSetCookiePair(created.cookie).value}`, {
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })).toMatchObject({ valid: true })
    expect(await service.readFromCookie(`${ACCESS_COOKIE_NAME}=missing-access`)).toBeNull()
  })

  test('matches workspace and session access checks', async () => {
    const service = createBuilderAccessSessionService({
      now: () => 1000,
      randomUUID: () => 'access-1',
      store: new InMemoryBuilderAccessSessionStore(),
    })

    const access = await service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      basePath: '',
      isSecure: false,
    })

    expect(await service.validate(access.cookie, {
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })).toMatchObject({ valid: true })
    expect(await service.validate(access.cookie, {
      workspaceId: 'workspace-1',
    })).toMatchObject({ valid: true })
    expect(await service.validate(access.cookie, {
      workspaceId: 'workspace-2',
      sessionId: 'session-1',
    })).toMatchObject({ valid: false, code: 'builder_access_mismatch' })
    expect(await service.validate(access.cookie, {
      workspaceId: 'workspace-1',
      sessionId: 'session-2',
    })).toMatchObject({ valid: false, code: 'builder_access_mismatch' })
  })

  test('keeps multiple workspace access cookies valid in the same browser cookie header', async () => {
    const ids = ['access-1', 'access-2']
    const service = createBuilderAccessSessionService({
      now: () => 1000,
      randomUUID: () => ids.shift()!,
      store: new InMemoryBuilderAccessSessionStore(),
    })

    const first = await service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      basePath: '/pagebuilder',
      isSecure: false,
    })
    const second = await service.create({
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
    expect(await service.validate(browserCookieHeader, {
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })).toMatchObject({ valid: true, access: { accessId: 'access-1' } })
    expect(await service.validate(browserCookieHeader, {
      workspaceId: 'workspace-2',
      sessionId: 'session-2',
    })).toMatchObject({ valid: true, access: { accessId: 'access-2' } })
    expect(await service.validate(firstCookiePair, {
      workspaceId: 'workspace-2',
      sessionId: 'session-2',
    })).toMatchObject({ valid: false, code: 'builder_access_mismatch' })
  })

  test('prunes expired access sessions when creating new sessions', async () => {
    let now = 1000
    const ids = ['access-1', 'access-2']
    const store = new InMemoryBuilderAccessSessionStore()
    const service = createBuilderAccessSessionService({
      now: () => now,
      randomUUID: () => ids.shift()!,
      ttlMs: 10,
      store,
    })

    await service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      basePath: '',
      isSecure: false,
    })
    now = 1011
    await service.create({
      projectId: 'pbp_2',
      workspaceId: 'workspace-2',
      sessionId: 'session-2',
      basePath: '',
      isSecure: false,
    })

    expect(await store.get('access-1')).toBeNull()
    expect(await store.get('access-2')).toBeTruthy()
  })

  test('renews an existing access session without changing the bearer cookie value', async () => {
    let now = 1000
    const service = createBuilderAccessSessionService({
      now: () => now,
      randomUUID: () => 'access-1',
      ttlMs: 2000,
      store: new InMemoryBuilderAccessSessionStore(),
    })

    const created = await service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      basePath: '',
      isSecure: false,
    })
    const originalCookie = readSetCookiePair(created.cookie)

    now = 2500
    const renewed = await service.renew(created.accessId, {
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
    expect(await service.validate(renewed?.cookie, {
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })).toMatchObject({ valid: true })
  })

  test('does not renew missing expired or far-from-expiry access sessions', async () => {
    let now = 1000
    const service = createBuilderAccessSessionService({
      now: () => now,
      randomUUID: () => 'access-1',
      ttlMs: 10,
      renewThresholdMs: 5,
      store: new InMemoryBuilderAccessSessionStore(),
    })

    const created = await service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      basePath: '',
      isSecure: false,
    })

    expect(await service.renew('missing-access', {
      basePath: '',
      isSecure: false,
    })).toBeNull()
    expect(await service.renew(created.accessId, {
      basePath: '',
      isSecure: false,
    })).toBeNull()

    now = 1011
    expect(await service.renew(created.accessId, {
      basePath: '',
      isSecure: false,
    })).toBeNull()
    expect(await service.validate(created.cookie, {
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })).toMatchObject({ valid: false, code: 'builder_access_required' })
  })

  test('stores access token as accessId and validates after service recreation', async () => {
    const store = new InMemoryBuilderAccessSessionStore()
    const first = createBuilderAccessSessionService({
      now: () => 1000,
      randomUUID: () => 'access-1',
      store,
    })

    const created = await first.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      basePath: '',
      isSecure: false,
    })
    const cookiePair = readSetCookiePair(created.cookie)
    expect(cookiePair.value).toBe('access-1')

    const stored = await store.get('access-1')
    expect(stored).toMatchObject({ accessId: 'access-1' })

    const second = createBuilderAccessSessionService({
      now: () => 1000,
      store,
    })
    expect(await second.validate(created.cookie, {
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })).toMatchObject({ valid: true })

    expect(await second.validate(`${cookiePair.name}=missing-access`, {
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })).toMatchObject({ valid: false, code: 'builder_access_required' })
  })

  test('serializes concurrent renewals for the same access session', async () => {
    let now = 1000
    const service = createBuilderAccessSessionService({
      now: () => now,
      randomUUID: () => 'access-1',
      ttlMs: 100,
      renewThresholdMs: 100,
      store: new InMemoryBuilderAccessSessionStore(),
    })
    const created = await service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      basePath: '',
      isSecure: false,
    })

    const firstRenew = service.renew(created.accessId, {
      basePath: '',
      isSecure: false,
    })
    now = 1050
    const secondRenew = service.renew(created.accessId, {
      basePath: '',
      isSecure: false,
    })

    await Promise.all([firstRenew, secondRenew])
    expect(await service.get(created.accessId)).toMatchObject({ expiresAt: 1150 })
  })
})
