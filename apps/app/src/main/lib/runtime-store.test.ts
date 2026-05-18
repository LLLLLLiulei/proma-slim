import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  InMemoryRuntimeTtlStore,
  KeyedAsyncLock,
  createUnstorageFsRuntimeTtlStore,
} from './runtime-store'

describe('runtime store', () => {
  test('memory runtime store supports async get set delete and prefix list', async () => {
    const store = new InMemoryRuntimeTtlStore()

    await store.set('cms:handoffs:1', { value: 1 })
    await store.set('cms:handoffs:2', { value: 2 })
    await store.set('cms:access-sessions:1', { value: 3 })

    expect(await store.get<{ value: number }>('cms:handoffs:1')).toEqual({ value: 1 })
    expect(await store.listKeys('cms:handoffs:')).toEqual([
      'cms:handoffs:1',
      'cms:handoffs:2',
    ])

    await store.delete('cms:handoffs:1')
    expect(await store.get('cms:handoffs:1')).toBeNull()
  })

  test('unstorage fs runtime store persists records across store instances', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'runtime-store-'))
    try {
      const first = createUnstorageFsRuntimeTtlStore(dir)
      await first.set('cms:handoffs:handoff-1', { handoffId: 'handoff-1', expiresAt: 2000 })

      const second = createUnstorageFsRuntimeTtlStore(dir)
      expect(await second.get<{ handoffId: string; expiresAt: number }>('cms:handoffs:handoff-1')).toEqual({
        handoffId: 'handoff-1',
        expiresAt: 2000,
      })
      expect(await second.listKeys('cms:handoffs:')).toEqual(['cms:handoffs:handoff-1'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('keyed async lock serializes work for the same key only', async () => {
    const lock = new KeyedAsyncLock()
    const events: string[] = []

    await Promise.all([
      lock.runExclusive('same', async () => {
        events.push('same-1-start')
        await Promise.resolve()
        events.push('same-1-end')
      }),
      lock.runExclusive('same', async () => {
        events.push('same-2-start')
        events.push('same-2-end')
      }),
      lock.runExclusive('other', async () => {
        events.push('other-start')
        events.push('other-end')
      }),
    ])

    expect(events.indexOf('same-1-end')).toBeLessThan(events.indexOf('same-2-start'))
    expect(events).toContain('other-start')
  })
})
