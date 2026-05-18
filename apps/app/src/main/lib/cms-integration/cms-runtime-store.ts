import { join } from 'node:path'
import { getConfigDir } from '../config-paths'
import {
  InMemoryRuntimeTtlStore,
  KeyedAsyncLock,
  createUnstorageFsRuntimeTtlStore,
  type RuntimeTtlStore,
} from '../runtime-store'
import type { BuilderAccessSessionRecord } from './builder-access-session-service'
import type { CmsHandoffRecord } from './cms-handoff-service'

const HANDOFF_PREFIX = 'cms:handoffs:'
const ACCESS_SESSION_PREFIX = 'cms:access-sessions:'

export interface CmsHandoffStore {
  get(handoffId: string): Promise<CmsHandoffRecord | null>
  set(record: CmsHandoffRecord): Promise<void>
  delete(handoffId: string): Promise<void>
  pruneExpired(now: number): Promise<void>
  withHandoffConsumeLock<T>(handoffId: string, callback: () => Promise<T> | T): Promise<T>
  clear(): Promise<void>
}

export interface BuilderAccessSessionStore {
  get(accessId: string): Promise<BuilderAccessSessionRecord | null>
  set(record: BuilderAccessSessionRecord): Promise<void>
  delete(accessId: string): Promise<void>
  pruneExpired(now: number): Promise<void>
  withAccessSessionLock<T>(accessId: string, callback: () => Promise<T> | T): Promise<T>
  clear(): Promise<void>
}

export class RuntimeCmsHandoffStore implements CmsHandoffStore {
  private readonly lock = new KeyedAsyncLock()

  constructor(private readonly store: RuntimeTtlStore) {}

  async get(handoffId: string): Promise<CmsHandoffRecord | null> {
    const record = await this.store.get<unknown>(handoffKey(handoffId))
    if (!isCmsHandoffRecord(record)) {
      if (record !== null) {
        await this.delete(handoffId)
      }
      return null
    }
    return cloneRecord(record)
  }

  async set(record: CmsHandoffRecord): Promise<void> {
    await this.store.set(handoffKey(record.handoffId), cloneRecord(record))
  }

  async delete(handoffId: string): Promise<void> {
    await this.store.delete(handoffKey(handoffId))
  }

  async pruneExpired(now: number): Promise<void> {
    const keys = await this.store.listKeys(HANDOFF_PREFIX)
    await Promise.all(keys.map(async (key) => {
      const record = await this.store.get<unknown>(key)
      if (!isCmsHandoffRecord(record) || record.expiresAt <= now) {
        await this.store.delete(key)
      }
    }))
  }

  async withHandoffConsumeLock<T>(handoffId: string, callback: () => Promise<T> | T): Promise<T> {
    return this.lock.runExclusive(handoffKey(handoffId), callback)
  }

  async clear(): Promise<void> {
    const keys = await this.store.listKeys(HANDOFF_PREFIX)
    await Promise.all(keys.map((key) => this.store.delete(key)))
  }
}

export class RuntimeBuilderAccessSessionStore implements BuilderAccessSessionStore {
  private readonly lock = new KeyedAsyncLock()

  constructor(private readonly store: RuntimeTtlStore) {}

  async get(accessId: string): Promise<BuilderAccessSessionRecord | null> {
    const record = await this.store.get<unknown>(accessSessionKey(accessId))
    if (!isBuilderAccessSessionRecord(record)) {
      if (record !== null) {
        await this.delete(accessId)
      }
      return null
    }
    return cloneRecord(record)
  }

  async set(record: BuilderAccessSessionRecord): Promise<void> {
    await this.store.set(accessSessionKey(record.accessId), cloneRecord(record))
  }

  async delete(accessId: string): Promise<void> {
    await this.store.delete(accessSessionKey(accessId))
  }

  async pruneExpired(now: number): Promise<void> {
    const keys = await this.store.listKeys(ACCESS_SESSION_PREFIX)
    await Promise.all(keys.map(async (key) => {
      const record = await this.store.get<unknown>(key)
      if (!isBuilderAccessSessionRecord(record) || record.expiresAt <= now) {
        await this.store.delete(key)
      }
    }))
  }

  async withAccessSessionLock<T>(accessId: string, callback: () => Promise<T> | T): Promise<T> {
    return this.lock.runExclusive(accessSessionKey(accessId), callback)
  }

  async clear(): Promise<void> {
    const keys = await this.store.listKeys(ACCESS_SESSION_PREFIX)
    await Promise.all(keys.map((key) => this.store.delete(key)))
  }
}

export class InMemoryCmsHandoffStore extends RuntimeCmsHandoffStore {
  constructor() {
    super(new InMemoryRuntimeTtlStore())
  }
}

export class InMemoryBuilderAccessSessionStore extends RuntimeBuilderAccessSessionStore {
  constructor() {
    super(new InMemoryRuntimeTtlStore())
  }
}

export function createCmsHandoffStore(store: RuntimeTtlStore): CmsHandoffStore {
  return new RuntimeCmsHandoffStore(store)
}

export function createBuilderAccessSessionStore(store: RuntimeTtlStore): BuilderAccessSessionStore {
  return new RuntimeBuilderAccessSessionStore(store)
}

export function getCmsRuntimeStoreDir(): string {
  return join(getConfigDir(), 'integrations', 'cms', 'runtime')
}

export function createFileCmsRuntimeStores(baseDir: string = getCmsRuntimeStoreDir()): {
  handoffStore: CmsHandoffStore
  accessSessionStore: BuilderAccessSessionStore
} {
  const runtimeStore = createUnstorageFsRuntimeTtlStore(baseDir)
  return {
    handoffStore: createCmsHandoffStore(runtimeStore),
    accessSessionStore: createBuilderAccessSessionStore(runtimeStore),
  }
}

function handoffKey(handoffId: string): string {
  return `${HANDOFF_PREFIX}${normalizeId(handoffId)}`
}

function accessSessionKey(accessId: string): string {
  return `${ACCESS_SESSION_PREFIX}${normalizeId(accessId)}`
}

function normalizeId(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('cms runtime store id cannot be empty')
  }
  return normalized
}

function isCmsHandoffRecord(value: unknown): value is CmsHandoffRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.handoffId === 'string'
    && typeof record.projectId === 'string'
    && typeof record.workspaceId === 'string'
    && typeof record.sessionId === 'string'
    && (record.target === 'builder' || record.target === 'preview')
    && (record.openMode === 'iframe' || record.openMode === 'window')
    && typeof record.createdAt === 'number'
    && typeof record.expiresAt === 'number'
    && (record.consumedAt === undefined || typeof record.consumedAt === 'number')
}

function isBuilderAccessSessionRecord(value: unknown): value is BuilderAccessSessionRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.accessId === 'string'
    && typeof record.projectId === 'string'
    && typeof record.workspaceId === 'string'
    && typeof record.sessionId === 'string'
    && typeof record.createdAt === 'number'
    && typeof record.expiresAt === 'number'
}

function cloneRecord<T>(record: T): T {
  return structuredClone(record)
}
