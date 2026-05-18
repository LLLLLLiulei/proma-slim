import { createStorage, type StorageValue } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'

export interface RuntimeTtlStore {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  listKeys(prefix?: string): Promise<string[]>
}

export class InMemoryRuntimeTtlStore implements RuntimeTtlStore {
  private readonly values = new Map<string, unknown>()

  async get<T>(key: string): Promise<T | null> {
    const value = this.values.get(normalizeKey(key))
    return value === undefined ? null : cloneValue(value) as T
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(normalizeKey(key), cloneValue(value))
  }

  async delete(key: string): Promise<void> {
    this.values.delete(normalizeKey(key))
  }

  async listKeys(prefix = ''): Promise<string[]> {
    const normalizedPrefix = prefix.trim()
    return Array.from(this.values.keys())
      .filter((key) => key.startsWith(normalizedPrefix))
      .sort()
  }

  async clear(): Promise<void> {
    this.values.clear()
  }
}

export class UnstorageFsRuntimeTtlStore implements RuntimeTtlStore {
  private readonly storage: ReturnType<typeof createStorage>

  constructor(baseDir: string) {
    this.storage = createStorage({
      driver: fsDriver({ base: baseDir }),
    })
  }

  async get<T>(key: string): Promise<T | null> {
    return await this.storage.getItem<T>(normalizeKey(key))
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.storage.setItem(normalizeKey(key), value as StorageValue)
  }

  async delete(key: string): Promise<void> {
    await this.storage.removeItem(normalizeKey(key))
  }

  async listKeys(prefix = ''): Promise<string[]> {
    const normalizedPrefix = prefix.trim()
    const keys = await this.storage.getKeys()
    return keys
      .filter((key) => key.startsWith(normalizedPrefix))
      .sort()
  }
}

export class KeyedAsyncLock {
  private readonly tails = new Map<string, Promise<void>>()

  async runExclusive<T>(key: string, callback: () => Promise<T> | T): Promise<T> {
    const normalizedKey = normalizeKey(key)
    const previous = this.tails.get(normalizedKey) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => current, () => current)
    this.tails.set(normalizedKey, tail)

    await previous.catch(() => undefined)
    try {
      return await callback()
    } finally {
      release()
      if (this.tails.get(normalizedKey) === tail) {
        this.tails.delete(normalizedKey)
      }
    }
  }
}

export function createUnstorageFsRuntimeTtlStore(baseDir: string): RuntimeTtlStore {
  return new UnstorageFsRuntimeTtlStore(baseDir)
}

function normalizeKey(key: string): string {
  const normalized = key.trim()
  if (!normalized) {
    throw new Error('runtime store key cannot be empty')
  }
  return normalized
}

function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value
  }
  return structuredClone(value)
}
