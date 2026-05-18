import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  InMemoryRuntimeTtlStore,
  createUnstorageFsRuntimeTtlStore,
} from '../runtime-store'
import {
  createBuilderAccessSessionStore,
  createCmsHandoffStore,
} from './cms-runtime-store'

describe('cms runtime store', () => {
  test('persists handoff records and prunes expired or invalid entries', async () => {
    const runtimeStore = new InMemoryRuntimeTtlStore()
    const handoffs = createCmsHandoffStore(runtimeStore)

    await handoffs.set({
      handoffId: 'handoff-1',
      projectId: 'pbp_1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
      target: 'builder',
      openMode: 'window',
      userSummary: null,
      createdAt: 1000,
      expiresAt: 2000,
    })
    await runtimeStore.set('cms:handoffs:invalid', { handoffId: 123 })

    expect(await handoffs.get('handoff-1')).toMatchObject({ handoffId: 'handoff-1' })
    expect(await handoffs.get('invalid')).toBeNull()

    await handoffs.pruneExpired(2001)
    expect(await handoffs.get('handoff-1')).toBeNull()
  })

  test('persists access session records with accessId as bearer cookie value', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cms-runtime-store-'))
    try {
      const first = createBuilderAccessSessionStore(createUnstorageFsRuntimeTtlStore(dir))
      await first.set({
        accessId: 'access-1',
        projectId: 'pbp_1',
        workspaceId: 'workspace-1',
        sessionId: 'session-1',
        userSummary: { userName: 'cms-user' },
        createdAt: 1000,
        expiresAt: 2000,
      })

      const second = createBuilderAccessSessionStore(createUnstorageFsRuntimeTtlStore(dir))
      const record = await second.get('access-1')
      expect(record).toMatchObject({
        accessId: 'access-1',
        workspaceId: 'workspace-1',
        userSummary: { userName: 'cms-user' },
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('serializes handoff consume and access renewal critical sections by key', async () => {
    const runtimeStore = new InMemoryRuntimeTtlStore()
    const handoffs = createCmsHandoffStore(runtimeStore)
    const accessSessions = createBuilderAccessSessionStore(runtimeStore)
    const events: string[] = []

    await Promise.all([
      handoffs.withHandoffConsumeLock('handoff-1', async () => {
        events.push('handoff-1-start')
        await Promise.resolve()
        events.push('handoff-1-end')
      }),
      handoffs.withHandoffConsumeLock('handoff-1', async () => {
        events.push('handoff-2-start')
        events.push('handoff-2-end')
      }),
      accessSessions.withAccessSessionLock('access-1', async () => {
        events.push('access-1-start')
        await Promise.resolve()
        events.push('access-1-end')
      }),
      accessSessions.withAccessSessionLock('access-1', async () => {
        events.push('access-2-start')
        events.push('access-2-end')
      }),
    ])

    expect(events.indexOf('handoff-1-end')).toBeLessThan(events.indexOf('handoff-2-start'))
    expect(events.indexOf('access-1-end')).toBeLessThan(events.indexOf('access-2-start'))
  })
})
