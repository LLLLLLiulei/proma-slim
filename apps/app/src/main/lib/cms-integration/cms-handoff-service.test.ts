import { describe, expect, test } from 'bun:test'
import { CmsIntegrationError } from './cms-integration-errors'
import {
  CMS_HANDOFF_DEFAULT_TTL_MS,
  InMemoryCmsHandoffStore,
  createCmsHandoffService,
} from './cms-handoff-service'

describe('cms handoff service', () => {
  test('creates builder handoff with normalized defaults and expires by ttl', () => {
    const service = createCmsHandoffService({
      now: () => 1000,
      randomUUID: () => 'handoff-1',
      store: new InMemoryCmsHandoffStore(),
    })

    const handoff = service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })

    expect(handoff).toMatchObject({
      handoffId: 'handoff-1',
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      target: 'builder',
      openMode: 'window',
      expiresAt: 1000 + CMS_HANDOFF_DEFAULT_TTL_MS,
    })
  })

  test('consumes a handoff only once and maps missing records to handoff_expired', () => {
    const service = createCmsHandoffService({
      now: () => 1000,
      randomUUID: () => 'handoff-1',
      store: new InMemoryCmsHandoffStore(),
    })

    service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })

    const consumed = service.consume('handoff-1')
    expect(consumed.handoffId).toBe('handoff-1')
    expect(() => service.consume('handoff-1')).toThrow(CmsIntegrationError)
    expect(() => service.consume('missing')).toThrow(CmsIntegrationError)
  })

  test('rejects invalid target and openMode values', () => {
    const service = createCmsHandoffService({
      now: () => 1000,
      randomUUID: () => 'handoff-1',
      store: new InMemoryCmsHandoffStore(),
    })

    expect(() => service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      target: 'invalid' as never,
    })).toThrow(CmsIntegrationError)

    expect(() => service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      openMode: 'popup' as never,
    })).toThrow(CmsIntegrationError)
  })

  test('stores only structured handoff metadata without raw CMS cookies', () => {
    const service = createCmsHandoffService({
      now: () => 1000,
      randomUUID: () => 'handoff-1',
      store: new InMemoryCmsHandoffStore(),
    })

    const handoff = service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      userSummary: { userName: 'cms-user', realName: 'CMS User' },
    })

    const stored = service.get(handoff.handoffId)
    expect(stored?.userSummary).toEqual({ userName: 'cms-user', realName: 'CMS User' })
    expect((stored as Record<string, unknown> | null)?.cmsCookie).toBeUndefined()
  })

  test('prunes expired handoff records when creating new handoffs', () => {
    let now = 1000
    const ids = ['handoff-1', 'handoff-2']
    const store = new InMemoryCmsHandoffStore()
    const service = createCmsHandoffService({
      now: () => now,
      randomUUID: () => ids.shift()!,
      ttlMs: 10,
      store,
    })

    service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })
    now = 1011
    service.create({
      projectId: 'pbp_2',
      workspaceId: 'workspace-2',
      sessionId: 'session-2',
    })

    expect(store.get('handoff-1')).toBeNull()
    expect(store.get('handoff-2')).toBeTruthy()
  })
})
