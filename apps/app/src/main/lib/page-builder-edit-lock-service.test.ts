import { describe, expect, test } from 'bun:test'
import {
  PAGE_BUILDER_EDIT_LOCK_HEARTBEAT_INTERVAL_MS,
  PAGE_BUILDER_EDIT_LOCK_RELEASE_GRACE_MS,
  PAGE_BUILDER_EDIT_LOCK_TTL_MS,
  PageBuilderEditLockConflictError,
  PageBuilderEditLockService,
} from './page-builder-edit-lock-service'

function createService(options: {
  now?: number
  ids?: string[]
  activeAgentSessionId?: string | null
  exportActive?: boolean
} = {}) {
  let now = options.now ?? 1_000
  const ids = [...(options.ids ?? ['lock-1', 'holder-generated'])]
  const service = new PageBuilderEditLockService({
    now: () => now,
    randomUUID: () => {
      const id = ids.shift()
      if (!id) {
        throw new Error('test id sequence exhausted')
      }
      return id
    },
    getWorkspaceActiveAgentSessionId: () => options.activeAgentSessionId ?? null,
    isWorkspaceExportActive: () => options.exportActive ?? false,
  })

  return {
    service,
    setNow: (next: number) => {
      now = next
    },
  }
}

describe('page builder edit lock service', () => {
  test('acquires an unlocked workspace lease', () => {
    const { service } = createService()

    const lease = service.acquire('workspace-1', {
      sessionId: 'session-1',
      holderId: 'holder-1',
    })

    expect(lease).toEqual({
      workspaceId: 'workspace-1',
      lockId: 'lock-1',
      holderId: 'holder-1',
      expiresAt: 1_000 + PAGE_BUILDER_EDIT_LOCK_TTL_MS,
      heartbeatIntervalMs: PAGE_BUILDER_EDIT_LOCK_HEARTBEAT_INTERVAL_MS,
    })
    expect(service.validate('workspace-1', {
      lockId: 'lock-1',
      holderId: 'holder-1',
    }).valid).toBe(true)
  })

  test('rejects a second acquire while a valid editor lock exists', () => {
    const { service } = createService()
    service.acquire('workspace-1', { holderId: 'holder-1' })

    expect(() => service.acquire('workspace-1', { holderId: 'holder-2' }))
      .toThrow(PageBuilderEditLockConflictError)

    try {
      service.acquire('workspace-1', { holderId: 'holder-2' })
    } catch (error) {
      expect(error).toBeInstanceOf(PageBuilderEditLockConflictError)
      expect((error as PageBuilderEditLockConflictError).editState).toEqual({
        status: 'locked',
        reason: 'editor',
        expiresAt: 1_000 + PAGE_BUILDER_EDIT_LOCK_TTL_MS,
      })
    }
  })

  test('allows acquire after the previous lock expires', () => {
    const { service, setNow } = createService({ ids: ['lock-1', 'lock-2'] })
    service.acquire('workspace-1', { holderId: 'holder-1' })

    setNow(1_000 + PAGE_BUILDER_EDIT_LOCK_TTL_MS + 1)
    const lease = service.acquire('workspace-1', { holderId: 'holder-2' })

    expect(lease.lockId).toBe('lock-2')
    expect(lease.holderId).toBe('holder-2')
  })

  test('renews a valid lock for the same holder', () => {
    const { service, setNow } = createService()
    service.acquire('workspace-1', { holderId: 'holder-1' })

    setNow(10_000)
    const renewed = service.renew('workspace-1', 'lock-1', { holderId: 'holder-1' })

    expect(renewed).toEqual({
      workspaceId: 'workspace-1',
      lockId: 'lock-1',
      holderId: 'holder-1',
      expiresAt: 10_000 + PAGE_BUILDER_EDIT_LOCK_TTL_MS,
      heartbeatIntervalMs: PAGE_BUILDER_EDIT_LOCK_HEARTBEAT_INTERVAL_MS,
    })
    expect(service.validate('workspace-1', {
      lockId: 'lock-1',
      holderId: 'holder-1',
    }).valid).toBe(true)
  })

  test('rejects renewal when the holder does not match the current lock holder', () => {
    const { service } = createService()
    service.acquire('workspace-1', { holderId: 'holder-1' })

    expect(service.renew('workspace-1', 'lock-1', { holderId: 'holder-2' })).toBeNull()
    expect(service.validate('workspace-1', {
      lockId: 'lock-1',
      holderId: 'holder-1',
    }).valid).toBe(true)
  })

  test('release allows another holder to acquire immediately and replaces the pending lock', () => {
    const { service } = createService({ ids: ['lock-1', 'lock-2'] })
    service.acquire('workspace-1', { holderId: 'holder-1' })

    service.release('workspace-1', 'lock-1', { holderId: 'holder-1' })
    const nextLease = service.acquire('workspace-1', { holderId: 'holder-2' })

    expect(nextLease.lockId).toBe('lock-2')
    expect(nextLease.holderId).toBe('holder-2')
    expect(service.renew('workspace-1', 'lock-1', { holderId: 'holder-1' })).toBeNull()
    expect(service.validate('workspace-1', {
      lockId: 'lock-2',
      holderId: 'holder-2',
    }).valid).toBe(true)
  })

  test('release pending lock reports the project as available', () => {
    const { service } = createService()
    service.acquire('workspace-1', { holderId: 'holder-1' })

    service.release('workspace-1', 'lock-1', { holderId: 'holder-1' })

    expect(service.getEditState('workspace-1')).toEqual({ status: 'available' })
  })

  test('same holder can renew a release pending lock during the grace period', () => {
    const { service, setNow } = createService()
    service.acquire('workspace-1', { holderId: 'holder-1' })

    service.release('workspace-1', 'lock-1', { holderId: 'holder-1' })
    setNow(1_000 + PAGE_BUILDER_EDIT_LOCK_RELEASE_GRACE_MS - 1)
    const renewed = service.renew('workspace-1', 'lock-1', { holderId: 'holder-1' })

    expect(renewed).toEqual({
      workspaceId: 'workspace-1',
      lockId: 'lock-1',
      holderId: 'holder-1',
      expiresAt: 1_000 + PAGE_BUILDER_EDIT_LOCK_RELEASE_GRACE_MS - 1 + PAGE_BUILDER_EDIT_LOCK_TTL_MS,
      heartbeatIntervalMs: PAGE_BUILDER_EDIT_LOCK_HEARTBEAT_INTERVAL_MS,
    })
    setNow(1_000 + PAGE_BUILDER_EDIT_LOCK_RELEASE_GRACE_MS + 1)

    expect(service.validate('workspace-1', {
      lockId: 'lock-1',
      holderId: 'holder-1',
    }).valid).toBe(true)
  })

  test('release pending lock does not authorize editing operations', () => {
    const { service } = createService()
    service.acquire('workspace-1', { holderId: 'holder-1' })

    service.release('workspace-1', 'lock-1', { holderId: 'holder-1' })
    const status = service.validate('workspace-1', {
      lockId: 'lock-1',
      holderId: 'holder-1',
    })

    expect(status.valid).toBe(false)
    expect(status.lease).toBeNull()
    expect(status.editState).toEqual({ status: 'available' })
    expect(() => service.assertCanEdit('workspace-1', {
      lockId: 'lock-1',
      holderId: 'holder-1',
    })).toThrow(PageBuilderEditLockConflictError)
  })

  test('holder mismatch release is ignored for the current lock holder', () => {
    const { service, setNow } = createService()
    service.acquire('workspace-1', { holderId: 'holder-current' })

    service.release('workspace-1', 'lock-1', { holderId: 'holder-old' })
    setNow(1_000 + PAGE_BUILDER_EDIT_LOCK_RELEASE_GRACE_MS + 1)

    expect(service.validate('workspace-1', {
      lockId: 'lock-1',
      holderId: 'holder-current',
    }).valid).toBe(true)
  })

  test('active Agent work exposes the active session and blocks unrelated acquisition', () => {
    const { service } = createService({ activeAgentSessionId: 'session-active' })

    expect(service.getEditState('workspace-1')).toEqual({
      status: 'locked',
      reason: 'agent',
      activeSessionId: 'session-active',
    })

    expect(() => service.acquire('workspace-1', { holderId: 'holder-1' }))
      .toThrow(PageBuilderEditLockConflictError)

    try {
      service.acquire('workspace-1', { sessionId: 'session-other', holderId: 'holder-1' })
    } catch (error) {
      expect(error).toBeInstanceOf(PageBuilderEditLockConflictError)
      expect((error as PageBuilderEditLockConflictError).editState).toEqual({
        status: 'locked',
        reason: 'agent',
        activeSessionId: 'session-active',
      })
    }
  })

  test('allows reopening the same active Agent session when no other editor lock exists', () => {
    const { service } = createService({ activeAgentSessionId: 'session-active' })

    const lease = service.acquire('workspace-1', {
      sessionId: 'session-active',
      holderId: 'holder-recovered',
    })

    expect(lease).toMatchObject({
      workspaceId: 'workspace-1',
      lockId: 'lock-1',
      holderId: 'holder-recovered',
    })
    expect(service.validate('workspace-1', {
      lockId: 'lock-1',
      holderId: 'holder-recovered',
    }).valid).toBe(true)
  })

  test('replaces a stale same-session lock while recovering the active Agent session', () => {
    const { service } = createService({
      activeAgentSessionId: 'session-active',
      ids: ['lock-old', 'lock-recovered'],
    })
    service.acquire('workspace-1', {
      sessionId: 'session-active',
      holderId: 'holder-old',
    })

    const recovered = service.acquire('workspace-1', {
      sessionId: 'session-active',
      holderId: 'holder-recovered',
    })

    expect(recovered).toMatchObject({
      workspaceId: 'workspace-1',
      lockId: 'lock-recovered',
      holderId: 'holder-recovered',
    })
    expect(service.validate('workspace-1', {
      lockId: 'lock-old',
      holderId: 'holder-old',
    }).valid).toBe(false)
  })

  test('replaces a legacy lock without session ownership while recovering the active Agent session', () => {
    let activeAgentSessionId: string | null = null
    const ids = ['lock-old', 'lock-recovered']
    const service = new PageBuilderEditLockService({
      now: () => 1_000,
      randomUUID: () => ids.shift() ?? 'lock-fallback',
      getWorkspaceActiveAgentSessionId: () => activeAgentSessionId,
      isWorkspaceExportActive: () => false,
    })
    service.acquire('workspace-1', {
      holderId: 'holder-old',
    })

    activeAgentSessionId = 'session-active'
    const recovered = service.acquire('workspace-1', {
      sessionId: 'session-active',
      holderId: 'holder-recovered',
    })

    expect(recovered).toMatchObject({
      workspaceId: 'workspace-1',
      lockId: 'lock-recovered',
      holderId: 'holder-recovered',
    })
    expect(service.validate('workspace-1', {
      lockId: 'lock-old',
      holderId: 'holder-old',
    }).valid).toBe(false)
  })

  test('blocks active Agent recovery when another session owns a valid editor lock', () => {
    const service = new PageBuilderEditLockService({
      now: () => 1_000,
      randomUUID: (() => {
        const ids = ['lock-recovered']
        return () => ids.shift() ?? 'lock-fallback'
      })(),
      getWorkspaceActiveAgentSessionId: () => 'session-active',
      isWorkspaceExportActive: () => false,
      store: {
        get: () => ({
          workspaceId: 'workspace-1',
          lockId: 'lock-other',
          holderId: 'holder-other',
          sessionId: 'session-other',
          acquiredAt: 1_000,
          renewedAt: 1_000,
          expiresAt: 61_000,
        }),
        set: () => {},
        delete: () => {},
      },
    })

    expect(() => service.acquire('workspace-1', {
      sessionId: 'session-active',
      holderId: 'holder-recovered',
    })).toThrow(PageBuilderEditLockConflictError)
  })

  test('active static export marks the workspace busy and blocks acquisition until it finishes', () => {
    let exportActive = true
    const guardedService = new PageBuilderEditLockService({
      now: () => 1_000,
      randomUUID: () => 'lock-1',
      isWorkspaceExportActive: () => exportActive,
    })

    expect(guardedService.getEditState('workspace-1')).toEqual({
      status: 'locked',
      reason: 'export',
    })

    expect(() => guardedService.acquire('workspace-1', { holderId: 'holder-1' }))
      .toThrow(PageBuilderEditLockConflictError)

    exportActive = false
    expect(guardedService.getEditState('workspace-1')).toEqual({ status: 'available' })
    expect(guardedService.acquire('workspace-1', { holderId: 'holder-1' })).toMatchObject({
      workspaceId: 'workspace-1',
      lockId: 'lock-1',
      holderId: 'holder-1',
    })
  })
})
