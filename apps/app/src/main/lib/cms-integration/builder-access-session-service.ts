import { createHash, randomUUID as nodeRandomUUID } from 'node:crypto'
import type { PageBuilderHostToolbarExtensions } from '@ai-page-builder/shared'
import {
  builderAccessRequired,
} from './cms-integration-errors'
import {
  InMemoryBuilderAccessSessionStore,
  type BuilderAccessSessionStore,
} from './cms-runtime-store'

export {
  InMemoryBuilderAccessSessionStore,
}

export const ACCESS_COOKIE_NAME = 'ai_page_builder_access'
export const ACCESS_SESSION_DEFAULT_TTL_MS = 8 * 60 * 60 * 1000
export const ACCESS_SESSION_RENEW_THRESHOLD_DEFAULT_MS = 60 * 60 * 1000
const SCOPED_ACCESS_COOKIE_PREFIX = `${ACCESS_COOKIE_NAME}_`
const ACCESS_COOKIE_WORKSPACE_HASH_LENGTH = 16

export interface BuilderAccessSessionRecord {
  accessId: string
  projectId: string
  workspaceId: string
  sessionId: string
  createdAt: number
  expiresAt: number
  hostToolbarExtensions: PageBuilderHostToolbarExtensions
  userSummary: {
    userName?: string
    realName?: string
    roleType?: string
    isAdminUser?: boolean
  } | null
}

export interface CreateBuilderAccessSessionInput {
  projectId: string
  workspaceId: string
  sessionId: string
  basePath: string
  isSecure: boolean
  hostToolbarExtensions?: PageBuilderHostToolbarExtensions
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
  renewThresholdMs?: number
  store?: BuilderAccessSessionStore
}

export class BuilderAccessSessionService {
  private readonly now: () => number
  private readonly randomUUID: () => string
  private readonly ttlMs: number
  private readonly renewThresholdMs: number
  private readonly store: BuilderAccessSessionStore

  constructor(options: BuilderAccessSessionServiceOptions = {}) {
    this.now = options.now ?? Date.now
    this.randomUUID = options.randomUUID ?? nodeRandomUUID
    this.ttlMs = options.ttlMs ?? ACCESS_SESSION_DEFAULT_TTL_MS
    this.renewThresholdMs = options.renewThresholdMs ?? ACCESS_SESSION_RENEW_THRESHOLD_DEFAULT_MS
    this.store = options.store ?? new InMemoryBuilderAccessSessionStore()
  }

  async create(input: CreateBuilderAccessSessionInput): Promise<CreateBuilderAccessSessionResult> {
    const now = this.now()
    await this.store.pruneExpired(now)
    const accessId = this.randomUUID()
    const record: BuilderAccessSessionRecord = {
      accessId,
      projectId: normalizeRequiredId(input.projectId),
      workspaceId: normalizeRequiredId(input.workspaceId),
      sessionId: normalizeRequiredId(input.sessionId),
      createdAt: now,
      expiresAt: now + this.ttlMs,
      hostToolbarExtensions: cloneHostToolbarExtensions(input.hostToolbarExtensions),
      userSummary: input.userSummary ? { ...input.userSummary } : null,
    }

    await this.store.set(record)

    return {
      accessId: record.accessId,
      projectId: record.projectId,
      workspaceId: record.workspaceId,
      sessionId: record.sessionId,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      hostToolbarExtensions: cloneHostToolbarExtensions(record.hostToolbarExtensions),
      userSummary: record.userSummary,
      cookie: buildSetCookie(accessId, {
        cookieName: getWorkspaceAccessCookieName(record.workspaceId),
        basePath: input.basePath,
        isSecure: input.isSecure,
        maxAgeMs: this.ttlMs,
      }),
    }
  }

  async readFromCookie(
    cookieInput: string | null | undefined,
    workspaceId?: string,
  ): Promise<BuilderAccessSessionRecord | null> {
    const cookieValue = extractCookieValue(cookieInput, workspaceId)
    if (!cookieValue) {
      return null
    }

    const accessId = parseAccessCookieValue(cookieValue)
    if (!accessId) {
      return null
    }

    return await this.get(accessId)
  }

  async validate(
    cookieInput: string | null | undefined,
    input: {
      workspaceId: string
      sessionId?: string
    },
  ): Promise<BuilderAccessValidationResult> {
    const cookieValue = extractCookieValue(cookieInput, input.workspaceId)
    if (!cookieValue) {
      return { valid: false, code: 'builder_access_required' }
    }

    const accessId = parseAccessCookieValue(cookieValue)
    if (!accessId) {
      return { valid: false, code: 'builder_access_required' }
    }

    const record = await this.get(accessId)
    if (!record) {
      return { valid: false, code: 'builder_access_required' }
    }

    if (record.expiresAt <= this.now()) {
      await this.store.delete(accessId)
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

  async renew(
    accessId: string,
    options: {
      basePath: string
      isSecure: boolean
    },
  ): Promise<RenewBuilderAccessSessionResult | null> {
    const normalizedAccessId = accessId.trim()
    if (!normalizedAccessId) {
      return null
    }

    return this.store.withAccessSessionLock(normalizedAccessId, async () => {
      const record = await this.store.get(normalizedAccessId)
      if (!record) {
        return null
      }

      const now = this.now()
      if (record.expiresAt <= now) {
        await this.store.delete(normalizedAccessId)
        return null
      }

      if (record.expiresAt - now > this.renewThresholdMs) {
        return null
      }

      const renewed: BuilderAccessSessionRecord = {
        ...record,
        expiresAt: now + this.ttlMs,
      }
      await this.store.set(renewed)

      return {
        access: toPublicRecord(renewed),
        cookie: buildSetCookie(renewed.accessId, {
          cookieName: getWorkspaceAccessCookieName(renewed.workspaceId),
          basePath: options.basePath,
          isSecure: options.isSecure,
          maxAgeMs: this.ttlMs,
        }),
      }
    })
  }

  async get(accessId: string): Promise<BuilderAccessSessionRecord | null> {
    const record = await this.store.get(accessId)
    if (!record) {
      return null
    }

    if (record.expiresAt <= this.now()) {
      await this.store.delete(accessId)
      return null
    }

    return toPublicRecord(record)
  }

  async peek(accessId: string): Promise<BuilderAccessSessionRecord | null> {
    return this.get(accessId)
  }

  async delete(accessId: string): Promise<void> {
    const normalizedAccessId = accessId.trim()
    if (normalizedAccessId) {
      await this.store.delete(normalizedAccessId)
    }
  }
}

export function createBuilderAccessSessionService(
  options: BuilderAccessSessionServiceOptions = {},
): BuilderAccessSessionService {
  return new BuilderAccessSessionService(options)
}

const EMPTY_HOST_TOOLBAR_EXTENSIONS: PageBuilderHostToolbarExtensions = { buttons: [] }

function cloneHostToolbarExtensions(
  extensions: PageBuilderHostToolbarExtensions | undefined,
): PageBuilderHostToolbarExtensions {
  return structuredClone(extensions ?? EMPTY_HOST_TOOLBAR_EXTENSIONS)
}

function buildSetCookie(
  cookieValue: string,
  options: {
    cookieName: string
    basePath: string
    isSecure: boolean
    maxAgeMs: number
  },
): string {
  const maxAgeSeconds = Math.max(0, Math.floor(options.maxAgeMs / 1000))
  const path = normalizeCookiePath(options.basePath)
  const attributes = [
    `${options.cookieName}=${cookieValue}`,
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

function extractCookieValue(cookieInput: string | null | undefined, workspaceId?: string): string | null {
  const raw = cookieInput?.trim()
  if (!raw) {
    return null
  }

  const cookies = parseCookiePairs(raw)
  const scopedCookieName = workspaceId?.trim()
    ? getWorkspaceAccessCookieName(workspaceId)
    : null
  if (scopedCookieName) {
    const scoped = findCookieValue(cookies, scopedCookieName)
    if (scoped) {
      return scoped
    }
  }

  const legacy = findCookieValue(cookies, ACCESS_COOKIE_NAME)
  if (legacy) {
    return legacy
  }

  const firstScoped = cookies.find(([name, value]) => name.startsWith(SCOPED_ACCESS_COOKIE_PREFIX) && value)
  return firstScoped?.[1] ?? null
}

function parseCookiePairs(raw: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = []
  for (const part of raw.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const name = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    if (name && value) {
      pairs.push([name, value])
    }
  }

  return pairs
}

function findCookieValue(cookies: Array<[string, string]>, name: string): string | null {
  return cookies.find(([cookieName, value]) => cookieName === name && value)?.[1] ?? null
}

function getWorkspaceAccessCookieName(workspaceId: string): string {
  const normalizedWorkspaceId = normalizeRequiredId(workspaceId)
  const workspaceHash = createHash('sha256')
    .update(normalizedWorkspaceId)
    .digest('base64url')
    .slice(0, ACCESS_COOKIE_WORKSPACE_HASH_LENGTH)
  return `${SCOPED_ACCESS_COOKIE_PREFIX}${workspaceHash}`
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

function toPublicRecord(record: BuilderAccessSessionRecord): BuilderAccessSessionRecord {
  return {
    accessId: record.accessId,
    projectId: record.projectId,
    workspaceId: record.workspaceId,
    sessionId: record.sessionId,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    hostToolbarExtensions: cloneHostToolbarExtensions(record.hostToolbarExtensions),
    userSummary: record.userSummary ? { ...record.userSummary } : null,
  }
}
