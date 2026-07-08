import { randomUUID as nodeRandomUUID } from 'node:crypto'
import type { PageBuilderHostToolbarExtensions } from '@ai-page-builder/shared'
import {
  handoffExpired,
  invalidCmsRequest,
} from './cms-integration-errors'
import {
  InMemoryCmsHandoffStore,
  type CmsHandoffStore,
} from './cms-runtime-store'

export {
  InMemoryCmsHandoffStore,
}

export const CMS_HANDOFF_DEFAULT_TTL_MS = 2 * 60 * 1000

export type CmsHandoffTarget = 'builder' | 'preview'
export type CmsHandoffOpenMode = 'iframe' | 'window'

export interface CmsHandoffRecord {
  handoffId: string
  projectId: string
  workspaceId: string
  sessionId: string
  target: CmsHandoffTarget
  openMode: CmsHandoffOpenMode
  hostToolbarExtensions: PageBuilderHostToolbarExtensions
  userSummary: {
    userName?: string
    realName?: string
    roleType?: string
    isAdminUser?: boolean
  } | null
  createdAt: number
  expiresAt: number
  consumedAt?: number
}

export interface CmsHandoffCreateInput {
  projectId: string
  workspaceId: string
  sessionId: string
  target?: unknown
  openMode?: unknown
  hostToolbarExtensions?: PageBuilderHostToolbarExtensions
  userSummary?: CmsHandoffRecord['userSummary']
}

export interface CmsHandoffCreateResult {
  handoffId: string
  target: CmsHandoffTarget
  openMode: CmsHandoffOpenMode
  expiresAt: number
  projectId: string
  workspaceId: string
  sessionId: string
}

export interface CmsHandoffConsumedRecord extends CmsHandoffRecord {
  consumedAt: number
}

interface CmsHandoffServiceOptions {
  now?: () => number
  randomUUID?: () => string
  ttlMs?: number
  store?: CmsHandoffStore
}

export class CmsHandoffService {
  private readonly now: () => number
  private readonly randomUUID: () => string
  private readonly ttlMs: number
  private readonly store: CmsHandoffStore

  constructor(options: CmsHandoffServiceOptions = {}) {
    this.now = options.now ?? Date.now
    this.randomUUID = options.randomUUID ?? nodeRandomUUID
    this.ttlMs = options.ttlMs ?? CMS_HANDOFF_DEFAULT_TTL_MS
    this.store = options.store ?? new InMemoryCmsHandoffStore()
  }

  async create(input: CmsHandoffCreateInput): Promise<CmsHandoffCreateResult> {
    const target = normalizeTarget(input.target)
    const openMode = normalizeOpenMode(input.openMode)
    const now = this.now()
    await this.store.pruneExpired(now)
    const record: CmsHandoffRecord = {
      handoffId: this.randomUUID(),
      projectId: normalizeRequiredId(input.projectId),
      workspaceId: normalizeRequiredId(input.workspaceId),
      sessionId: normalizeRequiredId(input.sessionId),
      target,
      openMode,
      hostToolbarExtensions: cloneHostToolbarExtensions(input.hostToolbarExtensions),
      userSummary: input.userSummary ? { ...input.userSummary } : null,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    }

    await this.store.set(record)

    return {
      handoffId: record.handoffId,
      target: record.target,
      openMode: record.openMode,
      expiresAt: record.expiresAt,
      projectId: record.projectId,
      workspaceId: record.workspaceId,
      sessionId: record.sessionId,
    }
  }

  async consume(handoffId: string): Promise<CmsHandoffConsumedRecord> {
    return this.consumeWith(handoffId, async () => undefined).then(({ consumed }) => consumed)
  }

  async consumeWith<T>(
    handoffId: string,
    callback: (record: CmsHandoffRecord) => Promise<T> | T,
  ): Promise<{ consumed: CmsHandoffConsumedRecord; result: T }> {
    const normalizedHandoffId = normalizeRequiredId(handoffId)
    return this.store.withHandoffConsumeLock(normalizedHandoffId, async () => {
      const record = await this.store.get(normalizedHandoffId)
      if (!record) {
        throw handoffExpired()
      }

      const now = this.now()
      if (record.expiresAt <= now) {
        await this.store.delete(normalizedHandoffId)
        throw handoffExpired()
      }

      if (record.consumedAt !== undefined) {
        throw handoffExpired()
      }

      const result = await callback(cloneHandoffRecord(record))
      const consumed: CmsHandoffConsumedRecord = {
        ...record,
        consumedAt: now,
      }
      await this.store.set(consumed)
      return { consumed, result }
    })
  }

  async peek(handoffId: string): Promise<CmsHandoffRecord | null> {
    const normalizedHandoffId = normalizeRequiredId(handoffId)
    return this.store.get(normalizedHandoffId)
  }

  async get(handoffId: string): Promise<CmsHandoffRecord | null> {
    const record = await this.store.get(handoffId)
    if (!record) {
      return null
    }

    if (record.expiresAt <= this.now()) {
      await this.store.delete(handoffId)
      return null
    }

    return record
  }
}

const EMPTY_HOST_TOOLBAR_EXTENSIONS: PageBuilderHostToolbarExtensions = { buttons: [] }

function cloneHostToolbarExtensions(
  extensions: PageBuilderHostToolbarExtensions | undefined,
): PageBuilderHostToolbarExtensions {
  return structuredClone(extensions ?? EMPTY_HOST_TOOLBAR_EXTENSIONS)
}

function cloneHandoffRecord(record: CmsHandoffRecord): CmsHandoffRecord {
  return {
    ...record,
    hostToolbarExtensions: cloneHostToolbarExtensions(record.hostToolbarExtensions),
    userSummary: record.userSummary ? { ...record.userSummary } : null,
  }
}

export function createCmsHandoffService(options: CmsHandoffServiceOptions = {}): CmsHandoffService {
  return new CmsHandoffService(options)
}

function normalizeRequiredId(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw invalidCmsRequest('id 不能为空')
  }
  return normalized
}

function normalizeTarget(value: unknown): CmsHandoffTarget {
  if (value === undefined || value === null) {
    return 'builder'
  }
  if (value === 'builder' || value === 'preview') {
    return value
  }
  throw invalidCmsRequest('target 只能是 builder 或 preview')
}

function normalizeOpenMode(value: unknown): CmsHandoffOpenMode {
  if (value === undefined || value === null) {
    return 'window'
  }
  if (value === 'iframe' || value === 'window') {
    return value
  }
  throw invalidCmsRequest('openMode 只能是 iframe 或 window')
}
