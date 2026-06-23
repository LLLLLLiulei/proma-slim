import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { getConfigDir } from '../config-paths'
import type { CmsLoginUserSummary } from './cms-login-validator'
import { cmsProjectConflict } from './cms-integration-errors'

export interface CmsIntegratedProjectBinding {
  projectId: string
  workspaceId: string
  primarySessionId: string
  projectName: string
  siteId: string
  externalRecordId: string
  sourceTemplateId?: string
  cmsUserName?: string
  cmsRealName?: string
  createdAt: number
  updatedAt: number
  lastValidatedAt: number
  lastOpenedAt?: number
}

interface CmsProjectBindingIndex {
  version: 1
  projects: CmsIntegratedProjectBinding[]
}

export interface CreateCmsProjectBindingInput {
  externalRecordId: string
  projectName: string
  siteId: string
  sourceTemplateId?: string
  cmsUser: CmsLoginUserSummary
}

export interface CreateCmsProjectInternalsResult {
  workspaceId: string
  primarySessionId: string
}

interface CmsProjectBindingStoreOptions {
  projectsPath?: string
  now?: () => number
  projectIdFactory?: () => string
}

type CreateCmsProjectInternals = () => Promise<CreateCmsProjectInternalsResult> | CreateCmsProjectInternalsResult
type InternalResourceExists = (binding: CmsIntegratedProjectBinding) => boolean

const INDEX_VERSION = 1 as const
const storeByPath = new Map<string, CmsProjectBindingStore>()

export function getCmsProjectBindingPath(): string {
  return join(getConfigDir(), 'integrations', 'cms', 'projects.json')
}

function defaultProjectIdFactory(): string {
  return `pbp_${randomUUID().replace(/-/g, '')}`
}

function createEmptyIndex(): CmsProjectBindingIndex {
  return { version: INDEX_VERSION, projects: [] }
}

function normalizeIndex(value: unknown): CmsProjectBindingIndex {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createEmptyIndex()
  }

  const record = value as { projects?: unknown }
  if (!Array.isArray(record.projects)) {
    return createEmptyIndex()
  }

  return {
    version: INDEX_VERSION,
    projects: record.projects.filter(isBinding),
  }
}

function isBinding(value: unknown): value is CmsIntegratedProjectBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.projectId === 'string'
    && typeof record.workspaceId === 'string'
    && typeof record.primarySessionId === 'string'
    && typeof record.projectName === 'string'
    && typeof record.siteId === 'string'
    && typeof record.externalRecordId === 'string'
    && (record.sourceTemplateId === undefined || typeof record.sourceTemplateId === 'string')
    && typeof record.createdAt === 'number'
    && typeof record.updatedAt === 'number'
    && typeof record.lastValidatedAt === 'number'
}

function readOptionalUserName(user: CmsLoginUserSummary): string | undefined {
  return user.userName?.trim() || undefined
}

function readOptionalRealName(user: CmsLoginUserSummary): string | undefined {
  return user.realName?.trim() || undefined
}

export class CmsProjectBindingStore {
  private readonly projectsPath: string
  private readonly now: () => number
  private readonly projectIdFactory: () => string
  private lock: Promise<void> = Promise.resolve()

  constructor(options: CmsProjectBindingStoreOptions = {}) {
    this.projectsPath = options.projectsPath ?? getCmsProjectBindingPath()
    this.now = options.now ?? Date.now
    this.projectIdFactory = options.projectIdFactory ?? defaultProjectIdFactory
  }

  readAll(): CmsIntegratedProjectBinding[] {
    return this.readIndex().projects
  }

  findByProjectId(projectId: string): CmsIntegratedProjectBinding | null {
    return this.readAll().find((binding) => binding.projectId === projectId) ?? null
  }

  findByExternalRecordId(externalRecordId: string): CmsIntegratedProjectBinding | null {
    return this.readAll().find((binding) => binding.externalRecordId === externalRecordId) ?? null
  }

  async createOrGetByExternalRecord(
    input: CreateCmsProjectBindingInput,
    createInternals: CreateCmsProjectInternals,
    internalResourceExists: InternalResourceExists = () => true,
  ): Promise<{ binding: CmsIntegratedProjectBinding; created: boolean }> {
    return this.withLock(async () => {
      const index = this.readIndex()
      const existing = index.projects.find((binding) => binding.externalRecordId === input.externalRecordId)
      if (existing) {
        this.assertExistingBindingReusable(existing, input, internalResourceExists)
        return { binding: existing, created: false }
      }

      const internals = await createInternals()
      const now = this.now()
      const binding: CmsIntegratedProjectBinding = {
        projectId: this.createUniqueProjectId(index, new Set([internals.workspaceId, internals.primarySessionId])),
        workspaceId: internals.workspaceId,
        primarySessionId: internals.primarySessionId,
        projectName: input.projectName,
        siteId: input.siteId,
        externalRecordId: input.externalRecordId,
        ...(input.sourceTemplateId ? { sourceTemplateId: input.sourceTemplateId } : {}),
        ...(readOptionalUserName(input.cmsUser) ? { cmsUserName: readOptionalUserName(input.cmsUser) } : {}),
        ...(readOptionalRealName(input.cmsUser) ? { cmsRealName: readOptionalRealName(input.cmsUser) } : {}),
        createdAt: now,
        updatedAt: now,
        lastValidatedAt: now,
      }

      index.projects.push(binding)
      this.writeIndex(index)
      return { binding, created: true }
    })
  }

  private async withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    const previous = this.lock
    let release!: () => void
    this.lock = new Promise<void>((resolve) => {
      release = resolve
    })

    await previous
    try {
      return await fn()
    } finally {
      release()
    }
  }

  private readIndex(): CmsProjectBindingIndex {
    if (!existsSync(this.projectsPath)) {
      return createEmptyIndex()
    }

    try {
      return normalizeIndex(JSON.parse(readFileSync(this.projectsPath, 'utf-8')))
    } catch {
      return createEmptyIndex()
    }
  }

  private writeIndex(index: CmsProjectBindingIndex): void {
    mkdirSync(dirname(this.projectsPath), { recursive: true })
    const tempPath = `${this.projectsPath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
    writeFileSync(tempPath, JSON.stringify({ version: INDEX_VERSION, projects: index.projects }, null, 2), 'utf-8')
    renameSync(tempPath, this.projectsPath)
  }

  private createUniqueProjectId(index: CmsProjectBindingIndex, forbiddenIds = new Set<string>()): string {
    const usedIds = new Set(index.projects.map((binding) => binding.projectId))
    let projectId = this.projectIdFactory()
    let attempts = 0
    while (usedIds.has(projectId) || forbiddenIds.has(projectId)) {
      attempts += 1
      if (attempts > 10) {
        projectId = defaultProjectIdFactory()
        if (!usedIds.has(projectId) && !forbiddenIds.has(projectId)) {
          return projectId
        }
      }
      projectId = this.projectIdFactory()
    }
    return projectId
  }

  private assertExistingBindingReusable(
    existing: CmsIntegratedProjectBinding,
    input: CreateCmsProjectBindingInput,
    internalResourceExists: InternalResourceExists,
  ): void {
    if (existing.siteId !== input.siteId) {
      throw cmsProjectConflict()
    }

    if (!internalResourceExists(existing)) {
      throw cmsProjectConflict()
    }

    if (input.sourceTemplateId && existing.sourceTemplateId !== input.sourceTemplateId) {
      throw cmsProjectConflict()
    }
  }
}

export function createCmsProjectBindingStore(options: CmsProjectBindingStoreOptions = {}): CmsProjectBindingStore {
  return new CmsProjectBindingStore(options)
}

export function getSharedCmsProjectBindingStore(): CmsProjectBindingStore {
  const projectsPath = getCmsProjectBindingPath()
  const existing = storeByPath.get(projectsPath)
  if (existing) return existing

  const store = new CmsProjectBindingStore({ projectsPath })
  storeByPath.set(projectsPath, store)
  return store
}
