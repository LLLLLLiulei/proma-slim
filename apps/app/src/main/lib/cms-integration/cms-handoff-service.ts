import { randomUUID as nodeRandomUUID } from 'node:crypto'
import {
  handoffExpired,
  invalidCmsRequest,
} from './cms-integration-errors'

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

export class InMemoryCmsHandoffStore {
  private readonly handoffs = new Map<string, CmsHandoffRecord>()

  get(handoffId: string): CmsHandoffRecord | null {
    const record = this.handoffs.get(handoffId)
    return record ? { ...record, userSummary: record.userSummary ? { ...record.userSummary } : null } : null
  }

  set(record: CmsHandoffRecord): void {
    this.handoffs.set(record.handoffId, {
      ...record,
      userSummary: record.userSummary ? { ...record.userSummary } : null,
    })
  }

  delete(handoffId: string): void {
    this.handoffs.delete(handoffId)
  }

  pruneExpired(now: number): void {
    for (const [handoffId, record] of this.handoffs) {
      if (record.expiresAt <= now) {
        this.handoffs.delete(handoffId)
      }
    }
  }

  clear(): void {
    this.handoffs.clear()
  }
}

export interface CmsHandoffCreateInput {
  projectId: string
  workspaceId: string
  sessionId: string
  target?: unknown
  openMode?: unknown
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
  store?: InMemoryCmsHandoffStore
}

export class CmsHandoffService {
  private readonly now: () => number
  private readonly randomUUID: () => string
  private readonly ttlMs: number
  private readonly store: InMemoryCmsHandoffStore

  constructor(options: CmsHandoffServiceOptions = {}) {
    this.now = options.now ?? Date.now
    this.randomUUID = options.randomUUID ?? nodeRandomUUID
    this.ttlMs = options.ttlMs ?? CMS_HANDOFF_DEFAULT_TTL_MS
    this.store = options.store ?? new InMemoryCmsHandoffStore()
  }

  create(input: CmsHandoffCreateInput): CmsHandoffCreateResult {
    const target = normalizeTarget(input.target)
    const openMode = normalizeOpenMode(input.openMode)
    const now = this.now()
    this.store.pruneExpired(now)
    const record: CmsHandoffRecord = {
      handoffId: this.randomUUID(),
      projectId: normalizeRequiredId(input.projectId),
      workspaceId: normalizeRequiredId(input.workspaceId),
      sessionId: normalizeRequiredId(input.sessionId),
      target,
      openMode,
      userSummary: input.userSummary ? { ...input.userSummary } : null,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    }

    this.store.set(record)

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

  consume(handoffId: string): CmsHandoffConsumedRecord {
    const normalizedHandoffId = normalizeRequiredId(handoffId)
    const record = this.store.get(normalizedHandoffId)
    if (!record) {
      throw handoffExpired()
    }

    const now = this.now()
    if (record.expiresAt <= now) {
      this.store.delete(normalizedHandoffId)
      throw handoffExpired()
    }

    if (record.consumedAt !== undefined) {
      throw handoffExpired()
    }

    const consumed: CmsHandoffConsumedRecord = {
      ...record,
      consumedAt: now,
    }
    this.store.set(consumed)
    return consumed
  }

  peek(handoffId: string): CmsHandoffRecord | null {
    const normalizedHandoffId = normalizeRequiredId(handoffId)
    return this.store.get(normalizedHandoffId)
  }

  get(handoffId: string): CmsHandoffRecord | null {
    const record = this.store.get(handoffId)
    if (!record) {
      return null
    }

    if (record.expiresAt <= this.now()) {
      this.store.delete(handoffId)
      return null
    }

    return record
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
