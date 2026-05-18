import { describe, expect, test } from 'bun:test'
import { CmsIntegrationError } from './cms-integration-errors'
import {
  CMS_HANDOFF_DEFAULT_TTL_MS,
  InMemoryCmsHandoffStore,
  createCmsHandoffService,
} from './cms-handoff-service'

describe('cms handoff service', () => {
  test('creates builder handoff with normalized defaults and expires by ttl', async () => {
    const service = createCmsHandoffService({
      now: () => 1000,
      randomUUID: () => 'handoff-1',
      store: new InMemoryCmsHandoffStore(),
    })

    const handoff = await service.create({
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

  test('consumes a handoff only once and maps missing records to handoff_expired', async () => {
    const service = createCmsHandoffService({
      now: () => 1000,
      randomUUID: () => 'handoff-1',
      store: new InMemoryCmsHandoffStore(),
    })

    await service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })

    const consumed = await service.consume('handoff-1')
    expect(consumed.handoffId).toBe('handoff-1')
    await expect(service.consume('handoff-1')).rejects.toThrow(CmsIntegrationError)
    await expect(service.consume('missing')).rejects.toThrow(CmsIntegrationError)
  })

  test('rejects invalid target and openMode values', async () => {
    const service = createCmsHandoffService({
      now: () => 1000,
      randomUUID: () => 'handoff-1',
      store: new InMemoryCmsHandoffStore(),
    })

    await expect(service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      target: 'invalid' as never,
    })).rejects.toThrow(CmsIntegrationError)

    await expect(service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      openMode: 'popup' as never,
    })).rejects.toThrow(CmsIntegrationError)
  })

  test('stores only structured handoff metadata without raw CMS cookies', async () => {
    const service = createCmsHandoffService({
      now: () => 1000,
      randomUUID: () => 'handoff-1',
      store: new InMemoryCmsHandoffStore(),
    })

    const handoff = await service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      userSummary: { userName: 'cms-user', realName: 'CMS User' },
    })

    const stored = await service.get(handoff.handoffId)
    expect(stored?.userSummary).toEqual({ userName: 'cms-user', realName: 'CMS User' })
    expect((stored as Record<string, unknown> | null)?.cmsCookie).toBeUndefined()
  })

  test('prunes expired handoff records when creating new handoffs', async () => {
    let now = 1000
    const ids = ['handoff-1', 'handoff-2']
    const store = new InMemoryCmsHandoffStore()
    const service = createCmsHandoffService({
      now: () => now,
      randomUUID: () => ids.shift()!,
      ttlMs: 10,
      store,
    })

    await service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })
    now = 1011
    await service.create({
      projectId: 'pbp_2',
      workspaceId: 'workspace-2',
      sessionId: 'session-2',
    })

    expect(await store.get('handoff-1')).toBeNull()
    expect(await store.get('handoff-2')).toBeTruthy()
  })

  test('consumeWith keeps handoff retryable when downstream access creation fails', async () => {
    const service = createCmsHandoffService({
      now: () => 1000,
      randomUUID: () => 'handoff-1',
      store: new InMemoryCmsHandoffStore(),
    })

    await service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })

    await expect(service.consumeWith('handoff-1', async () => {
      throw new Error('access write failed')
    })).rejects.toThrow('access write failed')

    const retry = await service.consume('handoff-1')
    expect(retry.consumedAt).toBe(1000)
  })

  test('consumeWith serializes concurrent access for the same handoff', async () => {
    const service = createCmsHandoffService({
      now: () => 1000,
      randomUUID: () => 'handoff-1',
      store: new InMemoryCmsHandoffStore(),
    })

    await service.create({
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    })

    const results = await Promise.allSettled([
      service.consumeWith('handoff-1', async () => 'first'),
      service.consumeWith('handoff-1', async () => 'second'),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
  })
})
