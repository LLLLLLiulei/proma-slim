import { createHmac, randomUUID as nodeRandomUUID, timingSafeEqual } from 'node:crypto'
import {
  builderAccessRequired,
} from './cms-integration-errors'

export const ACCESS_COOKIE_NAME = 'ai_page_builder_access'
export const ACCESS_SESSION_DEFAULT_TTL_MS = 72 * 60 * 60 * 1000
const DEFAULT_SIGNING_SECRET = nodeRandomUUID()

export interface BuilderAccessSessionRecord {
  accessId: string
  projectId: string
  workspaceId: string
  sessionId: string
  createdAt: number
  expiresAt: number
  userSummary: {
    userName?: string
    realName?: string
    roleType?: string
    isAdminUser?: boolean
  } | null
}

interface StoredBuilderAccessSession extends BuilderAccessSessionRecord {
  cookieValue: string
}

export class InMemoryBuilderAccessSessionStore {
  private readonly byAccessId = new Map<string, StoredBuilderAccessSession>()
  private readonly byWorkspaceId = new Map<string, Set<string>>()
  private readonly bySessionId = new Map<string, Set<string>>()

  get(accessId: string): StoredBuilderAccessSession | null {
    const record = this.byAccessId.get(accessId)
    return record ? cloneStoredRecord(record) : null
  }

  set(record: StoredBuilderAccessSession): void {
    this.delete(record.accessId)
    this.byAccessId.set(record.accessId, cloneStoredRecord(record))
    addIndexEntry(this.byWorkspaceId, record.workspaceId, record.accessId)
    addIndexEntry(this.bySessionId, record.sessionId, record.accessId)
  }

  delete(accessId: string): void {
    const existing = this.byAccessId.get(accessId)
    if (!existing) {
      return
    }

    this.byAccessId.delete(accessId)
    removeIndexEntry(this.byWorkspaceId, existing.workspaceId, accessId)
    removeIndexEntry(this.bySessionId, existing.sessionId, accessId)
  }

  pruneExpired(now: number): void {
    for (const [accessId, record] of this.byAccessId) {
      if (record.expiresAt <= now) {
        this.delete(accessId)
      }
    }
  }

  listByWorkspaceId(workspaceId: string): StoredBuilderAccessSession[] {
    return this.getIndexedRecords(this.byWorkspaceId, workspaceId)
  }

  listBySessionId(sessionId: string): StoredBuilderAccessSession[] {
    return this.getIndexedRecords(this.bySessionId, sessionId)
  }

  clear(): void {
    this.byAccessId.clear()
    this.byWorkspaceId.clear()
    this.bySessionId.clear()
  }

  private getIndexedRecords(index: Map<string, Set<string>>, key: string): StoredBuilderAccessSession[] {
    const ids = index.get(key)
    if (!ids) {
      return []
    }

    const records: StoredBuilderAccessSession[] = []
    for (const accessId of ids) {
      const record = this.byAccessId.get(accessId)
      if (record) {
        records.push(cloneStoredRecord(record))
      }
    }

    return records
  }
}

export interface CreateBuilderAccessSessionInput {
  projectId: string
  workspaceId: string
  sessionId: string
  basePath: string
  isSecure: boolean
  userSummary?: BuilderAccessSessionRecord['userSummary']
}

export interface CreateBuilderAccessSessionResult extends BuilderAccessSessionRecord {
  cookie: string
}

export interface RenewBuilderAccessSessionResult {
  access: BuilderAccessSessionRecord
  cookie: string
}

export interface BuilderAccessValidationResult {
  valid: boolean
  code?: 'builder_access_required' | 'builder_access_mismatch'
  access?: BuilderAccessSessionRecord
}

interface BuilderAccessSessionServiceOptions {
  now?: () => number
  randomUUID?: () => string
  ttlMs?: number
  signingSecret?: string
  store?: InMemoryBuilderAccessSessionStore
}

export class BuilderAccessSessionService {
  private readonly now: () => number
  private readonly randomUUID: () => string
  private readonly ttlMs: number
  private readonly signingSecret: string
  private readonly store: InMemoryBuilderAccessSessionStore

  constructor(options: BuilderAccessSessionServiceOptions = {}) {
    this.now = options.now ?? Date.now
    this.randomUUID = options.randomUUID ?? nodeRandomUUID
    this.ttlMs = options.ttlMs ?? ACCESS_SESSION_DEFAULT_TTL_MS
    this.signingSecret = options.signingSecret ?? DEFAULT_SIGNING_SECRET
    this.store = options.store ?? new InMemoryBuilderAccessSessionStore()
  }

  create(input: CreateBuilderAccessSessionInput): CreateBuilderAccessSessionResult {
    const now = this.now()
    this.store.pruneExpired(now)
    const accessId = this.randomUUID()
    const cookieValue = signAccessId(accessId, this.signingSecret)
    const record: StoredBuilderAccessSession = {
      accessId,
      projectId: normalizeRequiredId(input.projectId),
      workspaceId: normalizeRequiredId(input.workspaceId),
      sessionId: normalizeRequiredId(input.sessionId),
      createdAt: now,
      expiresAt: now + this.ttlMs,
      userSummary: input.userSummary ? { ...input.userSummary } : null,
      cookieValue,
    }

    this.store.set(record)

    return {
      accessId: record.accessId,
      projectId: record.projectId,
      workspaceId: record.workspaceId,
      sessionId: record.sessionId,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      userSummary: record.userSummary,
      cookie: buildSetCookie(record.cookieValue, {
        basePath: input.basePath,
        isSecure: input.isSecure,
        maxAgeMs: this.ttlMs,
      }),
    }
  }

  readFromCookie(cookieInput: string | null | undefined): BuilderAccessSessionRecord | null {
    const cookieValue = extractCookieValue(cookieInput)
    if (!cookieValue) {
      return null
    }

    const parsed = parseAccessCookieValue(cookieValue)
    if (!parsed) {
      return null
    }

    const accessId = verifySignedAccessId(parsed, this.signingSecret)
    if (!accessId) {
      return null
    }

    const record = this.get(accessId)
    return record
  }

  validate(
    cookieInput: string | null | undefined,
    input: {
      workspaceId: string
      sessionId?: string
    },
  ): BuilderAccessValidationResult {
    const cookieValue = extractCookieValue(cookieInput)
    if (!cookieValue) {
      return { valid: false, code: 'builder_access_required' }
    }

    const parsed = parseAccessCookieValue(cookieValue)
    if (!parsed) {
      return { valid: false, code: 'builder_access_required' }
    }

    const accessId = verifySignedAccessId(parsed, this.signingSecret)
    if (!accessId) {
      return { valid: false, code: 'builder_access_required' }
    }

    const record = this.get(accessId)
    if (!record) {
      return { valid: false, code: 'builder_access_required' }
    }

    if (record.expiresAt <= this.now()) {
      this.store.delete(accessId)
      return { valid: false, code: 'builder_access_required' }
    }

    if (record.workspaceId !== normalizeRequiredId(input.workspaceId)) {
      return { valid: false, code: 'builder_access_mismatch', access: record }
    }

    const requestedSessionId = normalizeOptionalId(input.sessionId)
    if (requestedSessionId && record.sessionId !== requestedSessionId) {
      return { valid: false, code: 'builder_access_mismatch', access: record }
    }

    return { valid: true, access: record }
  }

  renew(
    accessId: string,
    options: {
      basePath: string
      isSecure: boolean
    },
  ): RenewBuilderAccessSessionResult | null {
    const normalizedAccessId = accessId.trim()
    if (!normalizedAccessId) {
      return null
    }

    const record = this.store.get(normalizedAccessId)
    if (!record) {
      return null
    }

    const now = this.now()
    if (record.expiresAt <= now) {
      this.store.delete(normalizedAccessId)
      return null
    }

    const renewed: StoredBuilderAccessSession = {
      ...record,
      expiresAt: now + this.ttlMs,
    }
    this.store.set(renewed)

    return {
      access: toPublicRecord(renewed),
      cookie: buildSetCookie(renewed.cookieValue, {
        basePath: options.basePath,
        isSecure: options.isSecure,
        maxAgeMs: this.ttlMs,
      }),
    }
  }

  get(accessId: string): BuilderAccessSessionRecord | null {
    const record = this.store.get(accessId)
    if (!record) {
      return null
    }

    if (record.expiresAt <= this.now()) {
      this.store.delete(accessId)
      return null
    }

    return toPublicRecord(record)
  }

  peek(accessId: string): BuilderAccessSessionRecord | null {
    return this.get(accessId)
  }
}

export function createBuilderAccessSessionService(
  options: BuilderAccessSessionServiceOptions = {},
): BuilderAccessSessionService {
  return new BuilderAccessSessionService(options)
}

function signAccessId(accessId: string, signingSecret: string): string {
  const signature = createHmac('sha256', signingSecret).update(accessId).digest('base64url')
  return `${accessId}.${signature}`
}

function verifySignedAccessId(value: string, signingSecret: string): string | null {
  const parts = value.split('.')
  if (parts.length !== 2) {
    return null
  }

  const [accessId, signature] = parts as [string, string]
  if (!accessId || !signature) {
    return null
  }

  const expected = signAccessId(accessId, signingSecret)
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(value)
  if (expectedBuffer.length !== actualBuffer.length) {
    return null
  }

  return timingSafeEqual(expectedBuffer, actualBuffer) ? accessId : null
}

function buildSetCookie(
  cookieValue: string,
  options: {
    basePath: string
    isSecure: boolean
    maxAgeMs: number
  },
): string {
  const maxAgeSeconds = Math.max(0, Math.floor(options.maxAgeMs / 1000))
  const path = normalizeCookiePath(options.basePath)
  const attributes = [
    `${ACCESS_COOKIE_NAME}=${cookieValue}`,
    'HttpOnly',
    'SameSite=Lax',
    `Path=${path}`,
    `Max-Age=${maxAgeSeconds}`,
  ]

  if (options.isSecure) {
    attributes.push('Secure')
  }

  return attributes.join('; ')
}

function normalizeCookiePath(basePath: string): string {
  const normalized = basePath.trim()
  if (!normalized || normalized === '/') {
    return '/'
  }

  return normalized.replace(/\/+$/, '') || '/'
}

function extractCookieValue(cookieInput: string | null | undefined): string | null {
  const raw = cookieInput?.trim()
  if (!raw) {
    return null
  }

  const direct = raw.match(new RegExp(`(?:^|;\\s*)${ACCESS_COOKIE_NAME}=([^;]+)`))
  if (direct?.[1]) {
    return direct[1].trim()
  }

  const firstPart = raw.split(';', 1)[0]?.trim()
  if (firstPart?.startsWith(`${ACCESS_COOKIE_NAME}=`)) {
    return firstPart.slice(`${ACCESS_COOKIE_NAME}=`.length).trim() || null
  }

  return null
}

function parseAccessCookieValue(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeRequiredId(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw builderAccessRequired('访问会话缺少必要标识')
  }

  return normalized
}

function normalizeOptionalId(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized || undefined
}

function cloneStoredRecord(record: StoredBuilderAccessSession): StoredBuilderAccessSession {
  return {
    ...record,
    userSummary: record.userSummary ? { ...record.userSummary } : null,
  }
}

function toPublicRecord(record: StoredBuilderAccessSession): BuilderAccessSessionRecord {
  return {
    accessId: record.accessId,
    projectId: record.projectId,
    workspaceId: record.workspaceId,
    sessionId: record.sessionId,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    userSummary: record.userSummary ? { ...record.userSummary } : null,
  }
}

function addIndexEntry(index: Map<string, Set<string>>, key: string, accessId: string): void {
  const normalizedKey = key.trim()
  if (!normalizedKey) {
    return
  }

  const existing = index.get(normalizedKey) ?? new Set<string>()
  existing.add(accessId)
  index.set(normalizedKey, existing)
}

function removeIndexEntry(index: Map<string, Set<string>>, key: string, accessId: string): void {
  const normalizedKey = key.trim()
  const existing = index.get(normalizedKey)
  if (!existing) {
    return
  }

  existing.delete(accessId)
  if (existing.size === 0) {
    index.delete(normalizedKey)
  }
}
