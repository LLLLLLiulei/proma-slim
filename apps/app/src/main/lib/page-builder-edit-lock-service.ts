import { randomUUID as nodeRandomUUID } from 'node:crypto'
import type {
  PageBuilderEditLockAcquireRequest,
  PageBuilderEditLockCredentials,
  PageBuilderEditLockHolderRequest,
  PageBuilderEditLockLease,
  PageBuilderEditLockStatus,
  PageBuilderProjectEditState,
} from '@ai-page-builder/shared'
import { listAgentSessions } from './agent-session-manager'
import { isAgentSessionActive } from './agent-service'

export const PAGE_BUILDER_EDIT_LOCK_HEARTBEAT_INTERVAL_MS = 15_000
export const PAGE_BUILDER_EDIT_LOCK_TTL_MS = 60_000
export const PAGE_BUILDER_EDIT_LOCK_RELEASE_GRACE_MS = 5_000

type PageBuilderEditLockConflictCode = 'locked' | 'agent-busy' | 'invalid'

interface StoredPageBuilderEditLock {
  workspaceId: string
  lockId: string
  holderId: string
  sessionId?: string
  acquiredAt: number
  renewedAt: number
  expiresAt: number
  releasePendingUntil?: number
}

export interface PageBuilderEditLockStore {
  get(workspaceId: string): StoredPageBuilderEditLock | null
  set(lock: StoredPageBuilderEditLock): void
  delete(workspaceId: string): void
}

export class InMemoryPageBuilderEditLockStore implements PageBuilderEditLockStore {
  private readonly locks = new Map<string, StoredPageBuilderEditLock>()

  get(workspaceId: string): StoredPageBuilderEditLock | null {
    const lock = this.locks.get(workspaceId)
    return lock ? { ...lock } : null
  }

  set(lock: StoredPageBuilderEditLock): void {
    this.locks.set(lock.workspaceId, { ...lock })
  }

  delete(workspaceId: string): void {
    this.locks.delete(workspaceId)
  }
}

export class PageBuilderEditLockConflictError extends Error {
  constructor(
    readonly code: PageBuilderEditLockConflictCode,
    readonly editState: PageBuilderProjectEditState,
    message: string,
  ) {
    super(message)
    this.name = 'PageBuilderEditLockConflictError'
  }
}

interface PageBuilderEditLockServiceOptions {
  store?: PageBuilderEditLockStore
  now?: () => number
  randomUUID?: () => string
  isWorkspaceAgentActive?: (workspaceId: string) => boolean
}

export class PageBuilderEditLockService {
  private readonly store: PageBuilderEditLockStore
  private readonly now: () => number
  private readonly randomUUID: () => string
  private readonly isWorkspaceAgentActive: (workspaceId: string) => boolean

  constructor(options: PageBuilderEditLockServiceOptions = {}) {
    this.store = options.store ?? new InMemoryPageBuilderEditLockStore()
    this.now = options.now ?? Date.now
    this.randomUUID = options.randomUUID ?? nodeRandomUUID
    this.isWorkspaceAgentActive = options.isWorkspaceAgentActive ?? (() => false)
  }

  acquire(
    workspaceId: string,
    request: PageBuilderEditLockAcquireRequest = {},
  ): PageBuilderEditLockLease {
    const normalizedWorkspaceId = normalizeRequiredId(workspaceId)
    const existingLock = this.getValidLock(normalizedWorkspaceId)
    if (existingLock) {
      throw new PageBuilderEditLockConflictError(
        'locked',
        lockToEditState(existingLock),
        '该项目当前有其他编辑会话正在进行，请稍后再试',
      )
    }

    if (this.isWorkspaceAgentActive(normalizedWorkspaceId)) {
      throw new PageBuilderEditLockConflictError(
        'agent-busy',
        { status: 'locked', reason: 'agent' },
        '该项目正在构建中，请稍后再试',
      )
    }

    const now = this.now()
    const lock: StoredPageBuilderEditLock = {
      workspaceId: normalizedWorkspaceId,
      lockId: this.randomUUID(),
      holderId: normalizeOptionalId(request.holderId) ?? this.randomUUID(),
      ...(normalizeOptionalId(request.sessionId) ? { sessionId: normalizeOptionalId(request.sessionId) } : {}),
      acquiredAt: now,
      renewedAt: now,
      expiresAt: now + PAGE_BUILDER_EDIT_LOCK_TTL_MS,
    }
    this.store.set(lock)
    return lockToLease(lock)
  }

  renew(
    workspaceId: string,
    lockId: string,
    request: PageBuilderEditLockHolderRequest,
  ): PageBuilderEditLockLease | null {
    const normalizedWorkspaceId = normalizeRequiredId(workspaceId)
    const normalizedLockId = normalizeRequiredId(lockId)
    const normalizedHolderId = normalizeOptionalId(request.holderId)
    if (!normalizedHolderId) {
      return null
    }

    const lock = this.getValidLock(normalizedWorkspaceId)
    if (!lock || lock.lockId !== normalizedLockId || lock.holderId !== normalizedHolderId) {
      return null
    }

    const now = this.now()
    const renewedLock: StoredPageBuilderEditLock = {
      ...lock,
      renewedAt: now,
      expiresAt: now + PAGE_BUILDER_EDIT_LOCK_TTL_MS,
      releasePendingUntil: undefined,
    }
    this.store.set(renewedLock)
    return lockToLease(renewedLock)
  }

  release(
    workspaceId: string,
    lockId: string,
    request: PageBuilderEditLockHolderRequest,
  ): boolean {
    const normalizedWorkspaceId = normalizeRequiredId(workspaceId)
    const normalizedLockId = normalizeRequiredId(lockId)
    const normalizedHolderId = normalizeOptionalId(request.holderId)
    if (!normalizedHolderId) {
      return false
    }

    const lock = this.getValidLock(normalizedWorkspaceId)
    if (!lock || lock.lockId !== normalizedLockId || lock.holderId !== normalizedHolderId) {
      return false
    }

    this.store.set({
      ...lock,
      releasePendingUntil: this.now() + PAGE_BUILDER_EDIT_LOCK_RELEASE_GRACE_MS,
    })
    return true
  }

  getStatus(workspaceId: string, lockId: string): PageBuilderEditLockStatus {
    const normalizedWorkspaceId = normalizeRequiredId(workspaceId)
    const normalizedLockId = normalizeRequiredId(lockId)
    const lock = this.getValidLock(normalizedWorkspaceId)
    const valid = Boolean(lock && lock.lockId === normalizedLockId)

    return {
      valid,
      lease: valid && lock ? lockToLease(lock) : null,
      editState: this.getEditState(normalizedWorkspaceId),
    }
  }

  validate(
    workspaceId: string,
    credentials: PageBuilderEditLockCredentials,
  ): PageBuilderEditLockStatus {
    const normalizedWorkspaceId = normalizeRequiredId(workspaceId)
    const normalizedLockId = normalizeOptionalId(credentials.lockId)
    const normalizedHolderId = normalizeOptionalId(credentials.holderId)
    const lock = this.getValidLock(normalizedWorkspaceId)
    const valid = Boolean(
      lock
      && lock.lockId === normalizedLockId
      && lock.holderId === normalizedHolderId,
    )

    return {
      valid,
      lease: valid && lock ? lockToLease(lock) : null,
      editState: this.getEditState(normalizedWorkspaceId),
    }
  }

  assertCanEdit(workspaceId: string, credentials: PageBuilderEditLockCredentials): PageBuilderEditLockLease {
    const status = this.validate(workspaceId, credentials)
    if (status.valid && status.lease) {
      return status.lease
    }

    throw new PageBuilderEditLockConflictError(
      'invalid',
      status.editState ?? { status: 'available' },
      '编辑锁已失效，请从首页重新进入编辑',
    )
  }

  getEditState(workspaceId: string): PageBuilderProjectEditState {
    const normalizedWorkspaceId = normalizeRequiredId(workspaceId)
    const lock = this.getValidLock(normalizedWorkspaceId)
    if (lock) {
      return lockToEditState(lock)
    }

    if (this.isWorkspaceAgentActive(normalizedWorkspaceId)) {
      return { status: 'locked', reason: 'agent' }
    }

    return { status: 'available' }
  }

  assertProjectAvailable(workspaceId: string): void {
    const editState = this.getEditState(workspaceId)
    if (editState.status === 'available') {
      return
    }

    throw new PageBuilderEditLockConflictError(
      editState.reason === 'agent' ? 'agent-busy' : 'locked',
      editState,
      editState.reason === 'agent'
        ? '该项目正在构建中，请稍后再试'
        : '该项目当前有其他编辑会话正在进行，请稍后再试',
    )
  }

  private getValidLock(workspaceId: string): StoredPageBuilderEditLock | null {
    const lock = this.store.get(workspaceId)
    if (!lock) {
      return null
    }

    const now = this.now()
    if (lock.expiresAt <= now || (lock.releasePendingUntil !== undefined && lock.releasePendingUntil <= now)) {
      this.store.delete(workspaceId)
      return null
    }

    return lock
  }
}

export function isPageBuilderWorkspaceAgentActive(workspaceId: string): boolean {
  return listAgentSessions().some((session) => (
    session.workspaceId === workspaceId && isAgentSessionActive(session.id)
  ))
}

export const pageBuilderEditLockService = new PageBuilderEditLockService({
  isWorkspaceAgentActive: isPageBuilderWorkspaceAgentActive,
})

function normalizeRequiredId(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('id 不能为空')
  }
  return normalized
}

function normalizeOptionalId(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized || undefined
}

function lockToLease(lock: StoredPageBuilderEditLock): PageBuilderEditLockLease {
  return {
    workspaceId: lock.workspaceId,
    lockId: lock.lockId,
    holderId: lock.holderId,
    expiresAt: lock.expiresAt,
    heartbeatIntervalMs: PAGE_BUILDER_EDIT_LOCK_HEARTBEAT_INTERVAL_MS,
  }
}

function lockToEditState(lock: StoredPageBuilderEditLock): PageBuilderProjectEditState {
  return {
    status: 'locked',
    reason: 'editor',
    expiresAt: lock.expiresAt,
  }
}
