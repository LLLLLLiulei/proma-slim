import type { PageBuilderEditLockCredentials, PageBuilderEditLockLease } from '@ai-page-builder/shared'

interface StoredPageBuilderEditLock extends PageBuilderEditLockCredentials {
  workspaceId: string
  sessionId: string
  expiresAt: number
  heartbeatIntervalMs: number
}

export function createPageBuilderEditLockHolderId(): string {
  const randomUUID = globalThis.crypto?.randomUUID
  if (typeof randomUUID === 'function') {
    return randomUUID.call(globalThis.crypto)
  }

  return `holder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function readPageBuilderEditLockFragment(hash: string): PageBuilderEditLockCredentials | null {
  const normalized = hash.startsWith('#') ? hash.slice(1) : hash
  if (!normalized) {
    return null
  }

  const params = new URLSearchParams(normalized)
  const lockId = params.get('editLock')?.trim()
  const holderId = params.get('editHolder')?.trim()
  if (!lockId || !holderId) {
    return null
  }

  return { lockId, holderId }
}

export function clearPageBuilderEditLockFragment(): void {
  if (typeof window === 'undefined' || !window.location?.hash) {
    return
  }

  window.history?.replaceState?.(
    null,
    '',
    `${window.location.pathname}${window.location.search}`,
  )
}

export function readStoredPageBuilderEditLock(
  storage: Storage,
  workspaceId: string,
  sessionId: string,
): StoredPageBuilderEditLock | null {
  const raw = storage.getItem(getPageBuilderEditLockStorageKey(workspaceId, sessionId))
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredPageBuilderEditLock>
    if (
      parsed.workspaceId !== workspaceId
      || parsed.sessionId !== sessionId
      || typeof parsed.lockId !== 'string'
      || typeof parsed.holderId !== 'string'
      || typeof parsed.expiresAt !== 'number'
      || typeof parsed.heartbeatIntervalMs !== 'number'
    ) {
      return null
    }

    return {
      workspaceId,
      sessionId,
      lockId: parsed.lockId,
      holderId: parsed.holderId,
      expiresAt: parsed.expiresAt,
      heartbeatIntervalMs: parsed.heartbeatIntervalMs,
    }
  } catch {
    return null
  }
}

export function writeStoredPageBuilderEditLock(
  storage: Storage,
  workspaceId: string,
  sessionId: string,
  lease: PageBuilderEditLockLease,
): void {
  storage.setItem(getPageBuilderEditLockStorageKey(workspaceId, sessionId), JSON.stringify({
    workspaceId,
    sessionId,
    lockId: lease.lockId,
    holderId: lease.holderId,
    expiresAt: lease.expiresAt,
    heartbeatIntervalMs: lease.heartbeatIntervalMs,
  } satisfies StoredPageBuilderEditLock))
}

export function clearStoredPageBuilderEditLock(
  storage: Storage,
  workspaceId: string,
  sessionId: string,
): void {
  storage.removeItem(getPageBuilderEditLockStorageKey(workspaceId, sessionId))
}

function getPageBuilderEditLockStorageKey(workspaceId: string, sessionId: string): string {
  return `proma:page-builder-edit-lock:${workspaceId}:${sessionId}`
}
