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
import { pageBuilderStaticExportService } from './page-builder-static-export-service'

export const PAGE_BUILDER_EDIT_LOCK_HEARTBEAT_INTERVAL_MS = 15_000
export const PAGE_BUILDER_EDIT_LOCK_TTL_MS = 60_000
export const PAGE_BUILDER_EDIT_LOCK_RELEASE_GRACE_MS = 5_000

type PageBuilderEditLockConflictCode = 'locked' | 'agent-busy' | 'export-busy' | 'invalid'

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
  getWorkspaceActiveAgentSessionId?: (workspaceId: string) => string | null
  isWorkspaceExportActive?: (workspaceId: string) => boolean
}

export class PageBuilderEditLockService {
  private readonly store: PageBuilderEditLockStore
  private readonly now: () => number
  private readonly randomUUID: () => string
  private readonly getWorkspaceActiveAgentSessionId: (workspaceId: string) => string | null
  private readonly isWorkspaceExportActive: (workspaceId: string) => boolean

  constructor(options: PageBuilderEditLockServiceOptions = {}) {
    this.store = options.store ?? new InMemoryPageBuilderEditLockStore()
    this.now = options.now ?? Date.now
    this.randomUUID = options.randomUUID ?? nodeRandomUUID
    this.getWorkspaceActiveAgentSessionId = options.getWorkspaceActiveAgentSessionId ?? (() => null)
    this.isWorkspaceExportActive = options.isWorkspaceExportActive ?? (() => false)
  }

  acquire(
    workspaceId: string,
    request: PageBuilderEditLockAcquireRequest = {},
  ): PageBuilderEditLockLease {
    const normalizedWorkspaceId = normalizeRequiredId(workspaceId)
    const normalizedSessionId = normalizeOptionalId(request.sessionId)
    const activeSessionId = this.getActiveAgentSessionId(normalizedWorkspaceId)
    const existingLock = this.getBlockingLock(normalizedWorkspaceId)
    if (existingLock) {
      if (
        activeSessionId
        && normalizedSessionId === activeSessionId
        && (existingLock.sessionId === undefined || existingLock.sessionId === activeSessionId)
      ) {
        return this.issueLease(normalizedWorkspaceId, request)
      }

      throw new PageBuilderEditLockConflictError(
        'locked',
        lockToEditState(existingLock),
        '该项目当前有其他编辑会话正在进行，请稍后再试',
      )
    }

    if (activeSessionId && normalizedSessionId !== activeSessionId) {
      throw new PageBuilderEditLockConflictError(
        'agent-busy',
        { status: 'locked', reason: 'agent', activeSessionId },
        '该项目正在由 Agent 处理中，请恢复当前活跃会话',
      )
    }

    if (this.isWorkspaceExportActive(normalizedWorkspaceId)) {
      throw new PageBuilderEditLockConflictError(
        'export-busy',
        { status: 'locked', reason: 'export' },
        '该项目正在导出中，请稍后再试',
      )
    }

    return this.issueLease(normalizedWorkspaceId, request)
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

    const lock = this.getRenewableLock(normalizedWorkspaceId)
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

    const lock = this.getRenewableLock(normalizedWorkspaceId)
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
    const lock = this.getBlockingLock(normalizedWorkspaceId)
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
    const lock = this.getBlockingLock(normalizedWorkspaceId)
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
    const lock = this.getBlockingLock(normalizedWorkspaceId)
    if (lock) {
      return lockToEditState(lock)
    }

    const activeSessionId = this.getActiveAgentSessionId(normalizedWorkspaceId)
    if (activeSessionId) {
      return { status: 'locked', reason: 'agent', activeSessionId }
    }

    if (this.isWorkspaceExportActive(normalizedWorkspaceId)) {
      return { status: 'locked', reason: 'export' }
    }

    return { status: 'available' }
  }

  assertProjectAvailable(workspaceId: string): void {
    const editState = this.getEditState(workspaceId)
    if (editState.status === 'available') {
      return
    }

    throw new PageBuilderEditLockConflictError(
      editState.reason === 'agent' ? 'agent-busy' : editState.reason === 'export' ? 'export-busy' : 'locked',
      editState,
      editState.reason === 'agent'
        ? '该项目正在由 Agent 处理中，请恢复当前活跃会话'
        : editState.reason === 'export'
          ? '该项目正在导出中，请稍后再试'
        : '该项目当前有其他编辑会话正在进行，请稍后再试',
    )
  }

  getActiveAgentSessionId(workspaceId: string): string | null {
    const normalizedWorkspaceId = normalizeRequiredId(workspaceId)
    return normalizeOptionalId(this.getWorkspaceActiveAgentSessionId(normalizedWorkspaceId) ?? undefined) ?? null
  }

  private issueLease(
    normalizedWorkspaceId: string,
    request: PageBuilderEditLockAcquireRequest,
  ): PageBuilderEditLockLease {
    const now = this.now()
    const normalizedSessionId = normalizeOptionalId(request.sessionId)
    const lock: StoredPageBuilderEditLock = {
      workspaceId: normalizedWorkspaceId,
      lockId: this.randomUUID(),
      holderId: normalizeOptionalId(request.holderId) ?? this.randomUUID(),
      ...(normalizedSessionId ? { sessionId: normalizedSessionId } : {}),
      acquiredAt: now,
      renewedAt: now,
      expiresAt: now + PAGE_BUILDER_EDIT_LOCK_TTL_MS,
    }
    this.store.set(lock)
    return lockToLease(lock)
  }

  private getRenewableLock(workspaceId: string): StoredPageBuilderEditLock | null {
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

  private getBlockingLock(workspaceId: string): StoredPageBuilderEditLock | null {
    const lock = this.getRenewableLock(workspaceId)
    if (!lock || lock.releasePendingUntil !== undefined) {
      return null
    }

    return lock
  }
}

export function isPageBuilderWorkspaceAgentActive(workspaceId: string): boolean {
  return getPageBuilderWorkspaceActiveAgentSessionId(workspaceId) !== null
}

export function getPageBuilderWorkspaceActiveAgentSessionId(workspaceId: string): string | null {
  return listAgentSessions().find((session) => (
    session.workspaceId === workspaceId && isAgentSessionActive(session.id)
  ))?.id ?? null
}

export const pageBuilderEditLockService = new PageBuilderEditLockService({
  getWorkspaceActiveAgentSessionId: getPageBuilderWorkspaceActiveAgentSessionId,
  isWorkspaceExportActive: (workspaceId) => pageBuilderStaticExportService.isWorkspaceExportActive(workspaceId),
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
