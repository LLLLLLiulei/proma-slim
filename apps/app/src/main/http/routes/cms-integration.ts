import { Hono } from 'hono'
import type { AgentSessionMeta, AgentWorkspace, PageBuilderTemplateSummary } from '@ai-page-builder/shared'
import { createAgentSession, getAgentSessionMeta } from '../../lib/agent-session-manager'
import { assertIntegrationSecret } from '../../lib/cms-integration/cms-integration-auth'
import {
  assertCmsIntegrationModeEnabled,
  assertCmsIntegrationSecretConfigured,
  buildCmsIntegrationStatus,
  resolveCmsIntegrationConfig,
} from '../../lib/cms-integration/cms-integration-config'
import {
  buildCmsHandoffOpenUrl,
  normalizeCmsHandoffPublicOrigin,
  resolveCmsHandoffCookieSecure,
} from '../../lib/cms-integration/cms-integration-config-helpers'
import {
  CmsIntegrationError,
  cmsProjectNotFound,
  cmsTemplateImportFailed,
  cmsTemplateImportForbidden,
  cmsTemplateImportInvalid,
  cmsTemplateNotFound,
  cmsTemplateOperationFailed,
  cmsTemplateOperationForbidden,
  cmsTemplateSizeLimit,
  handoffExpired,
  invalidCmsRequest,
  previewNotReady,
  toCmsIntegrationErrorResponse,
} from '../../lib/cms-integration/cms-integration-errors'
import {
  getSharedBuilderAccessSessionService,
  getSharedCmsHandoffService,
  resetCmsIntegrationRuntimeState,
} from '../../lib/cms-integration/cms-integration-runtime'
import type { CmsIntegratedProjectBinding } from '../../lib/cms-integration/cms-project-binding-store'
import { getSharedCmsProjectBindingStore } from '../../lib/cms-integration/cms-project-binding-store'
import { validateCmsLogin } from '../../lib/cms-integration/cms-login-validator'
import { exportCmsProjectStaticPackage } from '../../lib/cms-integration/cms-sync-export-service'
import { createCmsBuilderAccessMiddleware } from '../../lib/cms-integration/cms-builder-access-middleware'
import { deletePageBuilderProject } from '../../lib/page-builder-project-service'
import {
  PageBuilderTemplateServiceError,
  pageBuilderTemplateService,
} from '../../lib/page-builder-template-service'
import { createAgentWorkspace, getAgentWorkspace } from '../../lib/workspace-service'
import { getWorkspacePreviewState } from '../../lib/workspace-preview-service'
import type { HttpAppEnv } from '../types'

interface CmsProjectCreateBody {
  externalRecordId?: unknown
  projectName?: unknown
  siteId?: unknown
  templateId?: unknown
  prompt?: unknown
}

interface CmsHandoffCreateBody {
  target?: unknown
  openMode?: unknown
}

interface CmsSyncExportBody {
  downloadCmsRemoteAssets?: unknown
}

interface CmsTemplateRenameBody {
  name?: unknown
}

interface CmsTemplateBatchDeleteBody {
  templateIds?: unknown
}

export const cmsIntegrationRoutes = new Hono<HttpAppEnv>()

export async function resetCmsIntegrationTestState(): Promise<void> {
  await resetCmsIntegrationRuntimeState()
}

cmsIntegrationRoutes.onError((error) => {
  if (error instanceof CmsIntegrationError) {
    return toCmsIntegrationErrorResponse(error)
  }

  throw error
})

cmsIntegrationRoutes.get('/status', (c) => {
  return c.json(buildCmsIntegrationStatus(resolveCmsIntegrationConfig()))
})

cmsIntegrationRoutes.get('/templates', async (c) => {
  const config = resolveCmsIntegrationConfig()
  assertCmsIntegrationModeEnabled(config)
  assertCmsIntegrationSecretConfigured(config)
  assertIntegrationSecret(c.req.raw, config)

  const publicOrigin = config.publicOrigin
  if (!publicOrigin) {
    throw invalidCmsRequest('AI_PAGE_BUILDER_PUBLIC_ORIGIN 不能为空且必须是合法 origin')
  }

  await validateCmsLogin({
    cmsBaseUrl: config.cmsBaseUrl,
    cmsCookie: c.req.header('x-cms-cookie'),
  })

  const templates = pageBuilderTemplateService.listTemplates({
    name: c.req.query('name'),
  }).templates.map((template) => (
    toCmsTemplateSummary(template, {
      publicOrigin,
      basePath: config.basePath,
    })
  ))

  return c.json({ templates })
})

cmsIntegrationRoutes.post('/templates/import', async (c) => {
  const config = resolveCmsIntegrationConfig()
  assertCmsIntegrationModeEnabled(config)
  assertCmsIntegrationSecretConfigured(config)
  assertIntegrationSecret(c.req.raw, config)

  const publicOrigin = config.publicOrigin
  if (!publicOrigin) {
    throw invalidCmsRequest('AI_PAGE_BUILDER_PUBLIC_ORIGIN 不能为空且必须是合法 origin')
  }

  await validateCmsLogin({
    cmsBaseUrl: config.cmsBaseUrl,
    cmsCookie: c.req.header('x-cms-cookie'),
  })

  const file = await readTemplateImportFile(c.req.raw)
  try {
    const result = await pageBuilderTemplateService.importTemplateZip(file)
    return c.json({
      template: toCmsTemplateSummary(result.template, {
        publicOrigin,
        basePath: config.basePath,
      }),
    }, 201)
  } catch (error) {
    throw mapTemplateServiceErrorToCmsIntegration(error)
  }
})

cmsIntegrationRoutes.patch('/templates/:templateId', async (c) => {
  const config = resolveCmsIntegrationConfig()
  assertCmsIntegrationModeEnabled(config)
  assertCmsIntegrationSecretConfigured(config)
  assertIntegrationSecret(c.req.raw, config)

  const templateId = c.req.param('templateId').trim()
  if (!templateId) {
    throw cmsTemplateNotFound()
  }

  const body = await readOptionalJsonBody<CmsTemplateRenameBody>(c.req.raw)
  const name = readRequiredBodyString(body.name, 'name')
  const publicOrigin = config.publicOrigin
  if (!publicOrigin) {
    throw invalidCmsRequest('AI_PAGE_BUILDER_PUBLIC_ORIGIN 不能为空且必须是合法 origin')
  }

  await validateCmsLogin({
    cmsBaseUrl: config.cmsBaseUrl,
    cmsCookie: c.req.header('x-cms-cookie'),
  })

  try {
    const result = pageBuilderTemplateService.renameTemplate(templateId, { name })
    return c.json({
      template: toCmsTemplateSummary(result.template, {
        publicOrigin,
        basePath: config.basePath,
      }),
    })
  } catch (error) {
    throw mapTemplateServiceErrorToCmsTemplateOperation(error)
  }
})

cmsIntegrationRoutes.post('/templates/batch-delete', async (c) => {
  const config = resolveCmsIntegrationConfig()
  assertCmsIntegrationModeEnabled(config)
  assertCmsIntegrationSecretConfigured(config)
  assertIntegrationSecret(c.req.raw, config)

  const body = await readOptionalJsonBody<CmsTemplateBatchDeleteBody>(c.req.raw)
  const templateIds = readTemplateIds(body.templateIds)

  await validateCmsLogin({
    cmsBaseUrl: config.cmsBaseUrl,
    cmsCookie: c.req.header('x-cms-cookie'),
  })

  const deletedTemplateIds: string[] = []
  const failures: Array<{
    templateId: string
    code: CmsIntegrationError['code']
    error: string
  }> = []

  for (const templateId of templateIds) {
    try {
      pageBuilderTemplateService.deleteTemplate(templateId)
      deletedTemplateIds.push(templateId)
    } catch (error) {
      const mapped = mapTemplateServiceErrorToCmsTemplateOperation(error)
      failures.push({
        templateId,
        code: mapped.code,
        error: mapped.message,
      })
    }
  }

  return c.json({ deletedTemplateIds, failures })
})

cmsIntegrationRoutes.post('/projects', async (c) => {
  const config = resolveCmsIntegrationConfig()
  assertCmsIntegrationModeEnabled(config)
  assertCmsIntegrationSecretConfigured(config)
  assertIntegrationSecret(c.req.raw, config)

  const body = await readProjectCreateBody(c.req.raw)
  const cmsUser = await validateCmsLogin({
    cmsBaseUrl: config.cmsBaseUrl,
    cmsCookie: c.req.header('x-cms-cookie'),
  })

  const store = getSharedCmsProjectBindingStore()
  let createdWorkspaceId: string | null = null

  try {
    const result = await store.createOrGetByExternalRecord({
      externalRecordId: body.externalRecordId,
      projectName: body.projectName,
      siteId: body.siteId,
      ...(body.templateId ? { sourceTemplateId: body.templateId } : {}),
      cmsUser,
    }, () => {
      if (body.templateId) {
        const instantiated = pageBuilderTemplateService.instantiateTemplateProject(body.templateId, {
          projectName: body.projectName,
        })
        createdWorkspaceId = instantiated.workspace.id
        return {
          workspaceId: instantiated.workspace.id,
          primarySessionId: instantiated.session.id,
        }
      }

      const workspace = createAgentWorkspace(body.projectName, { template: 'page-builder' })
      createdWorkspaceId = workspace.id
      const session = createAgentSession(undefined, undefined, workspace.id)
      return {
        workspaceId: workspace.id,
        primarySessionId: session.id,
      }
    }, isBindingInternalResourceAvailable)

    return c.json({
      projectId: result.binding.projectId,
      created: result.created,
      ...(result.binding.sourceTemplateId ? { templateId: result.binding.sourceTemplateId } : {}),
    }, result.created ? 201 : 200)
  } catch (error) {
    if (createdWorkspaceId) {
      cleanupCreatedProject(createdWorkspaceId)
    }
    if (error instanceof CmsIntegrationError) {
      throw error
    }
    if (body.templateId) {
      throw mapTemplateServiceErrorToCmsIntegration(error)
    }
    throw error
  }
})

cmsIntegrationRoutes.post('/projects/:projectId/handoffs', async (c) => {
  const config = resolveCmsIntegrationConfig()
  assertCmsIntegrationModeEnabled(config)
  assertCmsIntegrationSecretConfigured(config)
  assertIntegrationSecret(c.req.raw, config)

  const publicOrigin = normalizeCmsHandoffPublicOrigin(config.publicOrigin)
  if (!publicOrigin) {
    throw invalidCmsRequest('AI_PAGE_BUILDER_PUBLIC_ORIGIN 不能为空且必须是合法 origin')
  }

  const projectId = c.req.param('projectId').trim()
  if (!projectId) {
    throw invalidCmsRequest('projectId 不能为空')
  }

  const body = await readOptionalJsonBody<CmsHandoffCreateBody>(c.req.raw)
  const target = normalizeHandoffTarget(body.target)
  const openMode = normalizeHandoffOpenMode(body.openMode)
  const cmsUser = await validateCmsLogin({
    cmsBaseUrl: config.cmsBaseUrl,
    cmsCookie: c.req.header('x-cms-cookie'),
  })

  const binding = getSharedCmsProjectBindingStore().findByProjectId(projectId)
  if (!binding || !isBindingInternalResourceAvailable(binding)) {
    throw cmsProjectNotFound()
  }

  if (target === 'preview' && !getWorkspacePreviewState(getAgentWorkspace(binding.workspaceId)!).hasPreview) {
    throw previewNotReady()
  }

  const handoffService = getSharedCmsHandoffService(config.handoffTtlMs)

  const created = await handoffService.create({
    projectId: binding.projectId,
    workspaceId: binding.workspaceId,
    sessionId: binding.primarySessionId,
    target,
    openMode,
    userSummary: cmsUser,
  })

  return c.json({
    handoffId: created.handoffId,
    openUrl: buildCmsHandoffOpenUrl({
      publicOrigin,
      basePath: config.basePath,
      handoffId: created.handoffId,
    }),
    expiresAt: created.expiresAt,
    target,
    openMode,
  })
})

cmsIntegrationRoutes.post('/projects/:projectId/export', async (c) => {
  const config = resolveCmsIntegrationConfig()
  assertCmsIntegrationModeEnabled(config)
  assertCmsIntegrationSecretConfigured(config)
  assertIntegrationSecret(c.req.raw, config)

  const projectId = c.req.param('projectId').trim()
  if (!projectId) {
    throw cmsProjectNotFound()
  }

  const body = await readOptionalJsonBody<CmsSyncExportBody>(c.req.raw)
  const downloadCmsRemoteAssets = normalizeOptionalBoolean(body.downloadCmsRemoteAssets, 'downloadCmsRemoteAssets')

  await validateCmsLogin({
    cmsBaseUrl: config.cmsBaseUrl,
    cmsCookie: c.req.header('x-cms-cookie'),
  })

  const artifact = await exportCmsProjectStaticPackage({
    projectId,
    ...(downloadCmsRemoteAssets === undefined ? {} : { downloadCmsRemoteAssets }),
    timeoutMs: config.syncExportTimeoutMs,
  })

  return new Response(Bun.file(artifact.filePath), {
    headers: {
      'cache-control': 'private, no-store',
      'content-disposition': `attachment; filename="${artifact.fallbackFileName}"; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`,
      'content-type': 'application/zip',
    },
  })
})

cmsIntegrationRoutes.get('/handoffs/:handoffId/open', async (c) => {
  const config = resolveCmsIntegrationConfig()
  assertCmsIntegrationModeEnabled(config)

  const handoffId = c.req.param('handoffId').trim()
  if (!handoffId) {
    throw handoffExpired()
  }

  const handoffService = getSharedCmsHandoffService(config.handoffTtlMs)
  const handoff = await handoffService.peek(handoffId)
  if (!handoff) {
    throw new CmsIntegrationError('handoff_expired', 404)
  }

  const accessSessionService = getSharedBuilderAccessSessionService({
    ttlMs: config.accessSessionTtlMs,
    renewThresholdMs: config.accessSessionRenewThresholdMs,
  })
  let createdAccessId: string | null = null
  let accessCookie: string | null = null
  let location: string | null = null

  try {
    await handoffService.consumeWith(handoffId, async (record) => {
      const binding = getSharedCmsProjectBindingStore().findByProjectId(record.projectId)
      if (!binding || !doesBindingMatchSession(binding, record) || !isBindingInternalResourceAvailable(binding)) {
        throw cmsProjectNotFound()
      }

      const access = await accessSessionService.create({
        projectId: record.projectId,
        workspaceId: record.workspaceId,
        sessionId: record.sessionId,
        basePath: config.basePath,
        isSecure: resolveCmsHandoffCookieSecure(
          config.publicOrigin ?? 'http://localhost',
          c.req.header('x-forwarded-proto'),
        ),
        userSummary: record.userSummary,
      })
      createdAccessId = access.accessId
      accessCookie = access.cookie
      location = record.target === 'preview'
        ? withBasePath(config.basePath, `/api/workspaces/${encodeURIComponent(record.workspaceId)}/preview/`)
        : withBasePath(config.basePath, `/builder/${encodeURIComponent(record.workspaceId)}/${encodeURIComponent(record.sessionId)}`)
    })
  } catch (error) {
    if (createdAccessId) {
      await accessSessionService.delete(createdAccessId)
    }
    throw error
  }

  if (!accessCookie || !location) {
    throw handoffExpired()
  }

  return new Response(null, {
    status: 302,
    headers: {
      location,
      'set-cookie': accessCookie,
    },
  })
})

cmsIntegrationRoutes.use('/builder-context', createCmsBuilderAccessMiddleware({
  workspaceId: (c) => readRequiredQuery(c.req.query('workspaceId'), 'workspaceId'),
  sessionId: (c) => readRequiredQuery(c.req.query('sessionId'), 'sessionId'),
  allowDevStandaloneBypass: false,
}))

cmsIntegrationRoutes.get('/builder-context', (c) => {
  const config = resolveCmsIntegrationConfig()
  assertCmsIntegrationModeEnabled(config)

  const access = c.var.cmsBuilderAccess
  const binding = getSharedCmsProjectBindingStore().findByProjectId(access?.projectId ?? '')
  const internals = binding ? resolveBindingInternals(binding) : null
  if (!access || !binding || !doesBindingMatchSession(binding, access) || !internals) {
    throw cmsProjectNotFound()
  }

  return c.json({
    projectId: binding.projectId,
    workspace: toPublicWorkspaceContext(internals.workspace),
    session: toPublicSessionContext(internals.session),
    access: {
      expiresAt: access.expiresAt,
    },
  })
})

function readRequiredQuery(value: string | undefined, fieldName: string): string {
  const normalized = value?.trim() ?? ''
  if (!normalized) {
    throw invalidCmsRequest(`${fieldName} 不能为空`)
  }
  return normalized
}

async function readProjectCreateBody(request: Request): Promise<{
  externalRecordId: string
  projectName: string
  siteId: string
  templateId?: string
}> {
  let parsed: CmsProjectCreateBody
  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('invalid body')
    }
    parsed = body as CmsProjectCreateBody
  } catch {
    throw invalidCmsRequest('请求体必须是合法的 JSON 对象')
  }

  if ('prompt' in parsed) {
    throw invalidCmsRequest('创建 CMS 项目时不支持 prompt 字段')
  }

  return {
    externalRecordId: readRequiredBodyString(parsed.externalRecordId, 'externalRecordId'),
    projectName: readRequiredBodyString(parsed.projectName, 'projectName'),
    siteId: readRequiredBodyString(parsed.siteId, 'siteId'),
    ...('templateId' in parsed ? { templateId: readRequiredBodyString(parsed.templateId, 'templateId') } : {}),
  }
}

async function readOptionalJsonBody<T extends object>(request: Request): Promise<T> {
  if (request.body === null || request.headers.get('content-length') === '0') {
    return {} as T
  }

  try {
    const body = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('invalid body')
    }
    return body as T
  } catch {
    throw invalidCmsRequest('请求体必须是合法的 JSON 对象')
  }
}

function readRequiredBodyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw invalidCmsRequest(`${fieldName} 不能为空`)
  }

  return value.trim()
}

function readTemplateIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw invalidCmsRequest('templateIds 必须是非空数组')
  }

  const result: string[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) {
      throw invalidCmsRequest('templateIds 只能包含非空字符串')
    }

    const templateId = item.trim()
    if (!seen.has(templateId)) {
      seen.add(templateId)
      result.push(templateId)
    }
  }

  if (result.length === 0) {
    throw invalidCmsRequest('templateIds 必须是非空数组')
  }

  return result
}

async function readTemplateImportFile(request: Request): Promise<File> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    throw invalidCmsRequest('请求体必须是合法的 multipart/form-data')
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    throw invalidCmsRequest('请求体必须是合法的 multipart/form-data')
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    throw invalidCmsRequest('multipart 请求缺少 file 字段')
  }

  return file
}

function normalizeHandoffTarget(value: unknown): 'builder' | 'preview' {
  if (value === undefined || value === null) {
    return 'builder'
  }
  if (value === 'builder' || value === 'preview') {
    return value
  }
  throw invalidCmsRequest('target 只能是 builder 或 preview')
}

function normalizeHandoffOpenMode(value: unknown): 'iframe' | 'window' {
  if (value === undefined || value === null) {
    return 'window'
  }
  if (value === 'iframe' || value === 'window') {
    return value
  }
  throw invalidCmsRequest('openMode 只能是 iframe 或 window')
}

function normalizeOptionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value === 'boolean') {
    return value
  }
  throw invalidCmsRequest(`${fieldName} 必须是 boolean`)
}

function withBasePath(basePath: string, pathname: string): string {
  const normalizedBasePath = basePath.trim()
  if (!normalizedBasePath || normalizedBasePath === '/') {
    return pathname
  }

  return `${normalizedBasePath}${pathname.startsWith('/') ? '' : '/'}${pathname}`
}

function buildCmsTemplatePreviewUrl(input: {
  publicOrigin: string
  basePath: string
  templateId: string
}): string {
  return `${input.publicOrigin}${withBasePath(
    input.basePath,
    `/api/page-builder/templates/${encodeURIComponent(input.templateId)}/preview/`,
  )}`
}

function toCmsTemplateSummary<T extends PageBuilderTemplateSummary>(template: T, input: {
  publicOrigin: string
  basePath: string
}): T {
  return {
    ...template,
    previewUrl: buildCmsTemplatePreviewUrl({
      publicOrigin: input.publicOrigin,
      basePath: input.basePath,
      templateId: template.id,
    }),
  }
}

function mapTemplateServiceErrorToCmsIntegration(error: unknown): CmsIntegrationError {
  if (error instanceof PageBuilderTemplateServiceError) {
    if (error.code === 'not-found') {
      return cmsTemplateNotFound(error.message)
    }

    if (error.code === 'size-limit') {
      return cmsTemplateSizeLimit(error.message)
    }

    if (error.code === 'forbidden' || error.code === 'unsafe-file') {
      return cmsTemplateImportForbidden(error.message)
    }

    if (error.code === 'invalid-input' || error.code === 'entry-missing') {
      return cmsTemplateImportInvalid(error.message)
    }

    return cmsTemplateImportFailed(error.message)
  }

  return cmsTemplateImportFailed()
}

function mapTemplateServiceErrorToCmsTemplateOperation(error: unknown): CmsIntegrationError {
  if (error instanceof PageBuilderTemplateServiceError) {
    if (error.code === 'not-found') {
      return cmsTemplateNotFound(error.message)
    }

    if (error.code === 'invalid-input') {
      return invalidCmsRequest(error.message)
    }

    if (error.code === 'forbidden' || error.code === 'unsafe-file') {
      return cmsTemplateOperationForbidden(error.message)
    }

    return cmsTemplateOperationFailed(error.message)
  }

  return cmsTemplateOperationFailed()
}

function isBindingInternalResourceAvailable(binding: CmsIntegratedProjectBinding): boolean {
  return Boolean(resolveBindingInternals(binding))
}

function resolveBindingInternals(binding: CmsIntegratedProjectBinding) {
  const workspace = getAgentWorkspace(binding.workspaceId)
  if (!workspace || workspace.template !== 'page-builder') {
    return null
  }

  const session = getAgentSessionMeta(binding.primarySessionId)
  if (!session || session.workspaceId !== workspace.id) {
    return null
  }

  return { workspace, session }
}

function doesBindingMatchSession(
  binding: CmsIntegratedProjectBinding,
  session: { workspaceId: string; sessionId: string },
): boolean {
  return binding.workspaceId === session.workspaceId && binding.primarySessionId === session.sessionId
}

function toPublicWorkspaceContext(workspace: AgentWorkspace) {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    ...(workspace.template ? { template: workspace.template } : {}),
  }
}

function toPublicSessionContext(session: AgentSessionMeta) {
  return {
    id: session.id,
    title: session.title,
    ...(session.workspaceId ? { workspaceId: session.workspaceId } : {}),
  }
}

function cleanupCreatedProject(workspaceId: string): void {
  try {
    deletePageBuilderProject(workspaceId)
  } catch (error) {
    console.warn('[CMS Integration] 清理未绑定项目失败:', error)
  }
}
